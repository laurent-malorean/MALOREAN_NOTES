//! Commandes du champ d'étiquettes : lire et changer les étiquettes d'un contenu.

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::ApiError;

/// Les étiquettes du contenu `path`, lues dans son fichier.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn note_tags(session: SharedSession<'_>, path: String) -> Result<Vec<String>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.note_tags(&path)).await
}

/// Donne ces étiquettes au contenu `path` ; rend celles qui sont écrites.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn change_note_tags(
    session: SharedSession<'_>,
    path: String,
    tags: Vec<String>,
) -> Result<Vec<String>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.change_note_tags(&path, &tags)).await
}
