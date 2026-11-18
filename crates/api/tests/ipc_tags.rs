//! Les commandes des étiquettes et des notes récentes, appelées comme le fait l'interface :
//! nom, arguments JSON.

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
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    call(&window, "reopen_last_workspace", json!({}));
    window
}

fn call(window: &WebviewWindow<MockRuntime>, command: &str, args: Value) -> Value {
    let request = InvokeRequest {
        cmd: command.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "tauri://localhost".parse().unwrap(),
        body: InvokeBody::Json(args),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };
    get_ipc_response(window, request)
        .unwrap()
        .deserialize::<Value>()
        .unwrap()
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
fn tags_and_tagged_notes_are_listed_with_the_argument_names_used_by_the_page() {
    let window = window(NOTES);
    let tags = call(&window, "list_tags", json!({}));
    assert_eq!(tags, json!([{ "name": "perso", "count": 1 }]));
    let args = json!({ "tag": "perso", "order": "title" });
    assert_eq!(paths(&call(&window, "list_tagged_notes", args)), ["a.md"]);
    assert!(BRIDGE_SOURCE.contains("\"list_tagged_notes\", { tag, order }"));
}

#[test]
fn recent_notes_are_listed_with_the_argument_names_used_by_the_page() {
    let window = window(NOTES);
    let args = json!({ "paths": ["b.md", "a.md"] });
    assert_eq!(
        paths(&call(&window, "list_recent_notes", args)),
        ["b.md", "a.md"]
    );
    assert!(BRIDGE_SOURCE.contains("\"list_recent_notes\", { paths }"));
}
