//! Commandes des espaces de travail : la page désigne chacun par son nom.

use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

use super::{SharedSession, WORKSPACE_CHANGED_EVENT, in_background};
use crate::{ApiError, ChosenFolder, Session, WorkspaceInfo, WorkspaceItem};

/// Un espace de travail vient d'être ouvert : la fenêtre peut charger ses fichiers (images des
/// notes), rien d'autre, et la page apprend ce qui y change hors de l'application.
/// Un espace de travail ouvert auparavant reste lisible jusqu'à la fermeture de l'application.
/// Une surveillance impossible n'empêche pas d'ouvrir l'espace de travail : elle est journalisée.
fn follow_workspace<R: Runtime>(
    app: &AppHandle<R>,
    session: &Session,
    workspace: WorkspaceInfo,
) -> Result<WorkspaceInfo, ApiError> {
    app.asset_protocol_scope()
        .allow_directory(&workspace.path, true)
        .map_err(|e| ApiError::internal(&e))?;
    let page = app.clone();
    let watched = session.watch_workspace(move |change| {
        if let Err(error) = page.emit(WORKSPACE_CHANGED_EVENT, change) {
            tracing::warn!(%error, "changement de l'espace de travail non transmis à la page");
        }
    });
    if let Err(error) = watched {
        tracing::warn!(message = %error.message, "espace de travail ouvert sans surveillance");
    }
    Ok(workspace)
}

/// Rouvre l'espace de travail ouvert en dernier, au lancement ; rien au premier lancement.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn reopen_last_workspace<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
) -> Result<Option<WorkspaceInfo>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        session
            .reopen_last_workspace()?
            .map(|opened| follow_workspace(&app, &session, opened))
            .transpose()
    })
    .await
}

/// Les espaces de travail, l'ouvert marqué.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn list_workspaces(session: SharedSession<'_>) -> Result<Vec<WorkspaceItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_workspaces()).await
}

/// Demande un dossier à l'utilisateur, pour un nouvel espace de travail ; rien s'il annule.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn choose_workspace_folder<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
) -> Result<Option<ChosenFolder>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        let chosen = app.dialog().file().blocking_pick_folder();
        let folder = chosen
            .map(|folder| folder.into_path().map_err(|e| ApiError::internal(&e)))
            .transpose()?;
        session.chosen_folder(folder.as_deref())
    })
    .await
}

/// Ajoute l'espace de travail `name` sur le dossier `folder`, et l'ouvre.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn add_workspace<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
    name: String,
    folder: String,
) -> Result<WorkspaceInfo, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        let opened = session.add_workspace(&name, &folder)?;
        follow_workspace(&app, &session, opened)
    })
    .await
}

/// Ouvre l'espace de travail `name` à la place de celui qui l'était.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn open_workspace<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
    name: String,
) -> Result<WorkspaceInfo, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        let opened = session.open_workspace(&name)?;
        follow_workspace(&app, &session, opened)
    })
    .await
}

/// Renomme l'espace de travail `name` en `new_name` ; rend le nom gardé.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn rename_workspace(
    session: SharedSession<'_>,
    name: String,
    new_name: String,
) -> Result<String, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.rename_workspace(&name, &new_name)).await
}

/// Retire l'espace de travail `name` de la liste, sans toucher à ses fichiers.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn remove_workspace(session: SharedSession<'_>, name: String) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.remove_workspace(&name)).await
}
