//! Commandes de la saisie vocale (fiche 0103) : l'état du micro, la langue, le départ et l'arrêt de
//! l'écoute. Le texte arrive par l'événement [`VOICE_INPUT_EVENT`].

use std::sync::Arc;

use domain::voice_input::VoiceEvent;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_opener::OpenerExt;

use super::{SharedSession, in_background};
use crate::{ApiError, VoiceEventItem, VoiceInputStatusItem};

/// Événement envoyé à l'interface pendant la saisie vocale : il porte un
/// [`crate::VoiceEventItem`].
pub const VOICE_INPUT_EVENT: &str = "voice-input-event";

/// La page Confidentialité de macOS où l'utilisateur rend l'accès au micro.
const MICROPHONE_PRIVACY: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";

/// L'interface, qui apprend la saisie vocale par un événement.
#[derive(Debug)]
pub struct TauriVoiceEvents<R: Runtime>(pub AppHandle<R>);

impl<R: Runtime> application::VoiceEvents for TauriVoiceEvents<R> {
    fn voice_event(&self, event: &VoiceEvent) {
        if let Err(error) = self.0.emit(VOICE_INPUT_EVENT, VoiceEventItem::from(event)) {
            tracing::warn!(%error, "événement de la saisie vocale non transmis à l'interface");
        }
    }
}

/// L'état de la saisie vocale : le micro peut-il servir, la langue, les langues.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::voice_input_status`].
#[tauri::command]
pub async fn voice_input_status(
    session: SharedSession<'_>,
) -> Result<VoiceInputStatusItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.voice_input_status()).await
}

/// Choisit la langue de la saisie vocale ; `null` : celle du Mac.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::choose_voice_language`].
#[tauri::command]
pub async fn choose_voice_language(
    session: SharedSession<'_>,
    language: Option<String>,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.choose_voice_language(language.as_deref())).await
}

/// Prépare le modèle d'une langue (le télécharge s'il manque) ; rend la main quand il est prêt.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::prepare_voice_language`].
#[tauri::command]
pub async fn prepare_voice_language(
    session: SharedSession<'_>,
    language: String,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.prepare_voice_language(&language)).await
}

/// Démarre la saisie vocale et rend la main aussitôt ; la suite arrive par [`VOICE_INPUT_EVENT`].
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::start_voice_input`].
#[tauri::command]
pub async fn start_voice_input(session: SharedSession<'_>) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.start_voice_input()).await
}

/// Arrête la saisie vocale en cours ; sans effet s'il n'y en a pas. Le texte provisoire est fixé
/// tel quel, puis [`VOICE_INPUT_EVENT`] porte la fin.
///
/// # Errors
///
/// Seulement une erreur interne, si le fil d'arrière-plan s'arrête.
#[tauri::command]
pub async fn stop_voice_input(session: SharedSession<'_>) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        session.stop_voice_input();
        Ok(())
    })
    .await
}

/// Ouvre la page Confidentialité des réglages de macOS, où l'on rend l'accès au micro.
///
/// # Errors
///
/// Un message si macOS ne l'ouvre pas.
#[tauri::command]
pub async fn open_voice_privacy_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), ApiError> {
    app.opener()
        .open_url(MICROPHONE_PRIVACY, None::<&str>)
        .map_err(|error| ApiError {
            message: format!("les réglages de macOS ne se sont pas ouverts : {error}"),
        })
}
