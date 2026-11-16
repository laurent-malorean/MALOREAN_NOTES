//! Commandes Tauri : chacune passe le travail à un fil d'arrière-plan, pour ne jamais figer la page.

use std::sync::Arc;

use tauri::ipc::Invoke;
use tauri::{AppHandle, Runtime, State};
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

/// Rouvre la dernière bibliothèque au lancement ; rien au premier lancement.
#[tauri::command]
pub async fn reopen_last_library(
    session: SharedSession<'_>,
) -> Result<Option<LibraryInfo>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.reopen_last_library()).await
}

/// Demande un dossier à l'utilisateur et l'ouvre ; rien s'il annule.
#[tauri::command]
pub async fn choose_library<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
) -> Result<Option<LibraryInfo>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || {
        let Some(folder) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        let path = folder.into_path().map_err(|e| ApiError::internal(&e))?;
        session.open_library(path).map(Some)
    })
    .await
}

#[tauri::command]
pub async fn list_notes(session: SharedSession<'_>) -> Result<Vec<NoteListItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_notes()).await
}

#[tauri::command]
pub async fn read_note(
    session: SharedSession<'_>,
    file_name: String,
) -> Result<NoteContent, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.read_note(&file_name)).await
}

#[tauri::command]
pub async fn save_note(
    session: SharedSession<'_>,
    file_name: String,
    content: String,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.save_note(&file_name, &content)).await
}

#[tauri::command]
pub async fn create_note(session: SharedSession<'_>) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_note()).await
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
