//! Commandes des liens : ce qu'on peut lier, et ce que désigne un lien écrit.

use std::sync::Arc;

use application::use_cases::LinkDestination;
use domain::WebAddress;
use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

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

/// Ouvre ce que vise la cible d'un lien Markdown de la note : une adresse web dans le
/// navigateur du Mac, une pièce jointe de la note avec l'application du Mac. Rien d'autre ne
/// s'ouvre ainsi.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`Session::link_destination`]. S'y ajoute
/// l'échec de l'ouverture par le Mac.
#[tauri::command]
pub async fn open_link_target<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
    path: String,
    target: String,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    let destination = in_background(move || session.link_destination(&path, &target)).await?;
    let opened = match destination {
        LinkDestination::Web(address) => app.opener().open_url(address.as_str(), None::<&str>),
        LinkDestination::Attachment(location) => {
            app.opener().open_path(location.as_str(), None::<&str>)
        }
    };
    opened.map_err(|e| ApiError::internal(&e))
}

/// Ouvre l'adresse web `address` dans le navigateur du Mac, comme le lien Markdown d'une note.
///
/// # Errors
///
/// `address` n'est pas une adresse web (`http`, `https`, `mailto`), ou le Mac n'a pas pu
/// l'ouvrir.
#[tauri::command]
pub fn open_web_address<R: Runtime>(app: AppHandle<R>, address: &str) -> Result<(), ApiError> {
    let address =
        WebAddress::in_link(address).ok_or_else(|| ApiError::not_a_web_address(address))?;
    app.opener()
        .open_url(address.as_str(), None::<&str>)
        .map_err(|e| ApiError::internal(&e))
}
