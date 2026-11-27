//! L'outil de l'application qui cherche par le sens (fiches 0040 et 0046) : ce qu'il rend est
//! écrit pour Claude, avec la raison quand le sens manque.

use application::use_cases::MAX_RESULTS;
use domain::crm::CrmKind;
use serde::Serialize;
use serde_json::Value;

use super::{required, written};
use crate::session::Session;
use crate::{ContentTypeItem, MeaningUseItem, SearchResultItem};

/// Combien de notes l'outil rend quand `limit` n'est pas donné.
const DEFAULT_LIMIT: usize = 10;

/// Une note trouvée, telle que Claude la reçoit.
#[derive(Debug, Serialize)]
struct MeaningNote {
    path: String,
    title: String,
    /// Le titre de la section trouvée, puis le début de son texte ; pour une note trouvée par ses
    /// mots, le passage autour d'eux.
    excerpt: String,
    /// Pour le CRM, une fiche d'un CRM, un agenda 12 ou un événement : son type de contenu (`crm`,
    /// `crm-action`, `agenda-12-evenement`…).
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    content_type: Option<&'static str>,
    /// Pour une fiche d'un CRM : le chemin de son CRM.
    #[serde(skip_serializing_if = "Option::is_none")]
    crm: Option<String>,
    /// Pour un événement d'un agenda 12 : le chemin de son agenda 12.
    #[serde(skip_serializing_if = "Option::is_none")]
    agenda: Option<String>,
}

/// Le nom du type d'un CRM, d'une de ses fiches, d'un agenda 12 ou d'un événement ; rien pour le
/// reste.
pub(super) fn typed_name_of(content_type: ContentTypeItem) -> Option<&'static str> {
    let kind = match content_type {
        ContentTypeItem::Crm => CrmKind::Crm,
        ContentTypeItem::CrmCompany => CrmKind::Company,
        ContentTypeItem::CrmPerson => CrmKind::Person,
        ContentTypeItem::CrmAction => CrmKind::Action,
        ContentTypeItem::CrmProject => CrmKind::Project,
        ContentTypeItem::Agenda12 => return Some(domain::ContentType::Agenda12.name()),
        ContentTypeItem::Agenda12Event => return Some(domain::ContentType::Agenda12Event.name()),
        _ => return None,
    };
    Some(kind.name())
}

/// Ce que la fiche d'un CRM ou l'événement d'un agenda 12 a pour conteneur : le chemin de son CRM,
/// et celui de son agenda 12.
fn containers_of(
    content_type: ContentTypeItem,
    container: Option<String>,
) -> (Option<String>, Option<String>) {
    match content_type {
        ContentTypeItem::Agenda12Event => (None, container),
        ContentTypeItem::Agenda12 => (None, None),
        _ => (
            container.filter(|_| typed_name_of(content_type).is_some()),
            None,
        ),
    }
}

impl MeaningNote {
    fn of(result: SearchResultItem) -> Self {
        let (crm, agenda) = containers_of(result.content_type, result.container);
        Self {
            path: result.path,
            title: result.title,
            content_type: typed_name_of(result.content_type),
            crm,
            agenda,
            excerpt: result
                .excerpt
                .iter()
                .map(|part| part.text.as_str())
                .collect(),
        }
    }
}

/// Ce que l'outil rend.
#[derive(Debug, Serialize)]
struct MeaningFound {
    /// Le sens a servi à classer les notes.
    meaning_used: bool,
    /// Pourquoi les mots ont répondu seuls, à dire à l'utilisateur.
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    notes: Vec<MeaningNote>,
}

/// Combien de notes rendre : `limit`, de 1 à [`MAX_RESULTS`], ou [`DEFAULT_LIMIT`] s'il n'est pas
/// donné.
fn limit_of(arguments: &Value) -> Result<usize, String> {
    let limit = &arguments["limit"];
    if limit.is_null() {
        return Ok(DEFAULT_LIMIT);
    }
    limit
        .as_u64()
        .and_then(|limit| usize::try_from(limit).ok())
        .filter(|limit| *limit >= 1)
        .map(|limit| limit.min(MAX_RESULTS))
        .ok_or_else(|| "« limit » est un nombre entier d'au moins 1".to_owned())
}

impl Session {
    /// Les notes les plus proches de la question, par le sens et par les mots ; si le sens
    /// manque, les mots seuls, et la raison.
    pub(super) fn tool_search_by_meaning(&self, arguments: &Value) -> Result<String, String> {
        let question = required(arguments, "question")?;
        let limit = limit_of(arguments)?;
        let searched = self
            .search_notes_with_meaning(question)
            .map_err(|error| error.message)?;
        let reason = match searched.meaning {
            MeaningUseItem::Used => None,
            MeaningUseItem::ModelMissing { message, .. }
            | MeaningUseItem::NotComputed { message, .. }
            | MeaningUseItem::Failed { message } => Some(message),
        };
        written(&MeaningFound {
            meaning_used: reason.is_none(),
            reason,
            notes: searched
                .results
                .into_iter()
                .take(limit)
                .map(MeaningNote::of)
                .collect(),
        })
    }
}
