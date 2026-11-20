//! Commandes de la colonne Claude Code (fiche 0032).

use std::sync::Arc;

use tauri::{AppHandle, Emitter, Runtime};

use super::{SharedSession, in_background};
use crate::dto::{continued_conversation, turn_settings};
use crate::{ApiError, ClaudeStatusItem, TurnSettingsItem};

/// Événement envoyé à l'interface pour chaque événement de Claude d'un tour ; il porte un
/// [`crate::ClaudeEventItem`].
pub const CLAUDE_EVENT: &str = "claude-event";

/// Événement envoyé à l'interface pendant une connexion de Claude Code : il porte l'adresse de la
/// page de connexion, à montrer si le navigateur ne s'est pas ouvert.
pub const CLAUDE_SIGN_IN: &str = "claude-sign-in";

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

/// Envoie un message à Claude dans l'espace de travail ouvert, en continuant `conversation` (celle
/// de l'onglet de conversation, gardée de son début ; rien en commence une neuve), avec le modèle
/// et le niveau d'effort choisis (`settings`) ; ses créations et modifications après une lecture du web sont
/// retenues, sauf si `changes_allowed` (l'utilisateur les autorise pour ce tour). Claude a aussi les
/// outils de l'application, avec `templates` (le dossier des modèles de l'espace de travail, s'il
/// y en a un) pour lister les modèles de note et en tirer une note (fiche 0040). Chaque événement
/// du tour est envoyé à l'interface dès qu'il arrive ([`CLAUDE_EVENT`]). Rend la main à la fin du tour.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::send_to_claude`] ; une
/// conversation dont l'identifiant ne ressemble pas à ceux de Claude Code est dite inconnue.
#[tauri::command]
#[expect(
    clippy::too_many_arguments,
    reason = "deux des paramètres sont donnés par Tauri (l'application, la session), pas par l'interface"
)]
pub async fn send_to_claude<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
    message: String,
    conversation: Option<String>,
    settings: TurnSettingsItem,
    changes_allowed: bool,
    templates: Option<String>,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    let conversation = continued_conversation(conversation)?;
    in_background(move || {
        session.send_to_claude(
            &message,
            conversation.as_ref(),
            turn_settings(settings, changes_allowed),
            templates.as_deref(),
            |event| {
                if let Err(error) = app.emit(CLAUDE_EVENT, event) {
                    tracing::warn!(%error, "événement de Claude non transmis à l'interface");
                }
            },
        )
    })
    .await
}

/// Déconnecte Claude Code de son compte Claude, pour tout le Mac (Terminal et VS Code compris).
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::log_out_of_claude`].
#[tauri::command]
pub async fn log_out_of_claude(session: SharedSession<'_>) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.log_out_of_claude()).await
}

/// Connecte Claude Code à un compte Claude, pour tout le Mac : le navigateur s'ouvre sur la page
/// de connexion, dont l'adresse est envoyée à l'interface ([`CLAUDE_SIGN_IN`]). Rend la main une fois
/// la connexion terminée ; `stop_claude` l'annule.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::log_in_to_claude`].
#[tauri::command]
pub async fn log_in_to_claude<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        session.log_in_to_claude(|address| {
            if let Err(error) = app.emit(CLAUDE_SIGN_IN, address) {
                tracing::warn!(%error, "adresse de connexion non transmise à l'interface");
            }
        })
    })
    .await
}

/// Arrête le tour en cours, s'il y en a un (ce que Claude a déjà écrit reste écrit), ou annule la
/// connexion en cours.
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
