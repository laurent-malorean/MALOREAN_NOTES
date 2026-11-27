//! Commandes des serveurs MCP extérieurs de la colonne Claude Code (fiche 0105) : la liste que
//! Claude Code connaît, cocher et décocher un serveur.

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{ApiError, McpServersItem};

/// Les serveurs MCP extérieurs que Claude Code connaît, avec leur état et ceux que l'utilisateur a
/// cochés. La lecture peut durer plus de dix secondes : l'interface affiche « Lecture des serveurs
/// de Claude Code… » pendant ce temps. Claude Code absent ou pas connecté : `kind: "unavailable"`
/// et une phrase prête à afficher.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::mcp_servers`].
#[tauri::command]
pub async fn list_mcp_servers(session: SharedSession<'_>) -> Result<McpServersItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.mcp_servers()).await
}

/// Coche le serveur nommé `name` : Claude s'en sert dès le message suivant.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::allow_mcp_server`].
#[tauri::command]
pub async fn allow_mcp_server(session: SharedSession<'_>, name: String) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.allow_mcp_server(&name)).await
}

/// Décoche le serveur nommé `name` : Claude ne le voit plus dès le message suivant.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::disallow_mcp_server`].
#[tauri::command]
pub async fn disallow_mcp_server(session: SharedSession<'_>, name: String) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.disallow_mcp_server(&name)).await
}
