//! La commande qui compte les fiches d'un CRM avant de le mettre à la corbeille (fiche 0091).

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::ApiError;

/// Le nombre de fiches qui partent avec cette note à la corbeille (celles de son CRM ; zéro pour
/// une note ordinaire).
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn crm_fiches_in_trash(
    session: SharedSession<'_>,
    path: String,
) -> Result<usize, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.crm_fiches_in_trash(&path)).await
}
