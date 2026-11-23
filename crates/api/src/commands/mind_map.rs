//! Commandes des cartes mentales (fiche 0050).

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{ApiError, MindMapItem, SavedNote};

/// Crée dans `folder` une carte mentale titrée `title`.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::create_mind_map`].
#[tauri::command]
pub async fn create_mind_map(
    session: SharedSession<'_>,
    folder: String,
    title: String,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_mind_map(&folder, &title)).await
}

/// La carte mentale de la note.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::read_mind_map`].
#[tauri::command]
pub async fn read_mind_map(
    session: SharedSession<'_>,
    path: String,
) -> Result<MindMapItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.read_mind_map(&path)).await
}

/// Enregistre la carte mentale dans la note.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::save_mind_map`].
#[tauri::command]
pub async fn save_mind_map(
    session: SharedSession<'_>,
    path: String,
    map: MindMapItem,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.save_mind_map(&path, map)).await
}
