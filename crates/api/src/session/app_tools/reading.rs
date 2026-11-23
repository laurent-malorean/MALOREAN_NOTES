//! Les outils de l'application qui lisent sans rien changer : chercher avec l'index, lister les
//! modèles de note (fiche 0040).

use std::collections::{HashMap, HashSet};

use application::use_cases::{ListAllNotes, ListNotes, ListTaggedNotes, MAX_RESULTS, SearchNotes};
use domain::search::{ExcerptPart, SearchQuery};
use domain::{ContentType, Folder, NoteOrder, NotePath, NoteSummary};
use serde::Serialize;
use serde_json::Value;

use super::{ToolsTurn, optional, written};
use crate::session::Session;

/// Une note trouvée, telle que Claude la reçoit.
#[derive(Debug, Serialize)]
struct FoundNote {
    path: String,
    title: String,
    folder: String,
    tags: Vec<String>,
    /// Le passage autour des mots cherchés, s'il y en avait.
    #[serde(skip_serializing_if = "Option::is_none")]
    excerpt: Option<String>,
    /// Pour un nœud d'une carte mentale : son chemin dans la carte (`1.0.2`) ; `path` est alors le
    /// fichier de la carte.
    #[serde(skip_serializing_if = "Option::is_none")]
    node: Option<String>,
}

/// Un modèle de note, par son nom (son titre).
#[derive(Debug, Serialize)]
struct TemplateName {
    name: String,
}

/// Les types de contenu cherchés : celui nommé, ou tous ceux d'une note.
fn content_types(arguments: &Value) -> Result<Vec<ContentType>, String> {
    optional(arguments, "content_type").map_or_else(
        || Ok(ContentType::FILES.to_vec()),
        |name| {
            ContentType::FILES
                .into_iter()
                .find(|kind| kind.name() == name)
                .map(|kind| vec![kind])
                .ok_or_else(|| {
                    format!(
                        "type de contenu inconnu : « {name} » ; ceux d'une note : « note », \
                         « cahier-de-recherche », « carte-mentale »"
                    )
                })
        },
    )
}

fn excerpt_text(parts: &[ExcerptPart]) -> String {
    parts
        .iter()
        .map(|part| match part {
            ExcerptPart::Text(text) | ExcerptPart::Match(text) => text.as_str(),
        })
        .collect()
}

/// Les notes qui portent l'étiquette demandée, s'il y en a une.
fn tagged_paths(
    index: &dyn application::NoteIndex,
    arguments: &Value,
) -> Result<Option<HashSet<NotePath>>, application::AppError> {
    let Some(tag) = optional(arguments, "tag") else {
        return Ok(None);
    };
    let notes = ListTaggedNotes::new(index).execute(tag, NoteOrder::Modified)?;
    Ok(Some(notes.iter().map(|note| note.path().clone()).collect()))
}

impl Session {
    /// Les notes qui contiennent les mots cherchés, portent l'étiquette et sont dans le dossier
    /// demandés, parmi les types de contenu demandés ; les plus récentes d'abord.
    pub(super) fn tool_search_notes(&self, arguments: &Value) -> Result<String, String> {
        let index = self.index().map_err(|error| error.message)?;
        let types = content_types(arguments)?;
        let folder = optional(arguments, "folder")
            .map(Folder::parse)
            .transpose()
            .map_err(|_| "dossier invalide".to_owned())?;
        let unavailable = |error: application::AppError| crate::ApiError::from(error).message;
        let tagged = tagged_paths(&*index, arguments).map_err(unavailable)?;
        let excerpts: Option<HashMap<NotePath, String>> =
            match optional(arguments, "query").and_then(SearchQuery::parse) {
                Some(query) => Some(
                    SearchNotes::new(&*index)
                        .among(&types)
                        .execute(&query, NoteOrder::Modified)
                        .map_err(unavailable)?
                        .into_iter()
                        .map(|found| (found.path, excerpt_text(found.excerpt.parts())))
                        .collect(),
                ),
                None => None,
            };
        let kept = |note: &&NoteSummary| {
            types.contains(&note.content_type())
                && folder
                    .as_ref()
                    .is_none_or(|folder| note.path().folder().is_within(folder))
                && tagged
                    .as_ref()
                    .is_none_or(|paths| paths.contains(note.path()))
                && excerpts
                    .as_ref()
                    .is_none_or(|found| found.contains_key(note.path()))
        };
        let all = ListAllNotes::new(&*index).execute().map_err(unavailable)?;
        let found: Vec<FoundNote> = all
            .iter()
            .filter(kept)
            .take(MAX_RESULTS)
            .map(|note| FoundNote {
                path: note.path().to_path(),
                title: note.title().to_owned(),
                folder: note.path().folder().to_path(),
                tags: note.tags().to_vec(),
                excerpt: excerpts
                    .as_ref()
                    .and_then(|found| found.get(note.path()).cloned()),
                node: None,
            })
            .collect();
        let mut found = found;
        found.extend(self.found_nodes(arguments, &*index, folder.as_ref(), tagged.as_ref())?);
        found.truncate(MAX_RESULTS);
        written(&found)
    }

    /// Les nœuds des cartes mentales qui contiennent les mots cherchés, quand aucun type de
    /// contenu n'est demandé : le chemin du fichier de leur carte et leur chemin de nœud
    /// (fiche 0050).
    fn found_nodes(
        &self,
        arguments: &Value,
        index: &dyn application::NoteIndex,
        folder: Option<&Folder>,
        tagged: Option<&HashSet<NotePath>>,
    ) -> Result<Vec<FoundNote>, String> {
        let query = optional(arguments, "query").and_then(SearchQuery::parse);
        let (Some(query), None) = (query, optional(arguments, "content_type")) else {
            return Ok(Vec::new());
        };
        let nodes = SearchNotes::new(index)
            .among(&[ContentType::Node])
            .execute(&query, NoteOrder::Modified)
            .map_err(|error| crate::ApiError::from(error).message)?;
        Ok(nodes
            .into_iter()
            .filter(|node| folder.is_none_or(|folder| node.path.folder().is_within(folder)))
            .filter(|node| tagged.is_none_or(|paths| paths.contains(&node.path)))
            .map(|node| FoundNote {
                folder: node.path.folder().to_path(),
                path: node.path.to_path(),
                title: node.title,
                tags: Vec::new(),
                excerpt: Some(excerpt_text(node.excerpt.parts())),
                node: node.node,
            })
            .collect())
    }

    /// Les noms des modèles de note : les notes directement dans le dossier des modèles du tour.
    pub(super) fn tool_list_templates(&self, turn: &ToolsTurn) -> Result<String, String> {
        let folder = turn.templates.as_ref().ok_or_else(|| {
            "aucun dossier des modèles n'est choisi : l'utilisateur peut en choisir un dans les \
             réglages de MALOREAN Notes"
                .to_owned()
        })?;
        let index = self.index().map_err(|error| error.message)?;
        let templates = ListNotes::new(&*index)
            .execute(folder, NoteOrder::Title)
            .map_err(|error| crate::ApiError::from(error).message)?;
        let names: Vec<TemplateName> = templates
            .iter()
            .map(|template| TemplateName {
                name: template.title().to_owned(),
            })
            .collect();
        written(&names)
    }
}
