//! Commandes de la recherche par le sens (fiches 0042 et 0046) : les modèles de sens, l'index de
//! sens, la recherche par les mots et le sens, les notes proches.

use std::sync::Arc;

use tauri::{AppHandle, Emitter, Runtime};

use super::{SharedSession, in_background};
use crate::{
    ApiError, MeaningEvents, MeaningOverviewItem, MeaningProgressItem, MeaningSearchItem,
    ModelDownloadItem, NoteListItem,
};

/// Événement envoyé à l'interface pendant le calcul des vecteurs de sens, en arrière-plan : il
/// porte un [`crate::MeaningProgressItem`].
pub const MEANING_PROGRESS_EVENT: &str = "meaning-progress";

/// Événement envoyé à l'interface pendant le téléchargement d'un modèle de sens : il porte un
/// [`crate::ModelDownloadItem`].
pub const MODEL_DOWNLOAD_EVENT: &str = "model-download";

/// L'interface, qui apprend le calcul du sens et le téléchargement des modèles par des événements.
#[derive(Debug)]
pub struct TauriMeaningEvents<R: Runtime>(pub AppHandle<R>);

impl<R: Runtime> MeaningEvents for TauriMeaningEvents<R> {
    fn meaning_progress(&self, progress: MeaningProgressItem) {
        if let Err(error) = self.0.emit(MEANING_PROGRESS_EVENT, progress) {
            tracing::warn!(%error, "avancement du calcul du sens non transmis à l'interface");
        }
    }

    fn model_download(&self, progress: ModelDownloadItem) {
        if let Err(error) = self.0.emit(MODEL_DOWNLOAD_EVENT, progress) {
            tracing::warn!(%error, "avancement du téléchargement non transmis à l'interface");
        }
    }
}

/// L'état de la recherche par le sens : modèle choisi, chaque modèle, index de sens, calcul.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::meaning_overview`].
#[tauri::command]
pub async fn meaning_overview(session: SharedSession<'_>) -> Result<MeaningOverviewItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.meaning_overview()).await
}

/// Choisit le modèle de sens, par son nom (`e5-small`, `e5-large`).
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::choose_meaning_model`].
#[tauri::command]
pub async fn choose_meaning_model(
    session: SharedSession<'_>,
    model: String,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.choose_meaning_model(&model)).await
}

/// Télécharge un modèle de sens, par son nom ; l'avancement part à l'interface
/// ([`MODEL_DOWNLOAD_EVENT`]). Rend la main à la fin du téléchargement ; un seul à la fois.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::download_meaning_model`].
#[tauri::command]
pub async fn download_meaning_model(
    session: SharedSession<'_>,
    model: String,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.download_meaning_model(&model)).await
}

/// Annule le téléchargement du modèle en cours, s'il y en a un.
///
/// # Errors
///
/// Seulement une erreur interne, si le fil d'arrière-plan s'arrête.
#[tauri::command]
pub async fn cancel_model_download(session: SharedSession<'_>) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        session.cancel_model_download();
        Ok(())
    })
    .await
}

/// Supprime un modèle de sens du Mac, par son nom.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::remove_meaning_model`].
#[tauri::command]
pub async fn remove_meaning_model(
    session: SharedSession<'_>,
    model: String,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.remove_meaning_model(&model)).await
}

/// Reconstruit l'index de sens de l'espace de travail ouvert ; les vecteurs se recalculent en
/// arrière-plan ([`MEANING_PROGRESS_EVENT`]).
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::rebuild_meaning`].
#[tauri::command]
pub async fn rebuild_meaning(session: SharedSession<'_>) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.rebuild_meaning()).await
}

/// Les notes de tout l'espace de travail qui répondent à `query` par leurs mots ou par leur sens ;
/// si le sens manque, les mots répondent seuls et le résultat dit pourquoi.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::search_notes_with_meaning`].
#[tauri::command]
pub async fn search_notes_with_meaning(
    session: SharedSession<'_>,
    query: String,
) -> Result<MeaningSearchItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.search_notes_with_meaning(&query)).await
}

/// Les notes dont le sens est le plus proche de la note `path`.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::related_notes`].
#[tauri::command]
pub async fn related_notes(
    session: SharedSession<'_>,
    path: String,
) -> Result<Vec<NoteListItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.related_notes(&path)).await
}
