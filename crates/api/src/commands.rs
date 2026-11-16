//! Commandes Tauri : chacune passe le travail à un fil d'arrière-plan, pour ne jamais figer la page.

use std::sync::Arc;

use tauri::ipc::Invoke;
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;

use crate::{ApiError, LibraryInfo, NoteContent, NoteListItem, SavedNote, Session};

type SharedSession<'a> = State<'a, Arc<Session>>;

async fn in_background<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, ApiError> + Send + 'static,
) -> Result<T, ApiError> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|e| ApiError::internal(&e))?
}

/// La fenêtre peut charger les fichiers de la bibliothèque ouverte (images des notes), rien d'autre.
/// Une bibliothèque ouverte auparavant reste lisible jusqu'à la fermeture de l'application.
fn let_window_load_files<R: Runtime>(
    app: &AppHandle<R>,
    library: Option<LibraryInfo>,
) -> Result<Option<LibraryInfo>, ApiError> {
    if let Some(library) = &library {
        app.asset_protocol_scope()
            .allow_directory(&library.path, true)
            .map_err(|e| ApiError::internal(&e))?;
    }
    Ok(library)
}

/// Rouvre la dernière bibliothèque au lancement ; rien au premier lancement.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn reopen_last_library<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
) -> Result<Option<LibraryInfo>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || let_window_load_files(&app, session.reopen_last_library()?)).await
}

/// Demande un dossier à l'utilisateur et l'ouvre ; rien s'il annule.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
/// S'y ajoute un nom de dossier illisible.
#[tauri::command]
pub async fn choose_library<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
) -> Result<Option<LibraryInfo>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        let chosen = app.dialog().file().blocking_pick_folder();
        let folder = chosen
            .map(|folder| folder.into_path().map_err(|e| ApiError::internal(&e)))
            .transpose()?;
        let_window_load_files(&app, session.open_chosen_folder(folder.as_deref())?)
    })
    .await
}

/// Les notes d'un dossier (`""` pour la racine), la plus récente en premier.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn list_notes(
    session: SharedSession<'_>,
    folder: String,
) -> Result<Vec<NoteListItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_notes(&folder)).await
}

/// Le contenu d'une note.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn read_note(session: SharedSession<'_>, path: String) -> Result<NoteContent, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.read_note(&path)).await
}

/// Enregistre une note ; rend son chemin, dont le nom a peut-être changé avec le titre.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn save_note(
    session: SharedSession<'_>,
    path: String,
    content: String,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.save_note(&path, &content)).await
}

/// Crée une note vide, sans titre, dans un dossier (`""` pour la racine).
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn create_note(
    session: SharedSession<'_>,
    folder: String,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_note(&folder)).await
}

/// Toutes les commandes que l'interface peut appeler ; l'assemblage les enregistre telles quelles.
pub fn invoke_handler<R: Runtime>() -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        reopen_last_library,
        choose_library,
        list_notes,
        read_note,
        save_note,
        create_note,
    ]
}
