//! Le type de contenu d'un élément de l'index, tel que l'interface le reçoit.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Le type de contenu d'un élément de l'index.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ContentTypeItem {
    /// Une note.
    Note,
    /// Un cahier de recherche.
    ResearchNotebook,
    /// Une carte mentale.
    MindMap,
    /// Un canvas.
    Canvas,
    /// Une entrée d'un cahier de recherche.
    Entry,
    /// Un nœud d'une carte mentale.
    Node,
    /// Un CRM.
    Crm,
    /// Une entreprise d'un CRM.
    CrmCompany,
    /// Une personne d'un CRM.
    CrmPerson,
    /// Une action d'un CRM.
    CrmAction,
    /// Un projet d'un CRM.
    CrmProject,
}

impl From<domain::ContentType> for ContentTypeItem {
    fn from(content_type: domain::ContentType) -> Self {
        match content_type {
            domain::ContentType::Note => Self::Note,
            domain::ContentType::ResearchNotebook => Self::ResearchNotebook,
            domain::ContentType::MindMap => Self::MindMap,
            domain::ContentType::Canvas => Self::Canvas,
            domain::ContentType::Entry => Self::Entry,
            domain::ContentType::Node => Self::Node,
            domain::ContentType::Crm => Self::Crm,
            domain::ContentType::CrmCompany => Self::CrmCompany,
            domain::ContentType::CrmPerson => Self::CrmPerson,
            domain::ContentType::CrmAction => Self::CrmAction,
            domain::ContentType::CrmProject => Self::CrmProject,
        }
    }
}
