//! Commandes de l'agenda 12 (fiche 0104) : chacune lit la requête, appelle un seul cas d'usage,
//! met la réponse en forme.

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{
    Agenda12ClosedItem, Agenda12ClosingItem, Agenda12EventChangeItem, Agenda12EventDetailItem,
    Agenda12Item, ApiError, CountryItem, SavedNote,
};

/// Crée dans `folder` un agenda 12 titré `title`.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::create_agenda_12`].
#[tauri::command]
pub async fn create_agenda_12(
    session: SharedSession<'_>,
    folder: String,
    title: String,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_agenda_12(&folder, &title)).await
}

/// L'agenda 12 de la note : sa grille, ses archives, la liste de son filtre.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::read_agenda_12`].
#[tauri::command]
pub async fn read_agenda_12(
    session: SharedSession<'_>,
    path: String,
    tag: Option<String>,
) -> Result<Agenda12Item, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.read_agenda_12(&path, tag.as_deref())).await
}

/// Garde le nombre de colonnes de la grille.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::change_agenda_12_columns`].
#[tauri::command]
pub async fn change_agenda_12_columns(
    session: SharedSession<'_>,
    path: String,
    columns: u32,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.change_agenda_12_columns(&path, columns)).await
}

/// Crée l'événement « Sans titre » d'un mois.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::create_agenda_12_event`].
#[tauri::command]
pub async fn create_agenda_12_event(
    session: SharedSession<'_>,
    agenda: String,
    month: u32,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_agenda_12_event(&agenda, month)).await
}

/// L'événement d'une note, pour sa bande.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::read_agenda_12_event`].
#[tauri::command]
pub async fn read_agenda_12_event(
    session: SharedSession<'_>,
    path: String,
) -> Result<Agenda12EventDetailItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.read_agenda_12_event(&path)).await
}

/// Fait un geste sur un événement.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::change_agenda_12_event`].
#[tauri::command]
pub async fn change_agenda_12_event(
    session: SharedSession<'_>,
    path: String,
    change: Agenda12EventChangeItem,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.change_agenda_12_event(&path, change)).await
}

/// Clôt un événement, avec ou sans copie pour le suivant.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::close_agenda_12_event`].
#[tauri::command]
pub async fn close_agenda_12_event(
    session: SharedSession<'_>,
    path: String,
    closing: Agenda12ClosingItem,
) -> Result<Agenda12ClosedItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.close_agenda_12_event(&path, closing)).await
}

/// Rouvre un événement clos.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::reopen_agenda_12_event`].
#[tauri::command]
pub async fn reopen_agenda_12_event(
    session: SharedSession<'_>,
    path: String,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.reopen_agenda_12_event(&path)).await
}

/// Met un événement, ouvert ou clos, à la corbeille.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::delete_agenda_12_event`].
#[tauri::command]
pub async fn delete_agenda_12_event(
    session: SharedSession<'_>,
    path: String,
) -> Result<String, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.delete_agenda_12_event(&path)).await
}

/// Les pays de la liste où l'on choisit, rangés par nom en français.
#[tauri::command]
#[must_use]
pub fn list_countries() -> Vec<CountryItem> {
    crate::session::agenda_12_countries()
}
