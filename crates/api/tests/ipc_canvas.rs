//! Les commandes des canvas, appelées comme le fait l'interface : nom, arguments
//! JSON.

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

/// Une fenêtre simulée sur un espace de travail en mémoire, déjà rouvrable.
fn window(notes: &[(&str, &str)]) -> WebviewWindow<MockRuntime> {
    let preferences = FakePreferences::default();
    let first = Workspace {
        name: WorkspaceName::new("Notes").unwrap(),
        location: WorkspaceLocation::new("/Users/moi/Notes").unwrap(),
    };
    preferences
        .save_workspaces(&Workspaces::default().added(first).unwrap())
        .unwrap();
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(
            notes,
        )))),
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

fn call(window: &WebviewWindow<MockRuntime>, command: &str, args: Value) -> Result<Value, Value> {
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

#[test]
fn a_canvas_is_created_read_and_saved_with_the_argument_names_used_by_the_interface() {
    let window = window(&[("note.md", "# Note")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let created = call(
        &window,
        "create_canvas",
        json!({ "folder": "", "title": "Projet" }),
    )
    .unwrap();
    assert_eq!(created, json!({ "path": "projet.canvas" }));
    let read = call(&window, "read_canvas", json!({ "path": "projet.canvas" })).unwrap();
    let canvas = json!({
        "cards": [{
            "id": "a3f9c2d41b7e8056", "kind": "text", "text": "Bonjour", "file": null,
            "subpath": null, "url": null, "label": null, "background": null,
            "backgroundStyle": null, "x": 10.0, "y": 20.0, "width": 250.0, "height": 60.0,
            "color": null, "palette": "bleu", "extra": []
        }],
        "arrows": [],
        "extra": [],
    });
    let saved = call(
        &window,
        "save_canvas",
        json!({ "path": "projet.canvas", "base": read["text"], "canvas": canvas }),
    )
    .unwrap();
    assert_eq!(saved["canvas"]["cards"][0]["color"], "#2563eb");
    assert_eq!(saved["canvas"]["cards"][0]["x"], 10.0);
    assert!(BRIDGE_SOURCE.contains("\"create_canvas\", { folder, title }"));
    assert!(BRIDGE_SOURCE.contains("\"read_canvas\", { path }"));
    assert!(BRIDGE_SOURCE.contains("\"save_canvas\", { path, base, canvas }"));
}

#[test]
fn a_note_that_is_not_a_canvas_is_refused() {
    let window = window(&[("note.md", "# Note")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let refused = call(&window, "read_canvas", json!({ "path": "note.md" }));
    assert_eq!(
        refused.unwrap_err()["message"],
        "ce fichier n'est pas un canvas"
    );
}
