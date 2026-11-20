//! Commandes des cahiers de recherche (fiche 0041).

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{ApiError, EntryItem, SavedNote, WorkspaceNoteItem};

/// Crée dans `folder` un cahier de recherche titré `title`.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::create_research_notebook`].
#[tauri::command]
pub async fn create_research_notebook(
    session: SharedSession<'_>,
    folder: String,
    title: String,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_research_notebook(&folder, &title)).await
}

/// Ajoute une entrée à la fin du cahier, ou une correction de l'entrée `corrected`.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::add_entry`].
#[tauri::command]
pub async fn add_entry(
    session: SharedSession<'_>,
    path: String,
    text: String,
    corrected: Option<String>,
) -> Result<EntryItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.add_entry(&path, &text, corrected.as_deref())).await
}

/// Les cahiers de recherche de l'espace de travail, par titre.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::list_research_notebooks`].
#[tauri::command]
pub async fn list_research_notebooks(
    session: SharedSession<'_>,
) -> Result<Vec<WorkspaceNoteItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_research_notebooks()).await
}

/// Les entrées du cahier, de la plus ancienne à la plus récente.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::list_entries`].
#[tauri::command]
pub async fn list_entries(
    session: SharedSession<'_>,
    path: String,
) -> Result<Vec<EntryItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_entries(&path)).await
}
