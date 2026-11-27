//! Les serveurs MCP extérieurs vus de l'interface (fiche 0105) : la liste de la rubrique « Serveurs
//! MCP » des Réglages, avec l'état de chaque serveur et son choix.

use application::use_cases::ServersListing;
use domain::external_servers::{ListedServer, ServerState};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// L'état d'un serveur, tel que Claude Code le dit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ServerStateItem {
    /// Le serveur répond.
    Connected,
    /// La connexion au service n'est pas faite.
    ToConnect,
    /// Le serveur ne répond pas.
    Failed,
    /// Un serveur coché que Claude Code ne connaît plus.
    NotFound,
}

impl From<ServerState> for ServerStateItem {
    fn from(state: ServerState) -> Self {
        match state {
            ServerState::Connected => Self::Connected,
            ServerState::ToConnect => Self::ToConnect,
            ServerState::Failed => Self::Failed,
            ServerState::NotFound => Self::NotFound,
        }
    }
}

/// Une ligne de la rubrique « Serveurs MCP » : un serveur MCP extérieur.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct McpServerItem {
    /// Son nom, tel que Claude Code le donne : celui que les commandes reçoivent.
    pub name: String,
    /// Son nom montré, sans le préfixe « claude.ai ».
    pub display_name: String,
    /// C'est un connecteur du compte claude.ai (sinon, un serveur ajouté dans le Terminal) :
    /// la phrase d'un serveur « À connecter » n'est pas la même.
    pub connector: bool,
    /// Son état.
    pub state: ServerStateItem,
    /// La case est cochée : Claude peut s'en servir dans la colonne Claude Code.
    pub allowed: bool,
}

impl From<ListedServer> for McpServerItem {
    fn from(line: ListedServer) -> Self {
        Self {
            display_name: line.server.name.display().to_owned(),
            connector: line.server.name.is_connector(),
            name: line.server.name.as_str().to_owned(),
            state: line.server.state.into(),
            allowed: line.allowed,
        }
    }
}

/// Ce que la rubrique « Serveurs MCP » montre.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum McpServersItem {
    /// Les serveurs que Claude Code connaît, triés par nom montré.
    Listed {
        /// Une ligne par serveur.
        servers: Vec<McpServerItem>,
    },
    /// La liste n'a pas pu être lue : une phrase, prête à afficher, qui dit quoi faire.
    Unavailable {
        /// La phrase.
        message: String,
    },
}

impl From<ServersListing> for McpServersItem {
    fn from(listing: ServersListing) -> Self {
        match listing {
            ServersListing::Listed(lines) => Self::Listed {
                servers: lines.into_iter().map(McpServerItem::from).collect(),
            },
            ServersListing::Unavailable(message) => Self::Unavailable { message },
        }
    }
}
