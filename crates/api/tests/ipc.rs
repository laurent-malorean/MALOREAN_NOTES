//! Les commandes, appelées comme le fait l'interface : nom, arguments JSON, réponse JSON.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::Arc;

use api::commands::{WORKSPACE_CHANGED_EVENT, invoke_handler};
use api::{
    AttachedFile, LinkingNoteItem, NoteContent, NoteListItem, SaveResult, SavedNote,
    SearchResultItem, Session, TrashInfo, WorkspaceChanged, WorkspaceInfo, WorkspaceItem,
    WorkspaceNoteItem,
};
use application::testing::{
    FakeOpener, FakePreferences, FakeWatcher, FixedClock, InMemoryNoteStore,
};
use application::{
    Preferences, Workspace, WorkspaceChange, WorkspaceLocation, WorkspaceName, WorkspaceWatcher,
    Workspaces,
};
use domain::NotePath;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const BRIDGE_SOURCE: &str = include_str!("../../../ui/src/bridge/index.ts");

/// Une fenêtre simulée, branchée sur un espace de travail en mémoire déjà rouvrable.
fn window(notes: &[(&str, &str)]) -> WebviewWindow<MockRuntime> {
    window_watched_by(notes, Arc::new(FakeWatcher::default()))
}

/// La même fenêtre, dont l'espace de travail est surveillée par `watcher`.
fn window_watched_by(
    notes: &[(&str, &str)],
    watcher: Arc<FakeWatcher>,
) -> WebviewWindow<MockRuntime> {
    let preferences = FakePreferences::default();
    let first = Workspace {
        name: WorkspaceName::new("Notes").unwrap(),
        location: WorkspaceLocation::new("/Users/moi/Notes").unwrap(),
    };
    preferences
        .save_workspaces(&Workspaces::default().added(first).unwrap())
        .unwrap();
    let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
    let session = Session::new(
        Arc::new(opener),
        Arc::new(preferences),
        Arc::new(FixedClock::default()),
    )
    .with_watcher(watcher as Arc<dyn WorkspaceWatcher>);
    let app = mock_builder()
        .manage(Arc::new(session))
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap()
}

fn call(window: &WebviewWindow<MockRuntime>, command: &str, args: Value) -> Result<Value, Value> {
    call_from(window, APP_ORIGIN, command, args)
}

const APP_ORIGIN: &str = "tauri://localhost";

fn call_from(
    window: &WebviewWindow<MockRuntime>,
    origin: &str,
    command: &str,
    args: Value,
) -> Result<Value, Value> {
    let request = InvokeRequest {
        cmd: command.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: origin.parse().unwrap(),
        body: InvokeBody::Json(args),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };
    get_ipc_response(window, request).map(|body| body.deserialize::<Value>().unwrap())
}

fn ok<T: DeserializeOwned>(result: Result<Value, Value>) -> T {
    serde_json::from_value(result.unwrap()).unwrap()
}

fn error_message(result: Result<Value, Value>) -> String {
    result.unwrap_err()["message"]
        .as_str()
        .unwrap_or_default()
        .to_owned()
}

#[test]
fn nothing_can_be_listed_before_a_workspace_is_open() {
    let window = window(&[]);
    assert_eq!(
        error_message(call(
            &window,
            "list_notes",
            json!({ "folder": "", "order": "modified" })
        )),
        "aucun espace de travail n'est ouvert"
    );
}

#[test]
fn the_last_workspace_is_reopened_then_listed() {
    let window = window(&[("a.md", "# Alpha")]);
    let workspace: Option<WorkspaceInfo> = ok(call(&window, "reopen_last_workspace", json!({})));
    assert_eq!(workspace.map(|l| l.name), Some("Notes".into()));
    let notes: Vec<NoteListItem> = ok(call(
        &window,
        "list_notes",
        json!({ "folder": "", "order": "modified" }),
    ));
    assert_eq!(
        notes.iter().map(|n| n.title.as_str()).collect::<Vec<_>>(),
        ["Alpha"]
    );
}

#[test]
fn a_note_is_read_with_the_argument_names_used_by_the_interface() {
    let window = window(&[("a.md", "# Alpha\ntexte")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let note: NoteContent = ok(call(&window, "read_note", json!({ "path": "a.md" })));
    assert_eq!(note.content, "# Alpha\ntexte");
}

#[test]
fn saving_a_new_title_renames_the_file() {
    let window = window(&[("a.md", "# Alpha")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let read: NoteContent = ok(call(&window, "read_note", json!({ "path": "a.md" })));
    let saved: SaveResult = ok(call(
        &window,
        "save_note",
        json!({ "path": "a.md", "content": "# Bêta", "fingerprint": read.fingerprint }),
    ));
    assert_eq!(saved.path, "beta.md");
    assert_eq!(saved.conflict_copy, None);
}

#[test]
fn saving_over_a_version_changed_elsewhere_keeps_it_in_a_conflict_copy() {
    let window = window(&[("a.md", "# Alpha\nailleurs")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let saved: SaveResult = ok(call(
        &window,
        "save_note",
        json!({ "path": "a.md", "content": "# Alpha\nici", "fingerprint": "cbf29ce484222325" }),
    ));
    assert_eq!(
        saved.conflict_copy.as_deref(),
        Some("a (conflit 2026-11-16 18h30).md")
    );
}

#[test]
fn changes_made_outside_the_app_reach_the_interface_as_an_event() {
    let watcher = Arc::new(FakeWatcher::default());
    let window = window_watched_by(&[], Arc::clone(&watcher));
    let (sender, received) = std::sync::mpsc::channel();
    window
        .app_handle()
        .listen_any(WORKSPACE_CHANGED_EVENT, move |event| {
            let _sent = sender.send(event.payload().to_owned());
        });
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    watcher.announce(WorkspaceChange {
        notes: vec![NotePath::parse("Travail/lundi.md").unwrap()],
    });
    let payload = received
        .recv_timeout(std::time::Duration::from_secs(5))
        .unwrap();
    let change: WorkspaceChanged = serde_json::from_str(&payload).unwrap();
    assert_eq!(change.notes, ["Travail/lundi.md"]);
    assert!(BRIDGE_SOURCE.contains(&format!("\"{WORKSPACE_CHANGED_EVENT}\"")));
}

#[test]
fn a_created_note_is_untitled() {
    let window = window(&[]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let created: SavedNote = ok(call(
        &window,
        "create_note",
        json!({ "folder": "", "order": "modified" }),
    ));
    assert_eq!(created.path, "sans-titre.md");
}

#[test]
fn the_daily_note_is_asked_with_the_argument_names_used_by_the_interface() {
    let window = window(&[]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let args = json!({ "journal": "Journal", "template": null });
    let created: SavedNote = ok(call(&window, "create_daily_note", args));
    assert_eq!(created.path, "Journal/2026-11-16.md");
}

#[test]
fn a_dangerous_name_sent_by_the_interface_is_refused() {
    let window = window(&[]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let error = error_message(call(
        &window,
        "read_note",
        json!({ "path": "../secret.md" }),
    ));
    assert_eq!(error, "nom de note invalide : « ../secret.md »");
}

#[test]
fn a_missing_argument_is_refused() {
    let window = window(&[]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    assert!(call(&window, "read_note", json!({})).is_err());
}

#[test]
fn every_command_called_by_the_interface_exists() {
    let window = window(&[]);
    let called: Vec<&str> = BRIDGE_SOURCE
        .split("invoke<")
        .skip(1)
        .filter_map(|rest| rest.split('"').nth(1))
        .collect();
    assert!(called.len() >= 6, "commandes trouvées : {called:?}");
    for command in called
        .into_iter()
        .filter(|c| *c != "choose_workspace_folder")
    {
        let result = call(&window, command, json!({}));
        let message = result.err().map(|e| e.to_string()).unwrap_or_default();
        assert!(!message.contains("not found"), "{command} : {message}");
    }
}

#[test]
fn a_page_from_the_internet_cannot_call_any_command() {
    let window = window(&[("a.md", "# Alpha")]);
    let result = call_from(
        &window,
        "https://site-malveillant.example",
        "reopen_last_workspace",
        json!({}),
    );
    assert!(result.unwrap_err().to_string().contains("not allowed"));
}

#[test]
fn the_window_can_load_the_files_of_the_open_workspace_only() {
    let window = window(&[]);
    let scope = window.asset_protocol_scope();
    let image = "/Users/moi/Notes/voyage.assets/mer.png";
    assert!(!scope.is_allowed(image));
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    assert!(scope.is_allowed(image));
    assert!(!scope.is_allowed("/Users/moi/Documents/secret.png"));
}

#[test]
fn workspaces_are_handled_by_name_with_the_argument_names_used_by_the_interface() {
    let window = window(&[]);
    let scope = window.asset_protocol_scope();
    let added: WorkspaceInfo = ok(call(
        &window,
        "add_workspace",
        json!({ "name": "Travail", "folder": "/Users/moi/Travail" }),
    ));
    assert_eq!(added.name, "Travail");
    assert!(scope.is_allowed("/Users/moi/Travail/a.assets/b.png"));
    let kept: String = ok(call(
        &window,
        "rename_workspace",
        json!({ "name": "Travail", "newName": "Bureau" }),
    ));
    assert_eq!(kept, "Bureau");
    let opened: WorkspaceInfo = ok(call(&window, "open_workspace", json!({ "name": "Notes" })));
    assert_eq!(opened.path, "/Users/moi/Notes");
    call(&window, "remove_workspace", json!({ "name": "Bureau" })).unwrap();
    let listed: Vec<WorkspaceItem> = ok(call(&window, "list_workspaces", json!({})));
    let names: Vec<_> = listed.iter().map(|w| (w.name.as_str(), w.active)).collect();
    assert_eq!(names, [("Notes", true)]);
}

#[test]
fn folders_are_handled_with_the_argument_names_used_by_the_interface() {
    let window = window(&[("Travail/a.md", "# A")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let created: String = ok(call(
        &window,
        "create_folder",
        json!({ "parent": "", "name": "Perso" }),
    ));
    assert_eq!(created, "Perso");
    let renamed: String = ok(call(
        &window,
        "rename_folder",
        json!({ "path": "Perso", "name": "Maison" }),
    ));
    assert_eq!(renamed, "Maison");
    let moved: String = ok(call(
        &window,
        "move_folder",
        json!({ "path": "Travail", "into": "Maison" }),
    ));
    assert_eq!(moved, "Maison/Travail");
    let folders: Vec<String> = ok(call(&window, "list_folders", json!({})));
    assert_eq!(folders, ["Maison", "Maison/Travail"]);
    let notes: Vec<NoteListItem> = ok(call(
        &window,
        "list_notes",
        json!({ "folder": "Maison/Travail", "order": "modified" }),
    ));
    assert_eq!(notes[0].path, "Maison/Travail/a.md");
}

#[test]
fn a_note_is_moved_into_a_folder_by_the_names_used_by_the_interface() {
    let window = window(&[("a.md", "# Alpha"), ("Perso/b.md", "# Bêta")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let moved: SavedNote = ok(call(
        &window,
        "move_note",
        json!({ "path": "a.md", "into": "Perso" }),
    ));
    assert_eq!(moved.path, "Perso/a.md");
    let notes: Vec<NoteListItem> = ok(call(
        &window,
        "list_notes",
        json!({ "folder": "Perso", "order": "modified" }),
    ));
    let mut paths: Vec<_> = notes.into_iter().map(|n| n.path).collect();
    paths.sort();
    assert_eq!(paths, ["Perso/a.md", "Perso/b.md"]);
}

#[test]
fn moving_a_note_into_a_folder_with_a_bad_name_is_refused() {
    let window = window(&[("a.md", "# Alpha")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let error = error_message(call(
        &window,
        "move_note",
        json!({ "path": "a.md", "into": "../dehors" }),
    ));
    assert!(
        error.contains("../dehors") || error.contains(".."),
        "{error}"
    );
}

#[test]
fn the_interface_searches_the_whole_workspace_by_its_query_argument() {
    let window = window(&[("a.md", "# Alpha\nété"), ("Travail/b.md", "# Bêta\nhiver")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let results: Vec<SearchResultItem> = ok(call(
        &window,
        "search_notes",
        json!({ "query": "ete", "order": "modified" }),
    ));
    assert_eq!(
        results.iter().map(|r| r.path.as_str()).collect::<Vec<_>>(),
        ["a.md"]
    );
}

#[test]
fn the_interface_chooses_the_order_of_the_list_by_its_order_argument() {
    let window = window(&[("a.md", "# alpha\npain"), ("b.md", "# Bêta\npain")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let paths = |command: &str, args: serde_json::Value| -> Vec<String> {
        let notes: Vec<NoteListItem> = ok(call(&window, command, args));
        notes.into_iter().map(|n| n.path).collect()
    };
    let by_title = json!({ "folder": "", "order": "title" });
    assert_eq!(paths("list_notes", by_title), ["a.md", "b.md"]);
    let by_date = json!({ "folder": "", "order": "modified" });
    assert_eq!(paths("list_notes", by_date), ["b.md", "a.md"]);
    let results: Vec<SearchResultItem> = ok(call(
        &window,
        "search_notes",
        json!({ "query": "pain", "order": "title" }),
    ));
    assert_eq!(results[0].path, "a.md");
}

#[test]
fn the_interface_follows_links_between_notes_by_title_and_path() {
    let window = window(&[
        ("courses.md", "# Courses"),
        ("b.md", "# Lundi\n[[courses]]"),
    ]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let target: Option<String> = ok(call(&window, "resolve_link", json!({ "title": "Courses" })));
    assert_eq!(target.as_deref(), Some("courses.md"));
    let missing: Option<String> = ok(call(&window, "resolve_link", json!({ "title": "Mardi" })));
    assert_eq!(missing, None);
    let backlinks: Vec<LinkingNoteItem> = ok(call(
        &window,
        "list_backlinks",
        json!({ "path": "courses.md" }),
    ));
    assert_eq!(
        backlinks
            .iter()
            .map(|n| n.title.as_str())
            .collect::<Vec<_>>(),
        ["Lundi"]
    );
}

#[test]
fn the_interface_lists_every_note_of_the_workspace_for_quick_open() {
    let window = window(&[("a.md", "# Alpha"), ("Travail/b.md", "# Bêta")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let notes: Vec<WorkspaceNoteItem> = ok(call(&window, "list_all_notes", json!({})));
    assert_eq!(
        notes.iter().map(|n| n.path.as_str()).collect::<Vec<_>>(),
        ["Travail/b.md", "a.md"]
    );
}

#[test]
fn the_interface_pins_and_unpins_a_note_by_its_path() {
    let window = window(&[("a.md", "# Alpha"), ("b.md", "# Bêta")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let pinned: NoteContent = ok(call(&window, "pin_note", json!({ "path": "a.md" })));
    assert_eq!(pinned.content, "---\npinned: true\n---\n# Alpha");
    let notes: Vec<NoteListItem> = ok(call(
        &window,
        "list_notes",
        json!({ "folder": "", "order": "modified" }),
    ));
    assert_eq!(
        notes
            .iter()
            .map(|n| (n.path.as_str(), n.pinned))
            .collect::<Vec<_>>(),
        [("a.md", true), ("b.md", false)]
    );
    let unpinned: NoteContent = ok(call(&window, "unpin_note", json!({ "path": "a.md" })));
    assert_eq!(unpinned.content, "# Alpha");
}

#[test]
fn a_note_goes_to_the_trash_and_comes_back_with_the_argument_names_used_by_the_interface() {
    let window = window(&[("Travail/lundi.md", "# Lundi")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let at: String = ok(call(
        &window,
        "trash_note",
        json!({ "path": "Travail/lundi.md" }),
    ));
    assert_eq!(at, "Travail/lundi.md");
    let trash: TrashInfo = ok(call(&window, "list_trash", json!({})));
    assert_eq!(trash.notes[0].title, "Lundi");
    let restored: SavedNote = ok(call(
        &window,
        "restore_note",
        json!({ "path": "Travail/lundi.md" }),
    ));
    assert_eq!(restored.path, "Travail/lundi.md");
}

#[test]
fn a_folder_goes_to_the_trash_comes_back_and_the_trash_is_emptied() {
    let window = window(&[("Travail/lundi.md", "# Lundi")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let at: String = ok(call(&window, "trash_folder", json!({ "path": "Travail" })));
    assert_eq!(at, "Travail");
    let back: String = ok(call(
        &window,
        "restore_folder",
        json!({ "path": "Travail" }),
    ));
    assert_eq!(back, "Travail");
    call(&window, "trash_folder", json!({ "path": "Travail" })).unwrap();
    call(&window, "empty_trash", json!({})).unwrap();
    let trash: TrashInfo = ok(call(&window, "list_trash", json!({})));
    assert!(trash.folders.is_empty() && trash.notes.is_empty());
}

fn opened_with(notes: &[(&str, &str)]) -> WebviewWindow<MockRuntime> {
    let window = window(notes);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    window
}

/// `content` en base64 : les octets d'un fichier ne voyagent jamais en corps brut.
const PNG_BASE64: &str = "iVBORw==";

#[test]
fn a_dropped_file_is_attached_under_its_name_whatever_way_the_webview_carries_it() {
    let window = opened_with(&[("Voyages/été.md", "# Été")]);
    // Arguments JSON ordinaires : ils arrivent pareil par `ipc://` et par le repli `postMessage`.
    let attached: AttachedFile = ok(call(
        &window,
        "attach_file",
        json!({
            "note": "Voyages/été.md",
            "fileName": "billet d'avion.pdf",
            "content": PNG_BASE64,
        }),
    ));
    assert_eq!(
        attached.markdown,
        "[billet d'avion.pdf](été.assets/billet%20d'avion.pdf)"
    );
    assert!(BRIDGE_SOURCE.contains("\"attach_file\", {"));
    assert!(!BRIDGE_SOURCE.contains("headers"));
}

#[test]
fn a_pasted_image_is_named_after_the_moment() {
    let window = opened_with(&[("a.md", "# A")]);
    let attached: AttachedFile = ok(call(
        &window,
        "attach_file",
        json!({ "note": "a.md", "mediaType": "image/png", "content": PNG_BASE64 }),
    ));
    assert_eq!(attached.markdown, "![](a.assets/image-2026-11-16-1830.png)");
}

#[test]
fn an_incomplete_attachment_is_refused() {
    let window = opened_with(&[("a.md", "# A")]);
    let refused = "le fichier à joindre n'a pas été reçu en entier";
    for content in ["pas du base64 !", "", "iVBOR"] {
        let broken = call(
            &window,
            "attach_file",
            json!({ "note": "a.md", "mediaType": "image/png", "content": content }),
        );
        assert_eq!(error_message(broken), refused);
    }
    let no_name = call(
        &window,
        "attach_file",
        json!({ "note": "a.md", "content": PNG_BASE64 }),
    );
    assert_eq!(error_message(no_name), refused);
}

#[test]
fn only_web_addresses_and_attachments_of_the_note_can_be_opened() {
    let window = opened_with(&[("a.md", "# A")]);
    let elsewhere = call(
        &window,
        "open_link_target",
        json!({ "path": "a.md", "target": "../../etc/passwd" }),
    );
    assert_eq!(
        error_message(elsewhere),
        "« ../../etc/passwd » n'est pas une pièce jointe de la note"
    );
    let missing = call(
        &window,
        "open_link_target",
        json!({ "path": "a.md", "target": "a.assets/absent.pdf" }),
    );
    assert_eq!(
        error_message(missing),
        "la pièce jointe « absent.pdf » est introuvable"
    );
}
