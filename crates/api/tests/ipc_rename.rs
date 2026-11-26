//! La commande « Renommer… » d'un contenu, appelée comme le fait l'interface (fiche 0090).

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::Arc;

use api::Session;
use api::commands::invoke_handler;
use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};

fn window() -> WebviewWindow<MockRuntime> {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(&[
            ("a.md", "# Alpha"),
            ("idee.md", "# Idée"),
        ])))),
        Arc::new(FakePreferences::default()),
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
    call(
        &window,
        "add_workspace",
        json!({ "name": "Notes", "folder": "/Users/moi/Notes" }),
    )
    .unwrap();
    window
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
fn renaming_a_note_takes_the_path_and_title_arguments_of_the_interface() {
    let window = window();
    let renamed = call(
        &window,
        "rename_note",
        json!({ "path": "a.md", "title": "Bêta" }),
    )
    .unwrap();
    assert_eq!(renamed["path"], "beta.md");
    assert_eq!(renamed["title"], "Bêta");
    assert_eq!(renamed["conflictCopy"], Value::Null);
}

#[test]
fn a_refused_title_comes_back_as_a_french_message() {
    let window = window();
    let taken = call(
        &window,
        "rename_note",
        json!({ "path": "a.md", "title": "Idée" }),
    )
    .unwrap_err();
    assert_eq!(
        taken["message"],
        "une note de ce dossier porte déjà ce titre"
    );
    let empty = call(
        &window,
        "rename_note",
        json!({ "path": "a.md", "title": " " }),
    )
    .unwrap_err();
    assert_eq!(empty["message"], "le titre est vide");
}
