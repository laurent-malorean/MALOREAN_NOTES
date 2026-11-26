//! Commandes de « Brancher une IA » (fiche 0056) : la clé de branchement et ce qu'il faut coller
//! dans une IA extérieure, créer la clé, la révoquer.

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{AiWorkspaceItem, ApiError, ConnectionInfo};

/// Où en est le branchement : la clé de branchement, s'il y en a une, avec ses blocs de
/// configuration.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::connection_info`].
#[tauri::command]
pub async fn connection_info(session: SharedSession<'_>) -> Result<ConnectionInfo, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.connection_info()).await
}

/// Crée la clé de branchement (ou rend celle qui existe) et ouvre la prise de branchement.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::create_connection_key`].
#[tauri::command]
pub async fn create_connection_key(session: SharedSession<'_>) -> Result<ConnectionInfo, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        session.create_connection_key()?;
        session.connection_info()
    })
    .await
}

/// Révoque la clé de branchement : les IA branchées sont coupées et la prise est refermée.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::revoke_connection_key`].
#[tauri::command]
pub async fn revoke_connection_key(session: SharedSession<'_>) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.revoke_connection_key()).await
}

/// Les espaces de travail et leur case « autorisé pour les IA » (fiche 0074).
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::list_ai_workspaces`].
#[tauri::command]
pub async fn list_ai_workspaces(
    session: SharedSession<'_>,
) -> Result<Vec<AiWorkspaceItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_ai_workspaces()).await
}

/// Coche ou décoche l'espace de travail `name` pour les IA ; rend la liste à jour.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::set_workspace_allowed`].
#[tauri::command]
pub async fn set_workspace_allowed(
    session: SharedSession<'_>,
    name: String,
    allowed: bool,
) -> Result<Vec<AiWorkspaceItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        session.set_workspace_allowed(&name, allowed)?;
        session.list_ai_workspaces()
    })
    .await
}
