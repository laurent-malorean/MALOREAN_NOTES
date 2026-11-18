//! Commandes Tauri : chacune passe le travail à un fil d'arrière-plan, pour ne jamais figer la page.

use std::sync::Arc;

use application::use_cases::AttachmentSource;
use percent_encoding::percent_decode_str;
use tauri::ipc::{Invoke, InvokeBody, Request};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use crate::{
    ApiError, AttachedFile, LinkingNoteItem, NoteContent, NoteListItem, NoteOrderItem, SaveResult,
    SavedNote, SearchResultItem, Session, TagItem, TrashInfo, WorkspaceNoteItem,
};

/// Événement envoyé à la page quand l'espace de travail change hors de l'application ;
/// il porte un [`crate::WorkspaceChanged`].
pub const WORKSPACE_CHANGED_EVENT: &str = "workspace-changed";

pub mod export;
pub mod menu;
pub mod workspaces;

type SharedSession<'a> = State<'a, Arc<Session>>;

async fn in_background<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, ApiError> + Send + 'static,
) -> Result<T, ApiError> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|e| ApiError::internal(&e))?
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
    order: NoteOrderItem,
) -> Result<Vec<NoteListItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_notes(&folder, order)).await
}

/// Les notes de tout l'espace de travail qui contiennent tous les mots cherchés.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn search_notes(
    session: SharedSession<'_>,
    query: String,
    order: NoteOrderItem,
) -> Result<Vec<SearchResultItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.search_notes(&query, order)).await
}

/// Le chemin de la note qu'un lien `[[titre]]` désigne, ou rien.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn resolve_link(
    session: SharedSession<'_>,
    title: String,
) -> Result<Option<String>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.resolve_link(&title)).await
}

/// Toutes les notes de l'espace de travail, pour l'ouverture rapide.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn list_all_notes(
    session: SharedSession<'_>,
) -> Result<Vec<WorkspaceNoteItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_all_notes()).await
}

/// Les notes de tout l'espace de travail qui portent une étiquette.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn list_tagged_notes(
    session: SharedSession<'_>,
    tag: String,
    order: NoteOrderItem,
) -> Result<Vec<NoteListItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_tagged_notes(&tag, order)).await
}

/// Les notes récentes, dans l'ordre donné, sans celles qui n'existent plus.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn list_recent_notes(
    session: SharedSession<'_>,
    paths: Vec<String>,
) -> Result<Vec<NoteListItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_recent_notes(&paths)).await
}

/// Chaque étiquette de l'espace de travail et son nombre de notes.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn list_tags(session: SharedSession<'_>) -> Result<Vec<TagItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_tags()).await
}

/// Reconstruit l'index de l'espace de travail ouvert, à partir de ses fichiers.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn rebuild_index(session: SharedSession<'_>) -> Result<(), ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.rebuild_index()).await
}

/// Les liens entrants d'une note.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn list_backlinks(
    session: SharedSession<'_>,
    path: String,
) -> Result<Vec<LinkingNoteItem>, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.list_backlinks(&path)).await
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

/// Crée une note dans un dossier (`""` pour la racine) depuis un modèle de note.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn create_note_from_template(
    session: SharedSession<'_>,
    template: String,
    folder: String,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_note_from_template(&template, &folder)).await
}

/// La note du jour dans le dossier `journal`, créée si besoin depuis le modèle `template`.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir la méthode correspondante de [`Session`].
#[tauri::command]
pub async fn create_daily_note(
    session: SharedSession<'_>,
    journal: String,
    template: Option<String>,
) -> Result<SavedNote, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.create_daily_note(&journal, template.as_deref())).await
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
        workspaces::reopen_last_workspace,
        workspaces::list_workspaces,
        workspaces::choose_workspace_folder,
        workspaces::add_workspace,
        workspaces::open_workspace,
        workspaces::rename_workspace,
        workspaces::remove_workspace,
        list_notes,
        search_notes,
        resolve_link,
        list_backlinks,
        list_all_notes,
        list_tagged_notes,
        list_tags,
        rebuild_index,
        list_recent_notes,
        read_note,
        save_note,
        create_note,
        create_note_from_template,
        create_daily_note,
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
        export::choose_export_file,
        export::export_markdown,
        export::export_pdf,
        export::print_page,
        export::copy_rich_text,
        export::copy_plain_text,
        menu::install_menu,
        menu::enable_menu_items,
    ]
}
