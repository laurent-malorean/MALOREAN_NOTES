//! Les commandes des étiquettes, des notes récentes et de l'index, appelées comme le fait
//! l'interface : nom, arguments JSON.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::Arc;

use api::Session;
use api::commands::invoke_handler;
use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};
use application::{Preferences, Workspace, WorkspaceLocation, WorkspaceName, Workspaces};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};

const BRIDGE_SOURCE: &str = include_str!("../../../ui/src/bridge/index.ts");

/// Une fenêtre simulée sur un espace de travail en mémoire, déjà rouvert.
fn window(notes: &[(&str, &str)]) -> WebviewWindow<MockRuntime> {
    let window = unopened(notes);
    call(&window, "reopen_last_workspace", json!({}));
    window
}

/// La même fenêtre, avant que l'espace de travail ne soit rouvert.
fn unopened(notes: &[(&str, &str)]) -> WebviewWindow<MockRuntime> {
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
    );
    let app = mock_builder()
        .manage(Arc::new(session))
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap()
}

fn call(window: &WebviewWindow<MockRuntime>, command: &str, args: Value) -> Value {
    try_call(window, command, args).unwrap()
}

fn try_call(
    window: &WebviewWindow<MockRuntime>,
    command: &str,
    args: Value,
) -> Result<Value, Value> {
    let request = InvokeRequest {
        cmd: command.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "tauri://localhost".parse().unwrap(),
        body: InvokeBody::Json(args),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };
    get_ipc_response(window, request).map(|body| body.deserialize::<Value>().unwrap())
}

fn paths(notes: &Value) -> Vec<&str> {
    notes
        .as_array()
        .unwrap()
        .iter()
        .map(|note| note["path"].as_str().unwrap())
        .collect()
}

const NOTES: &[(&str, &str)] = &[
    ("a.md", "---\ntags: [perso]\n---\n# Alpha"),
    ("b.md", "# Bêta"),
];

#[test]
fn tags_and_tagged_notes_are_listed_with_the_argument_names_used_by_the_interface() {
    let window = window(NOTES);
    let tags = call(&window, "list_tags", json!({}));
    assert_eq!(tags, json!([{ "name": "perso", "count": 1 }]));
    let args = json!({ "tag": "perso", "order": "title" });
    assert_eq!(paths(&call(&window, "list_tagged_notes", args)), ["a.md"]);
    assert!(BRIDGE_SOURCE.contains("\"list_tagged_notes\", { tag, order }"));
}

#[test]
fn the_tags_of_a_content_are_read_and_changed_with_the_argument_names_used_by_the_interface() {
    let window = window(NOTES);
    let read = call(&window, "note_tags", json!({ "path": "a.md" }));
    assert_eq!(read, json!(["perso"]));
    let args = json!({ "path": "b.md", "tags": ["neuf", "perso"] });
    assert_eq!(
        call(&window, "change_note_tags", args),
        json!(["neuf", "perso"])
    );
    let tags = call(&window, "list_tags", json!({}));
    assert_eq!(
        tags,
        json!([{ "name": "neuf", "count": 1 }, { "name": "perso", "count": 2 }])
    );
    assert!(BRIDGE_SOURCE.contains("\"note_tags\", { path }"));
    assert!(BRIDGE_SOURCE.contains("\"change_note_tags\", { path, tags }"));
}

#[test]
fn recent_notes_are_listed_with_the_argument_names_used_by_the_interface() {
    let window = window(NOTES);
    let args = json!({ "paths": ["b.md", "a.md"] });
    assert_eq!(
        paths(&call(&window, "list_recent_notes", args)),
        ["b.md", "a.md"]
    );
    assert!(BRIDGE_SOURCE.contains("\"list_recent_notes\", { paths }"));
}

#[test]
fn the_index_is_rebuilt_on_request_of_the_interface() {
    let closed = unopened(NOTES);
    let refused = try_call(&closed, "rebuild_index", json!({})).unwrap_err();
    assert!(
        refused.to_string().contains("aucun espace de travail"),
        "{refused}"
    );
    let window = window(NOTES);
    assert_eq!(call(&window, "rebuild_index", json!({})), Value::Null);
    let notes = call(
        &window,
        "list_notes",
        json!({"folder": "", "order": "title"}),
    );
    assert_eq!(paths(&notes), ["a.md", "b.md"]);
    assert!(BRIDGE_SOURCE.contains("\"rebuild_index\""));
}

#[test]
fn the_index_overview_is_read_on_request_of_the_interface() {
    let closed = unopened(NOTES);
    assert!(try_call(&closed, "index_overview", json!({})).is_err());
    let window = window(NOTES);
    let before = call(&window, "index_overview", json!({}));
    assert_eq!(before, json!({"notes": 2, "total": 2, "rebuilt": null}));
    call(&window, "rebuild_index", json!({}));
    let after = call(&window, "index_overview", json!({}));
    assert_eq!(after["rebuilt"], "16 novembre 2026 à 18:30");
    assert!(BRIDGE_SOURCE.contains("\"index_overview\""));
}
