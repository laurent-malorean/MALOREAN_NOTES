//! Les serveurs MCP extérieurs de la colonne Claude Code, vus depuis l'interface (fiche 0105) :
//! la liste que Claude Code connaît avec les serveurs cochés, cocher et décocher.

use application::ClaudeCode;
use application::use_cases::McpServers;
use domain::external_servers::ServerName;

use super::Session;
use crate::{ApiError, McpServersItem};

impl Session {
    pub(super) fn mcp_servers_use_case(&self) -> McpServers<'_> {
        McpServers::new(
            self.claude
                .as_deref()
                .map(|claude| claude as &dyn ClaudeCode),
            &*self.preferences,
        )
    }

    /// Les serveurs MCP extérieurs que Claude Code connaît, avec leur état et ceux que l'utilisateur
    /// a cochés. La lecture peut durer plus de dix secondes (Claude Code vérifie chaque serveur) :
    /// à ne jamais faire sur le fil principal. Claude Code absent ou pas connecté : une phrase qui
    /// le dit, aucune liste.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] si les préférences ne se lisent pas.
    pub fn mcp_servers(&self) -> Result<McpServersItem, ApiError> {
        Ok(self.mcp_servers_use_case().list()?.into())
    }

    /// Permet le serveur nommé `name` : Claude s'en sert dans la colonne Claude Code dès le message
    /// suivant. Sans effet s'il l'est déjà.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : nom invalide, préférences illisibles ou
    /// impossibles à écrire.
    pub fn allow_mcp_server(&self, name: &str) -> Result<(), ApiError> {
        Ok(self.mcp_servers_use_case().allow(name)?)
    }

    /// Ne permet plus le serveur nommé `name` : Claude ne le voit plus dès le message suivant. Sans
    /// effet s'il n'était pas permis.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : nom invalide, préférences illisibles ou
    /// impossibles à écrire.
    pub fn disallow_mcp_server(&self, name: &str) -> Result<(), ApiError> {
        Ok(self.mcp_servers_use_case().disallow(name)?)
    }

    /// Les serveurs permis, pour un tour.
    pub(super) fn allowed_mcp_servers(&self) -> Result<Vec<ServerName>, ApiError> {
        Ok(self.mcp_servers_use_case().allowed()?)
    }
}
