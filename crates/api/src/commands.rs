//! Commandes Tauri : chacune passe le travail à un fil d'arrière-plan, pour ne jamais figer la page.

use std::sync::Arc;

use application::use_cases::AttachmentSource;
use percent_encoding::percent_decode_str;
use tauri::ipc::{Invoke, InvokeBody, Request};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::{
    ApiError, AttachedFile, LibraryInfo, NoteContent, NoteListItem, SaveResult, SavedNote,
    SearchResultItem, Session, TrashInfo,
};

/// Événement envoyé à la page quand la bibliothèque change hors de l'application ;
/// il porte un [`crate::LibraryChanged`].
pub const LIBRARY_CHANGED_EVENT: &str = "library-changed";

type SharedSession<'a> = State<'a, Arc<Session>>;

async fn in_background<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, ApiError> + Send + 'static,
) -> Result<T, ApiError> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|e| ApiError::internal(&e))?
}

/// Une bibliothèque vient d'être ouverte : la fenêtre peut charger ses fichiers (images des
/// notes), rien d'autre, et la page apprend ce qui y change hors de l'application.
/// Une bibliothèque ouverte auparavant reste lisible jusqu'à la fermeture de l'application.
/// Une surveillance impossible n'empêche pas d'ouvrir la bibliothèque : elle est journalisée.
fn follow_library<R: Runtime>(
    app: &AppHandle<R>,
    session: &Session,
    library: Option<LibraryInfo>,
) -> Result<Option<LibraryInfo>, ApiError> {
    let Some(library) = library else {
        return Ok(None);
    };
    app.asset_protocol_scope()
        .allow_directory(&library.path, true)
        .map_err(|e| ApiError::internal(&e))?;
    let page = app.clone();
    let watched = session.watch_library(move |change| {
        if let Err(error) = page.emit(LIBRARY_CHANGED_EVENT, change) {
            tracing::warn!(%error, "changement de la bibliothèque non transmis à la page");
        }
    });
    if let Err(error) = watched {
        tracing::warn!(message = %error.message, "bibliothèque ouverte sans surveillance");
    }
    Ok(Some(library))
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
    in_background(move || follow_library(&app, &session, session.reopen_last_library()?)).await
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
        follow_library(
            &app,
            &session,
            session.open_chosen_folder(folder.as_deref())?,
        )
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

/// Les notes de toute la bibliothèque qui contiennent tous les mots cherchés.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn search_notes(
    session: SharedSession<'_>,
    query: String,
) -> Result<Vec<SearchResultItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.search_notes(&query)).await
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

/// Enregistre une note, lue ou enregistrée avec l'empreinte `fingerprint` ; rend son chemin,
/// dont le nom a peut-être changé avec le titre, et la copie de conflit éventuelle.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn save_note(
    session: SharedSession<'_>,
    path: String,
    content: String,
    fingerprint: String,
) -> Result<SaveResult, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.save_note(&path, &content, &fingerprint)).await
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

/// Les chemins de tous les dossiers, dans l'ordre de l'arbre.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn list_folders(session: SharedSession<'_>) -> Result<Vec<String>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_folders()).await
}

/// Crée un dossier dans un autre (`""` pour la racine) ; rend son chemin.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn create_folder(
    session: SharedSession<'_>,
    parent: String,
    name: String,
) -> Result<String, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_folder(&parent, &name)).await
}

/// Renomme un dossier ; rend son nouveau chemin.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn rename_folder(
    session: SharedSession<'_>,
    path: String,
    name: String,
) -> Result<String, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.rename_folder(&path, &name)).await
}

/// Déplace un dossier dans un autre (`""` pour la racine) ; rend son nouveau chemin.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn move_folder(
    session: SharedSession<'_>,
    path: String,
    into: String,
) -> Result<String, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.move_folder(&path, &into)).await
}

/// Déplace une note dans un dossier (`""` pour la racine) ; rend son nouveau chemin.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn move_note(
    session: SharedSession<'_>,
    path: String,
    into: String,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.move_note(&path, &into)).await
}

/// Épingle une note en tête de liste, sans changer sa date ; rend son nouveau contenu.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn pin_note(session: SharedSession<'_>, path: String) -> Result<NoteContent, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.pin_note(&path)).await
}

/// Désépingle une note, sans changer sa date ; rend son nouveau contenu.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn unpin_note(session: SharedSession<'_>, path: String) -> Result<NoteContent, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.unpin_note(&path)).await
}

/// Place une note dans la corbeille ; rend son chemin dans la corbeille.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn trash_note(session: SharedSession<'_>, path: String) -> Result<String, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.trash_note(&path)).await
}

/// Place un dossier, avec tout ce qu'il contient, dans la corbeille.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn trash_folder(session: SharedSession<'_>, path: String) -> Result<String, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.trash_folder(&path)).await
}

/// Ce que contient la corbeille.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn list_trash(session: SharedSession<'_>) -> Result<TrashInfo, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_trash()).await
}

/// Remet une note de la corbeille à sa place ; rend son chemin.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn restore_note(session: SharedSession<'_>, path: String) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.restore_note(&path)).await
}

/// Remet un dossier de la corbeille à sa place ; rend son chemin.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn restore_folder(session: SharedSession<'_>, path: String) -> Result<String, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.restore_folder(&path)).await
}

/// Supprime définitivement tout ce que contient la corbeille.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn empty_trash(session: SharedSession<'_>) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.empty_trash()).await
}

/// En-têtes d'une pièce jointe envoyée par la page, encodés comme une adresse (`%XX`).
/// Le chemin de la note qui la reçoit :
pub const NOTE_HEADER: &str = "x-note";
/// Le nom d'un fichier glissé :
pub const FILE_NAME_HEADER: &str = "x-file-name";
/// Le type d'un contenu collé (`image/png`…), quand aucun nom n'est donné :
pub const MEDIA_TYPE_HEADER: &str = "x-media-type";

fn header(request: &Request<'_>, name: &str) -> Option<String> {
    let value = request.headers().get(name)?.to_str().ok()?;
    Some(percent_decode_str(value).decode_utf8_lossy().into_owned())
}

/// Joint à une note un fichier collé ou glissé, reçu tel quel (octets bruts) ; rend le lien
/// Markdown à insérer. La note est dans l'en-tête [`NOTE_HEADER`], le nom du fichier glissé
/// dans [`FILE_NAME_HEADER`], ou le type du contenu collé dans [`MEDIA_TYPE_HEADER`].
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`Session::attach_file`]. S'y ajoute une
/// requête incomplète (contenu ou en-tête manquant).
#[tauri::command]
pub async fn attach_file(
    request: Request<'_>,
    session: SharedSession<'_>,
) -> Result<AttachedFile, ApiError> {
    let incomplete = || ApiError::incomplete_attachment();
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(incomplete());
    };
    let bytes = bytes.clone();
    let note = header(&request, NOTE_HEADER).ok_or_else(incomplete)?;
    let file_name = header(&request, FILE_NAME_HEADER);
    let media_type = header(&request, MEDIA_TYPE_HEADER);
    let session = Arc::clone(&session);
    in_background(move || {
        let source = match (&file_name, &media_type) {
            (Some(file_name), _) => AttachmentSource::Dropped { file_name },
            (None, Some(media_type)) => AttachmentSource::Pasted { media_type },
            (None, None) => return Err(incomplete()),
        };
        session.attach_file(&note, source, &bytes)
    })
    .await
}

/// Ouvre avec l'application du Mac la pièce jointe visée par la cible d'un lien de la note.
/// Seules les pièces jointes de la note s'ouvrent ainsi.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`Session::attachment_location`]. S'y ajoute
/// l'échec de l'ouverture par le Mac.
#[tauri::command]
pub async fn open_attachment<R: Runtime>(
    app: AppHandle<R>,
    session: SharedSession<'_>,
    path: String,
    target: String,
) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    let location = in_background(move || session.attachment_location(&path, &target)).await?;
    app.opener()
        .open_path(location, None::<&str>)
        .map_err(|e| ApiError::internal(&e))
}

/// Toutes les commandes que l'interface peut appeler ; l'assemblage les enregistre telles quelles.
pub fn invoke_handler<R: Runtime>() -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        reopen_last_library,
        choose_library,
        list_notes,
        search_notes,
        read_note,
        save_note,
        create_note,
        list_folders,
        create_folder,
        rename_folder,
        move_folder,
        move_note,
        pin_note,
        unpin_note,
        trash_note,
        trash_folder,
        list_trash,
        restore_note,
        restore_folder,
        empty_trash,
        attach_file,
        open_attachment,
    ]
}
