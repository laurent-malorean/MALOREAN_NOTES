//! Commandes du dossier des modèles de l'espace de travail ouvert (fiche 0077) : l'interface le
//! lit et le choisit, et reprend ce qu'elle gardait autrefois.

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{ApiError, TemplatesFolderItem};

/// Le dossier des modèles de l'espace de travail ouvert, depuis sa racine (`Perso/Modèles`) ;
/// rien s'il n'en a pas choisi.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::templates_folder`].
#[tauri::command]
pub async fn templates_folder(session: SharedSession<'_>) -> Result<Option<String>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || Ok(session.templates_folder()?.map(|folder| folder.to_path()))).await
}

/// Choisit le dossier des modèles de l'espace de travail ouvert ; aucun pour `folder` absent.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::set_templates_folder`].
#[tauri::command]
pub async fn set_templates_folder(
    session: SharedSession<'_>,
    folder: Option<String>,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.set_templates_folder(folder.as_deref())).await
}

/// Reprend les dossiers des modèles que l'interface gardait avant la fiche 0077 ; rend le nombre
/// d'espaces de travail repris.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::import_templates_folders`].
#[tauri::command]
pub async fn import_templates_folders(
    session: SharedSession<'_>,
    chosen: Vec<TemplatesFolderItem>,
) -> Result<usize, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.import_templates_folders(&chosen)).await
}
