//! Commandes de « Brancher une IA » (fiche 0056) : la clé de branchement et ce qu'il faut coller
//! dans une IA extérieure, créer la clé, la révoquer.

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{ApiError, ConnectionInfo};

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
