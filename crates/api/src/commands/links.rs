//! Commandes des liens : ce qu'on peut lier, et ce que désigne un lien écrit.

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{ApiError, LinkResolutionItem, LinkableItem};

/// Tout ce qu'un lien peut désigner, chacun avec le lien à écrire pour le désigner.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::list_linkable`].
#[tauri::command]
pub async fn list_linkable(session: SharedSession<'_>) -> Result<Vec<LinkableItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_linkable()).await
}

/// Ce que désigne chacune des cibles de liens (`titre`, `nom.canvas`, `Dossier/titre`).
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::resolve_links`].
#[tauri::command]
pub async fn resolve_links(
    session: SharedSession<'_>,
    targets: Vec<String>,
) -> Result<Vec<LinkResolutionItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.resolve_links(&targets)).await
}
