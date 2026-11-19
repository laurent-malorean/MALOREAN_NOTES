//! Commandes de la colonne Claude Code (fiche 0032).

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{ApiError, ClaudeStatusItem};

/// Si Claude Code peut répondre, sinon pourquoi et quoi faire ; le modèle n'est pas appelé.
///
/// # Errors
///
/// Seulement une erreur interne, si le fil d'arrière-plan s'arrête.
#[tauri::command]
pub async fn claude_status(session: SharedSession<'_>) -> Result<ClaudeStatusItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || Ok(session.claude_status())).await
}
