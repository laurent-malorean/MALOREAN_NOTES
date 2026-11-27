//! Commandes des favoris de l'espace de travail ouvert (fiche 0102) : la note des favoris (la lire,
//! la choisir, la créer, ne plus en avoir) et l'étoile (un contenu est-il en favori, l'ajouter, le
//! retirer, annuler le retrait).

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{ApiError, FavoritesNoteItem, RemovedLineItem};

/// La note des favoris de l'espace de travail ouvert ; rien s'il n'en a pas.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::favorites_note`].
#[tauri::command]
pub async fn favorites_note(
    session: SharedSession<'_>,
) -> Result<Option<FavoritesNoteItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.favorites_note()).await
}

/// Choisit la note `path` comme note des favoris ; rend la note choisie.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::choose_favorites_note`].
#[tauri::command]
pub async fn choose_favorites_note(
    session: SharedSession<'_>,
    path: String,
) -> Result<FavoritesNoteItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.choose_favorites_note(&path)).await
}

/// Crée la note des favoris titrée `title` dans `folder` (`""` pour la racine), la choisit et la
/// rend.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::create_favorites_note`].
#[tauri::command]
pub async fn create_favorites_note(
    session: SharedSession<'_>,
    title: String,
    folder: String,
) -> Result<FavoritesNoteItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_favorites_note(&title, &folder)).await
}

/// L'espace de travail ouvert n'a plus de note des favoris ; la note n'est pas supprimée.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::stop_using_favorites_note`].
#[tauri::command]
pub async fn stop_using_favorites_note(session: SharedSession<'_>) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.stop_using_favorites_note()).await
}

/// Le contenu `path` est-il en favori ? Faux sans note des favoris.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::is_favorite`].
#[tauri::command]
pub async fn is_favorite(session: SharedSession<'_>, path: String) -> Result<bool, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.is_favorite(&path)).await
}

/// Met le contenu `path` en favori (étoile creuse devenue pleine).
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::add_favorite`].
#[tauri::command]
pub async fn add_favorite(session: SharedSession<'_>, path: String) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.add_favorite(&path)).await
}

/// Retire le contenu `path` des favoris, sans confirmation (étoile pleine devenue creuse) ; rend
/// les lignes retirées, à passer à `restore_favorites` si l'utilisateur annule.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::remove_favorite`].
#[tauri::command]
pub async fn remove_favorite(
    session: SharedSession<'_>,
    path: String,
) -> Result<Vec<RemovedLineItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.remove_favorite(&path)).await
}

/// Remet à leur place les lignes qu'un retrait a ôtées (le bouton « Annuler »).
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::restore_favorites`].
#[tauri::command]
pub async fn restore_favorites(
    session: SharedSession<'_>,
    removed: Vec<RemovedLineItem>,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.restore_favorites(removed)).await
}
