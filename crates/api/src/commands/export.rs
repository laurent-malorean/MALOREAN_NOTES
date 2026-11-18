//! Commandes de l'export d'une note : le fichier choisi, puis le Markdown ou le PDF écrit ; et
//! la fenêtre d'impression du Mac, sur le même rendu ; la copie mise en forme dans le presse-papiers.

use std::ffi::c_void;
use std::path::PathBuf;
use std::sync::Arc;

use domain::export::{ExportDestination, ExportFormat};
use tauri::{AppHandle, Manager, Runtime, Webview};
use tauri_plugin_dialog::DialogExt;

use super::{SharedSession, in_background};
use crate::{ApiError, ExportFile, ExportFormatItem};

/// Ouvre la fenêtre d'enregistrement du Mac, le nom tiré du titre de la note, dans `folder`
/// (le dossier du dernier export) ou à défaut dans le dossier Documents ; rien si l'utilisateur
/// annule.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::chosen_export`].
#[tauri::command]
pub async fn choose_export_file<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
    title: String,
    format: ExportFormatItem,
    folder: Option<String>,
) -> Result<Option<ExportFile>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        let extension = ExportFormat::from(format).extension();
        let folder = folder
            .map(PathBuf::from)
            .or_else(|| app.path().document_dir().ok());
        let dialog = app
            .dialog()
            .file()
            .set_file_name(session.export_file_name(&title, format))
            .add_filter(extension, &[extension]);
        let dialog = match folder {
            Some(folder) => dialog.set_directory(folder),
            None => dialog,
        };
        let chosen = dialog
            .blocking_save_file()
            .map(|file| file.into_path().map_err(|e| ApiError::internal(&e)))
            .transpose()?;
        session.chosen_export(chosen.as_deref())
    })
    .await
}

/// Écrit la note `path` en Markdown au fichier `destination`, ses pièces jointes copiées à côté.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::export_markdown`].
#[tauri::command]
pub async fn export_markdown(
    session: SharedSession<'_>,
    path: String,
    destination: String,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.export_markdown(&path, &destination)).await
}

/// Imprime la page dans le fichier PDF `destination` : seule sa feuille d'impression, où la
/// page a posé le rendu HTML de la note, paraît sur le papier. WebKit écrit le fichier peu
/// après la réponse.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : emplacement invalide, impression impossible.
#[tauri::command]
pub async fn export_pdf<R: Runtime>(
    webview: Webview<R>,
    destination: String,
) -> Result<(), ApiError> {
    let destination = ExportDestination::parse(&destination)?;
    on_page(webview, move |page, window| {
        crate::pdf::print_to_pdf(page, window, destination.location())
    })
    .await?
    .map_err(|reason| ApiError::pdf_failed(&reason))
}

/// Ouvre la fenêtre d'impression du Mac sur la page : seule sa feuille d'impression, où la page a
/// posé le rendu HTML de la note, paraît sur le papier, comme pour l'export PDF. La réponse vient
/// dès la fenêtre ouverte ; l'utilisateur imprime, ou garde un PDF, depuis elle.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : impression impossible.
#[tauri::command]
pub async fn print_page<R: Runtime>(webview: Webview<R>) -> Result<(), ApiError> {
    on_page(webview, crate::pdf::print_with_panel)
        .await?
        .map_err(|reason| ApiError::print_failed(&reason))
}

/// Pose une note copiée dans le presse-papiers du Mac, en texte mis en forme `html` (styles en
/// ligne) et en texte brut `text` à la fois.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::copy_rich_text`].
#[tauri::command]
pub async fn copy_rich_text(
    session: SharedSession<'_>,
    html: String,
    text: String,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.copy_rich_text(&html, &text)).await
}

/// Pose le texte Markdown `text` d'une note dans le presse-papiers du Mac, en texte brut seul.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::copy_plain_text`].
#[tauri::command]
pub async fn copy_plain_text(session: SharedSession<'_>, text: String) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.copy_plain_text(&text)).await
}

/// Fait `print` sur le WKWebView et la NSWindow de la fenêtre, sur le fil principal, et rend
/// son résultat sans bloquer ce fil.
async fn on_page<R: Runtime>(
    webview: Webview<R>,
    print: impl FnOnce(*mut c_void, *mut c_void) -> Result<(), String> + Send + 'static,
) -> Result<Result<(), String>, ApiError> {
    let (sent, received) = std::sync::mpsc::channel();
    webview
        .with_webview(move |page| {
            if let Err(error) = sent.send(print(page.inner(), page.ns_window())) {
                tracing::warn!(%error, "fin de l'impression non transmise");
            }
        })
        .map_err(|e| ApiError::internal(&e))?;
    in_background(move || received.recv().map_err(|e| ApiError::internal(&e))).await
}
