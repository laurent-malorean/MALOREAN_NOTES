//! Commandes des canvas (fiche 0052).

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{ApiError, CanvasFileItem, CanvasItem, SavedNote};

/// Crée dans `folder` un canvas nommé `title`.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::create_canvas`].
#[tauri::command]
pub async fn create_canvas(
    session: SharedSession<'_>,
    folder: String,
    title: String,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_canvas(&folder, &title)).await
}

/// Le canvas du fichier, avec son texte.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::read_canvas`].
#[tauri::command]
pub async fn read_canvas(
    session: SharedSession<'_>,
    path: String,
) -> Result<CanvasFileItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.read_canvas(&path)).await
}

/// Enregistre le canvas, fait à partir du texte `base` que l'écran avait lu.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::save_canvas`].
#[tauri::command]
pub async fn save_canvas(
    session: SharedSession<'_>,
    path: String,
    base: String,
    canvas: CanvasItem,
) -> Result<CanvasFileItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.save_canvas(&path, &base, canvas)).await
}
