//! Les outils de l'application qui lisent sans rien changer : chercher avec l'index, lister les
//! modèles de note (fiche 0040).

use std::collections::{HashMap, HashSet};

use application::use_cases::{
    ListAllNotes, ListNotes, ListTaggedNotes, MAX_RESULTS, ReadNoteText, SearchNotes,
};
use domain::crm::CrmKind;
use domain::reading::MAX_READ_CHARACTERS;
use domain::search::{ExcerptPart, SearchQuery};
use domain::{ContentType, Folder, NoteOrder, NotePath, NoteSummary};
use serde::Serialize;
use serde_json::Value;

use super::{optional, required, written};
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
    /// Le nombre d'occurrences des mots cherchés dans le texte entier de la note (à l'intérieur
    /// des mots aussi), s'il y avait des mots cherchés (fiche 0086).
    #[serde(skip_serializing_if = "Option::is_none")]
    matches: Option<usize>,
    /// Pour le CRM ou une fiche d'un CRM : son type de contenu (`crm`, `crm-action`…).
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    content_type: Option<&'static str>,
    /// Pour une fiche d'un CRM : le chemin de son CRM.
    #[serde(skip_serializing_if = "Option::is_none")]
    crm: Option<String>,
    /// Pour un nœud d'une carte mentale : son chemin dans la carte (`1.0.2`) ; `path` est alors le
    /// fichier de la carte.
    #[serde(skip_serializing_if = "Option::is_none")]
    node: Option<String>,
}

/// Une note dont un lien désigne la note demandée, telle que Claude la reçoit.
#[derive(Debug, Serialize)]
struct LinkingNote {
    path: String,
    title: String,
    folder: String,
    /// Pour une fiche d'un CRM : son type de contenu (`crm-action`…).
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    content_type: Option<&'static str>,
    /// Pour une fiche d'un CRM : le chemin de son CRM.
    #[serde(skip_serializing_if = "Option::is_none")]
    crm: Option<String>,
}

/// Le texte d'une note simple, tel que Claude le reçoit (fiche 0076) : `header` suivi de `body`
/// redonne le fichier à l'identique.
#[derive(Debug, Serialize)]
struct NoteText {
    path: String,
    title: String,
    /// L'en-tête tel qu'il est écrit, ses lignes `---` comprises ; vide sans en-tête.
    header: String,
    body: String,
    /// Le nombre de caractères du corps entier.
    characters: usize,
    /// Le corps a été coupé : sa fin n'est pas dans `body`.
    truncated: bool,
    /// Pourquoi et de combien le corps est coupé, dit à Claude ; rien s'il ne l'est pas.
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
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
                    let crm_types = CrmKind::ALL
                        .map(|kind| format!("« {} »", kind.name()))
                        .join(", ");
                    format!(
                        "type de contenu inconnu : « {name} » ; ceux d'une note : « note », \
                         « cahier-de-recherche », « carte-mentale », {crm_types}"
                    )
                })
        },
    )
}

/// Le nom du type de contenu d'un CRM ou de l'une de ses fiches ; rien pour le reste.
fn crm_type_of(content_type: ContentType) -> Option<&'static str> {
    content_type.crm_kind().map(|_| content_type.name())
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

/// Pour chaque note qui contient tous les mots de `query`, parmi les types demandés : son
/// extrait et son nombre d'occurrences.
fn found_by_words(
    index: &dyn application::NoteIndex,
    query: &SearchQuery,
    types: &[ContentType],
) -> Result<HashMap<NotePath, (String, Option<usize>)>, application::AppError> {
    Ok(SearchNotes::new(index)
        .among(types)
        .execute(query, NoteOrder::Modified)?
        .into_iter()
        .map(|found| {
            (
                found.path,
                (excerpt_text(found.excerpt.parts()), found.matches),
            )
        })
        .collect())
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
        let excerpts = optional(arguments, "query")
            .and_then(SearchQuery::parse)
            .map(|query| found_by_words(&*index, &query, &types).map_err(unavailable))
            .transpose()?;
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
                    .and_then(|found| found.get(note.path()).map(|(excerpt, _)| excerpt.clone())),
                matches: excerpts
                    .as_ref()
                    .and_then(|found| found.get(note.path()).and_then(|(_, matches)| *matches)),
                content_type: crm_type_of(note.content_type()),
                crm: note.container().map(NotePath::to_path),
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
                matches: node.matches,
                content_type: None,
                crm: None,
                node: node.node,
            })
            .collect())
    }

    /// Les notes dont un lien désigne la note `path` ; pour une fiche d'un CRM, son type et son
    /// CRM.
    pub(super) fn tool_linking_notes(&self, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        let linking = self.list_backlinks(path).map_err(|error| error.message)?;
        written(
            &linking
                .into_iter()
                .map(|note| LinkingNote {
                    content_type: note.content_type.and_then(super::meaning::crm_type_of),
                    path: note.path,
                    title: note.title,
                    folder: note.folder,
                    crm: note.crm,
                })
                .collect::<Vec<_>>(),
        )
    }

    /// Le texte entier d'une note simple, son en-tête à part du corps ; le corps est coupé, et la
    /// réponse le dit, au-delà de [`MAX_READ_CHARACTERS`] caractères (fiche 0076).
    pub(super) fn tool_read_note(&self, arguments: &Value) -> Result<String, String> {
        let said = |error: crate::ApiError| error.message;
        let path = NotePath::parse(required(arguments, "path")?)
            .map_err(crate::ApiError::from)
            .map_err(said)?;
        let store = self.store().map_err(said)?;
        let read = ReadNoteText::new(&*store)
            .execute(&path)
            .map_err(crate::ApiError::from)
            .map_err(said)?;
        let (shown, entire) = (read.text.body.chars().count(), read.text.characters);
        written(&NoteText {
            path: path.to_path(),
            title: read.title,
            header: read.text.header,
            body: read.text.body,
            characters: entire,
            truncated: read.text.truncated,
            message: read.text.truncated.then(|| {
                format!(
                    "le corps de la note est coupé : {shown} caractères sur {entire} sont donnés \
                     (la limite est de {MAX_READ_CHARACTERS}, coupée à la fin d'une ligne) ; la \
                     suite ne se lit pas avec cet outil : cherchez-la avec search_notes, qui donne \
                     des extraits"
                )
            }),
        })
    }

    /// Le dossier des modèles de l'espace visé, relu dans les préférences (fiche 0077) ; une erreur
    /// dite à l'IA, avec le nom de l'espace, si l'utilisateur n'en a pas choisi.
    pub(super) fn chosen_templates_folder(&self) -> Result<Folder, String> {
        let said = |error: crate::ApiError| error.message;
        let workspace = self.opened().map_err(said)?.name;
        self.templates_folder().map_err(said)?.ok_or_else(|| {
            format!(
                "aucun dossier des modèles n'est choisi pour l'espace de travail « {} » : \
                 l'utilisateur peut en choisir un dans les Réglages de MALOREAN Notes, onglet \
                 « Écriture »",
                workspace.as_str()
            )
        })
    }

    /// Les noms des modèles de note : les notes directement dans le dossier des modèles de
    /// l'espace visé.
    pub(super) fn tool_list_templates(&self) -> Result<String, String> {
        let folder = &self.chosen_templates_folder()?;
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
