//! Les commandes, appelées comme le fait l'interface : nom, arguments JSON, réponse JSON.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::Arc;

use api::commands::invoke_handler;
use api::{LibraryInfo, NoteContent, NoteListItem, SavedNote, Session};
use application::testing::{FakeOpener, FakePreferences, InMemoryNoteStore};
use application::{LibraryLocation, Preferences};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

const BRIDGE_SOURCE: &str = include_str!("../../../ui/src/bridge/index.ts");

/// Une fenêtre simulée, branchée sur une bibliothèque en mémoire déjà rouvrable.
fn window(notes: &[(&str, &str)]) -> WebviewWindow<MockRuntime> {
    let preferences = FakePreferences::default();
    preferences
        .remember_library(&LibraryLocation::new("/Users/moi/Notes").unwrap())
        .unwrap();
    let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
    let session = Session::new(Arc::new(opener), Arc::new(preferences));
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
fn nothing_can_be_listed_before_a_library_is_open() {
    let window = window(&[]);
    assert_eq!(
        error_message(call(&window, "list_notes", json!({ "folder": "" }))),
        "aucune bibliothèque n'est ouverte"
    );
}

#[test]
fn the_last_library_is_reopened_then_listed() {
    let window = window(&[("a.md", "# Alpha")]);
    let library: Option<LibraryInfo> = ok(call(&window, "reopen_last_library", json!({})));
    assert_eq!(library.map(|l| l.name), Some("Notes".into()));
    let notes: Vec<NoteListItem> = ok(call(&window, "list_notes", json!({ "folder": "" })));
    assert_eq!(
        notes.iter().map(|n| n.title.as_str()).collect::<Vec<_>>(),
        ["Alpha"]
    );
}

#[test]
fn a_note_is_read_with_the_argument_names_used_by_the_page() {
    let window = window(&[("a.md", "# Alpha\ntexte")]);
    call(&window, "reopen_last_library", json!({})).unwrap();
    let note: NoteContent = ok(call(&window, "read_note", json!({ "path": "a.md" })));
    assert_eq!(note.content, "# Alpha\ntexte");
}

#[test]
fn saving_a_new_title_renames_the_file() {
    let window = window(&[("a.md", "# Alpha")]);
    call(&window, "reopen_last_library", json!({})).unwrap();
    let saved: SavedNote = ok(call(
        &window,
        "save_note",
        json!({ "path": "a.md", "content": "# Bêta" }),
    ));
    assert_eq!(saved.path, "beta.md");
}

#[test]
fn a_created_note_is_untitled() {
    let window = window(&[]);
    call(&window, "reopen_last_library", json!({})).unwrap();
    let created: SavedNote = ok(call(&window, "create_note", json!({ "folder": "" })));
    assert_eq!(created.path, "sans-titre.md");
}

#[test]
fn a_dangerous_name_sent_by_the_page_is_refused() {
    let window = window(&[]);
    call(&window, "reopen_last_library", json!({})).unwrap();
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
    call(&window, "reopen_last_library", json!({})).unwrap();
    assert!(call(&window, "read_note", json!({})).is_err());
}

#[test]
fn every_command_called_by_the_page_exists() {
    let window = window(&[]);
    let called: Vec<&str> = BRIDGE_SOURCE
        .split("invoke<")
        .skip(1)
        .filter_map(|rest| rest.split('"').nth(1))
        .collect();
    assert!(called.len() >= 6, "commandes trouvées : {called:?}");
    for command in called.into_iter().filter(|c| *c != "choose_library") {
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
        "reopen_last_library",
        json!({}),
    );
    assert!(result.unwrap_err().to_string().contains("not allowed"));
}

#[test]
fn the_window_can_load_the_files_of_the_open_library_only() {
    let window = window(&[]);
    let scope = window.asset_protocol_scope();
    let image = "/Users/moi/Notes/voyage.assets/mer.png";
    assert!(!scope.is_allowed(image));
    call(&window, "reopen_last_library", json!({})).unwrap();
    assert!(scope.is_allowed(image));
    assert!(!scope.is_allowed("/Users/moi/Documents/secret.png"));
}

#[test]
fn folders_are_handled_with_the_argument_names_used_by_the_page() {
    let window = window(&[("Travail/a.md", "# A")]);
    call(&window, "reopen_last_library", json!({})).unwrap();
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
        json!({ "folder": "Maison/Travail" }),
    ));
    assert_eq!(notes[0].path, "Maison/Travail/a.md");
}
