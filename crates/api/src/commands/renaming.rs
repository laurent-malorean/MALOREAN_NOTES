//! La commande du menu « Renommer… » d'une note (fiche 0090).

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{ApiError, SaveResult};

/// Renomme un contenu : il prend ce titre et son fichier le suit ; rend son nouveau chemin et
/// son titre (fiche 0090).
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn rename_note(
    session: SharedSession<'_>,
    path: String,
    title: String,
) -> Result<SaveResult, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.rename_note(&path, &title)).await
}
