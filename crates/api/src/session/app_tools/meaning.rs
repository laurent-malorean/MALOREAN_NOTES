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
    /// Pour le CRM ou une fiche d'un CRM : son type de contenu (`crm`, `crm-action`…).
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    content_type: Option<&'static str>,
    /// Pour une fiche d'un CRM : le chemin de son CRM.
    #[serde(skip_serializing_if = "Option::is_none")]
    crm: Option<String>,
}

/// Le nom du type d'un CRM ou d'une de ses fiches ; rien pour le reste.
pub(super) fn crm_type_of(content_type: ContentTypeItem) -> Option<&'static str> {
    let kind = match content_type {
        ContentTypeItem::Crm => CrmKind::Crm,
        ContentTypeItem::CrmCompany => CrmKind::Company,
        ContentTypeItem::CrmPerson => CrmKind::Person,
        ContentTypeItem::CrmAction => CrmKind::Action,
        ContentTypeItem::CrmProject => CrmKind::Project,
        _ => return None,
    };
    Some(kind.name())
}

impl MeaningNote {
    fn of(result: SearchResultItem) -> Self {
        Self {
            path: result.path,
            title: result.title,
            content_type: crm_type_of(result.content_type),
            crm: result
                .container
                .filter(|_| crm_type_of(result.content_type).is_some()),
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
