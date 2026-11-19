//! Commandes de la colonne Claude Code (fiche 0032).

use std::sync::Arc;

use tauri::{AppHandle, Emitter, Runtime};

use super::{SharedSession, in_background};
use crate::{ApiError, ClaudeStatusItem, TurnSettingsItem};

/// Événement envoyé à la page pour chaque événement de Claude d'un tour ; il porte un
/// [`crate::ClaudeEventItem`].
pub const CLAUDE_EVENT: &str = "claude-event";

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

/// Envoie un message à Claude dans l'espace de travail ouvert, avec le modèle et le niveau
/// d'effort choisis (`settings`) ; chaque événement du tour est
/// envoyé à la page dès qu'il arrive ([`CLAUDE_EVENT`]). Rend la main à la fin du tour.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::send_to_claude`].
#[tauri::command]
pub async fn send_to_claude<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
    message: String,
    settings: TurnSettingsItem,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        session.send_to_claude(&message, settings.into(), |event| {
            if let Err(error) = app.emit(CLAUDE_EVENT, event) {
                tracing::warn!(%error, "événement de Claude non transmis à la page");
            }
        })
    })
    .await
}

/// Arrête le tour en cours, s'il y en a un ; ce que Claude a déjà écrit reste écrit.
///
/// # Errors
///
/// Seulement une erreur interne, si le fil d'arrière-plan s'arrête.
#[tauri::command]
pub async fn stop_claude(session: SharedSession<'_>) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        session.stop_claude();
        Ok(())
    })
    .await
}

/// Oublie la conversation en cours : le message suivant en commence une neuve.
///
/// # Errors
///
/// Seulement une erreur interne, si le fil d'arrière-plan s'arrête.
#[tauri::command]
pub async fn new_conversation(session: SharedSession<'_>) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        session.new_conversation();
        Ok(())
    })
    .await
}
