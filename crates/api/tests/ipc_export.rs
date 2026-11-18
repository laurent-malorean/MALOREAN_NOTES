//! Les commandes de l'export, appelées comme le fait l'interface : nom, arguments JSON.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::Arc;

use api::Session;
use api::commands::invoke_handler;
use application::testing::{
    FakeOpener, FakePreferences, FixedClock, InMemoryExportStore, InMemoryNoteStore,
};
use application::{Preferences, Workspace, WorkspaceLocation, WorkspaceName, Workspaces};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};

const BRIDGE_SOURCE: &str = include_str!("../../../ui/src/bridge/index.ts");

/// Une fenêtre simulée sur un espace de travail en mémoire, dont les exports vont dans `exports`.
fn window(notes: &[(&str, &str)], exports: Arc<InMemoryExportStore>) -> WebviewWindow<MockRuntime> {
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
    .with_exports(exports);
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
fn a_note_is_exported_in_markdown_with_the_argument_names_used_by_the_page() {
    let exports = Arc::new(InMemoryExportStore::default());
    let window = window(&[("a.md", "# Alpha\ntexte")], Arc::clone(&exports));
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let args = json!({ "path": "a.md", "destination": "/Users/moi/Documents/Alpha.md" });
    call(&window, "export_markdown", args).unwrap();
    assert_eq!(
        exports.file("/Users/moi/Documents/Alpha.md"),
        Some(b"# Alpha\ntexte".to_vec())
    );
    assert!(BRIDGE_SOURCE.contains("\"export_markdown\", { path, destination }"));
}

#[test]
fn a_pdf_is_refused_outside_a_complete_path() {
    let window = window(&[], Arc::new(InMemoryExportStore::default()));
    let refused = call(&window, "export_pdf", json!({ "destination": "Alpha.pdf" }));
    assert_eq!(
        refused.unwrap_err()["message"],
        "emplacement d'export invalide : « Alpha.pdf »"
    );
    assert!(BRIDGE_SOURCE.contains("\"export_pdf\", { destination }"));
    assert!(BRIDGE_SOURCE.contains("\"choose_export_file\", { title, format, folder }"));
}
