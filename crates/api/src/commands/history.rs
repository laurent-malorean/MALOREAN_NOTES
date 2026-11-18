//! Commandes de l'historique des versions d'une note.

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{ApiError, DifferenceItem, NoteContent, VersionItem};

/// Les versions de la note, la plus récente d'abord.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::list_versions`].
#[tauri::command]
pub async fn list_versions(
    session: SharedSession<'_>,
    path: String,
) -> Result<Vec<VersionItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_versions(&path)).await
}

/// Les lignes de la note actuelle et de la version, marquées selon leur origine.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::compare_version`].
#[tauri::command]
pub async fn compare_version(
    session: SharedSession<'_>,
    path: String,
    version: String,
) -> Result<Vec<DifferenceItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.compare_version(&path, &version)).await
}

/// Garde une version du texte actuel de la note, s'il diffère de la plus récente.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::keep_version`].
#[tauri::command]
pub async fn keep_version(session: SharedSession<'_>, path: String) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.keep_version(&path)).await
}

/// Revient à une version de la note, son texte actuel d'abord gardé comme version.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::restore_version`].
#[tauri::command]
pub async fn restore_version(
    session: SharedSession<'_>,
    path: String,
    version: String,
) -> Result<NoteContent, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.restore_version(&path, &version)).await
}
