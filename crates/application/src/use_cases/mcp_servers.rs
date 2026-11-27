//! Les serveurs MCP extérieurs de la colonne Claude Code (fiche 0105) : lire la liste que Claude
//! Code connaît, avec les serveurs cochés, permettre ou ne plus permettre un serveur. Le choix est
//! gardé dans les préférences de l'application (les noms seulement), jamais dans l'espace de
//! travail ; il vaut pour tous les espaces. L'application ne connecte rien elle-même.

use domain::external_servers::{ListedServer, ServerName, listed_servers};

use crate::{AppError, ClaudeCode, ClaudeError, ClaudeStatus, Preferences};

/// Ce que la rubrique « Serveurs MCP » montre.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ServersListing {
    /// Les serveurs que Claude Code connaît, triés, chacun coché ou non.
    Listed(Vec<ListedServer>),
    /// La liste n'a pas pu être lue : une phrase, prête à afficher, qui dit quoi faire.
    Unavailable(String),
}

/// Lit, permet et ne permet plus les serveurs MCP extérieurs.
#[derive(Debug)]
pub struct McpServers<'a> {
    claude: Option<&'a dyn ClaudeCode>,
    preferences: &'a dyn Preferences,
}

/// La phrase quand Claude Code n'est pas là ou pas connecté : elle renvoie à la colonne Claude Code.
fn unavailable(status: &ClaudeStatus) -> String {
    match status {
        ClaudeStatus::Missing => {
            "Claude Code n'est pas installé sur ce Mac : voyez la colonne Claude Code, puis cliquez sur « Actualiser »."
        }
        ClaudeStatus::LoggedOut => {
            "Claude Code n'est pas connecté à votre abonnement Claude : connectez-le dans la colonne Claude Code, puis cliquez sur « Actualiser »."
        }
        ClaudeStatus::Ready(_) | ClaudeStatus::Incompatible(_) | ClaudeStatus::Failed => {
            "Claude Code ne répond pas comme prévu : voyez la colonne Claude Code, puis cliquez sur « Actualiser »."
        }
    }
    .to_owned()
}

impl<'a> McpServers<'a> {
    /// Le cas d'usage, branché sur Claude Code (sans lui, Claude Code est dit introuvable) et sur
    /// les préférences de l'application.
    #[must_use]
    pub fn new(claude: Option<&'a dyn ClaudeCode>, preferences: &'a dyn Preferences) -> Self {
        Self {
            claude,
            preferences,
        }
    }

    /// La liste des serveurs MCP extérieurs que Claude Code connaît, avec ceux que l'utilisateur
    /// a cochés ; un serveur coché que Claude Code ne connaît plus y reste, « introuvable ». La
    /// lecture peut durer plus de dix secondes : à ne jamais faire sur le fil principal. Claude
    /// Code absent, pas connecté ou muet : une phrase qui le dit, aucune liste.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si les préférences ne se lisent pas.
    pub fn list(&self) -> Result<ServersListing, AppError> {
        let allowed = self.preferences.allowed_servers()?;
        let Some(claude) = self.claude else {
            return Ok(ServersListing::Unavailable(unavailable(
                &ClaudeStatus::Missing,
            )));
        };
        let status = claude.status();
        if !matches!(status, ClaudeStatus::Ready(_)) {
            return Ok(ServersListing::Unavailable(unavailable(&status)));
        }
        Ok(match claude.external_servers() {
            Ok(known) => ServersListing::Listed(listed_servers(known, &allowed)),
            Err(ClaudeError::Missing) => {
                ServersListing::Unavailable(unavailable(&ClaudeStatus::Missing))
            }
            Err(error) => ServersListing::Unavailable(format!(
                "Claude Code n'a pas donné la liste de ses serveurs MCP : {error}. Cliquez sur « Actualiser »."
            )),
        })
    }

    /// Les serveurs que l'utilisateur a permis ; aucun tant qu'il n'en a pas coché.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si les préférences ne se lisent pas.
    pub fn allowed(&self) -> Result<Vec<ServerName>, AppError> {
        Ok(self.preferences.allowed_servers()?)
    }

    /// Permet le serveur nommé `name` : Claude peut se servir de tous ses outils dès le message
    /// suivant. Sans effet s'il l'est déjà.
    ///
    /// # Errors
    ///
    /// [`AppError::InvalidServerName`] si `name` n'est pas un nom de serveur,
    /// [`AppError::StorageUnavailable`] si les préférences ne se lisent ou ne s'écrivent pas.
    pub fn allow(&self, name: &str) -> Result<(), AppError> {
        let name = parsed(name)?;
        let mut allowed = self.preferences.allowed_servers()?;
        if allowed.contains(&name) {
            return Ok(());
        }
        allowed.push(name);
        Ok(self.preferences.save_allowed_servers(&allowed)?)
    }

    /// Ne permet plus le serveur nommé `name` : Claude ne le voit plus dès le message suivant.
    /// Sans effet s'il n'était pas permis.
    ///
    /// # Errors
    ///
    /// [`AppError::InvalidServerName`] si `name` n'est pas un nom de serveur,
    /// [`AppError::StorageUnavailable`] si les préférences ne se lisent ou ne s'écrivent pas.
    pub fn disallow(&self, name: &str) -> Result<(), AppError> {
        let name = parsed(name)?;
        let allowed = self.preferences.allowed_servers()?;
        if !allowed.contains(&name) {
            return Ok(());
        }
        let remaining: Vec<ServerName> = allowed.into_iter().filter(|kept| *kept != name).collect();
        Ok(self.preferences.save_allowed_servers(&remaining)?)
    }
}

fn parsed(name: &str) -> Result<ServerName, AppError> {
    ServerName::new(name).ok_or_else(|| AppError::InvalidServerName(name.trim().to_owned()))
}

#[cfg(test)]
#[path = "mcp_servers_tests.rs"]
mod tests;
