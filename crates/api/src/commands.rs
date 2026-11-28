//! Commandes Tauri : chacune passe le travail à un fil d'arrière-plan, pour ne jamais figer l'interface.

use std::sync::Arc;

use application::use_cases::AttachmentSource;
use base64::Engine;
use tauri::ipc::Invoke;
use tauri::{Runtime, State};

use crate::{
    ApiError, AttachedFile, IndexOverviewItem, LinkingNoteItem, NoteContent, NoteListItem,
    NoteOrderItem, SaveResult, SavedNote, SearchResultItem, Session, TagItem, TrashInfo,
    WorkspaceNoteItem,
};

/// Événement envoyé à l'interface quand l'espace de travail change hors de l'application ;
/// il porte un [`crate::WorkspaceChanged`].
pub const WORKSPACE_CHANGED_EVENT: &str = "workspace-changed";

pub mod agenda_12;
pub mod canvas;
pub mod claude;
pub mod connection;
pub mod crm;
pub mod crm_fiches;
pub mod export;
pub mod favorites;
pub mod history;
pub mod links;
pub mod mcp_servers;
pub mod meaning;
pub mod menu;
pub mod mind_map;
pub mod renaming;
pub mod research_notebook;
pub mod tags;
pub mod templates;
pub mod voice;
pub mod workspaces;
pub mod writing;

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

/// L'état de l'index de mots de l'espace de travail ouvert : ses notes, sa dernière reconstruction.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::index_overview`].
#[tauri::command]
pub async fn index_overview(session: SharedSession<'_>) -> Result<IndexOverviewItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.index_overview()).await
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

/// Joint à une note un fichier collé ou glissé ; rend le lien Markdown à insérer. Le contenu
/// arrive en base64 dans des arguments JSON, jamais en corps brut avec des en-têtes : le corps
/// brut se perd quand Tauri bascule sur `postMessage` et WebKit peut tronquer un gros corps.
/// `file_name` est le nom d'un fichier glissé ou choisi, `media_type` le type d'un contenu collé
/// (`image/png`…), donné quand il n'y a pas de nom.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`Session::attach_file`]. S'y ajoutent un
/// contenu vide ou qui n'est pas du base64 valide (reçu en partie), et ni nom ni type.
#[tauri::command]
pub async fn attach_file(
    session: SharedSession<'_>,
    note: String,
    file_name: Option<String>,
    media_type: Option<String>,
    content: String,
) -> Result<AttachedFile, ApiError> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(content)
        .ok()
        .filter(|bytes| !bytes.is_empty())
        .ok_or_else(ApiError::incomplete_attachment)?;
    let session = Arc::clone(&session);
    in_background(move || {
        let source = match (&file_name, &media_type) {
            (Some(file_name), _) => AttachmentSource::Dropped { file_name },
            (None, Some(media_type)) => AttachmentSource::Pasted { media_type },
            (None, None) => return Err(ApiError::incomplete_attachment()),
        };
        session.attach_file(&note, source, &bytes)
    })
    .await
}

/// Toutes les commandes que l'interface peut appeler ; l'assemblage les enregistre telles quelles.
#[expect(
    clippy::too_many_lines,
    reason = "la liste des commandes, une par ligne : rien à découper, aucune logique"
)]
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
        links::resolve_links,
        links::list_linkable,
        list_backlinks,
        list_all_notes,
        list_tagged_notes,
        list_tags,
        tags::note_tags,
        tags::change_note_tags,
        rebuild_index,
        index_overview,
        list_recent_notes,
        read_note,
        save_note,
        renaming::rename_note,
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
        crm_fiches::crm_fiches_in_trash,
        trash_folder,
        list_trash,
        restore_note,
        restore_folder,
        empty_trash,
        attach_file,
        links::open_link_target,
        links::open_web_address,
        history::list_versions,
        history::compare_version,
        history::keep_version,
        history::restore_version,
        canvas::create_canvas,
        canvas::read_canvas,
        canvas::save_canvas,
        crm::create_crm,
        crm::read_crm,
        crm::crm_email_is_known,
        crm::create_crm_action,
        crm::change_crm_action,
        crm::move_crm_action,
        crm::delete_crm_action,
        crm::create_crm_person,
        crm::change_crm_person,
        crm::delete_crm_person,
        crm::create_crm_company,
        crm::change_crm_company,
        crm::delete_crm_company,
        crm::create_crm_project,
        crm::change_crm_project,
        crm::delete_crm_project,
        crm::change_crm_stages,
        agenda_12::create_agenda_12,
        agenda_12::read_agenda_12,
        agenda_12::change_agenda_12_columns,
        agenda_12::change_agenda_12_layout,
        agenda_12::create_agenda_12_event,
        agenda_12::read_agenda_12_event,
        agenda_12::change_agenda_12_event,
        agenda_12::close_agenda_12_event,
        agenda_12::reopen_agenda_12_event,
        agenda_12::delete_agenda_12_event,
        agenda_12::list_countries,
        mind_map::create_mind_map,
        mind_map::read_mind_map,
        mind_map::save_mind_map,
        research_notebook::create_research_notebook,
        research_notebook::add_entry,
        research_notebook::list_entries,
        export::choose_export_file,
        export::export_markdown,
        export::export_pdf,
        export::export_image,
        export::print_page,
        export::copy_rich_text,
        export::copy_plain_text,
        menu::install_menu,
        menu::enable_menu_items,
        writing::assistant_status,
        writing::propose_rewriting,
        voice::voice_input_status,
        voice::choose_voice_language,
        voice::prepare_voice_language,
        voice::start_voice_input,
        voice::stop_voice_input,
        voice::open_voice_privacy_settings,
        claude::answer_view,
        templates::templates_folder,
        templates::set_templates_folder,
        templates::import_templates_folders,
        mcp_servers::list_mcp_servers,
        mcp_servers::allow_mcp_server,
        mcp_servers::disallow_mcp_server,
        favorites::favorites_note,
        favorites::choose_favorites_note,
        favorites::create_favorites_note,
        favorites::stop_using_favorites_note,
        favorites::is_favorite,
        favorites::add_favorite,
        favorites::remove_favorite,
        favorites::restore_favorites,
        connection::connection_info,
        connection::create_connection_key,
        connection::revoke_connection_key,
        connection::list_ai_workspaces,
        connection::set_workspace_allowed,
        claude::claude_status,
        claude::send_to_claude,
        claude::stop_claude,
        claude::log_out_of_claude,
        claude::log_in_to_claude,
        meaning::meaning_overview,
        meaning::choose_meaning_model,
        meaning::download_meaning_model,
        meaning::cancel_model_download,
        meaning::remove_meaning_model,
        meaning::rebuild_meaning,
        meaning::search_notes_by_meaning,
        meaning::related_notes,
    ]
}
