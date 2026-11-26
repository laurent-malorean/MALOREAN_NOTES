//! La corbeille d'un CRM, appelée comme le fait l'interface (fiche 0091).

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
            ("c.md", "---\ntype: crm\n---\n# CRM1\n"),
            ("c/actions/a.md", "---\ntype: crm-action\n---\n# Action\n"),
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
fn a_crm_goes_to_the_trash_with_its_fiches_the_interface_asks_how_many_first() {
    let window = window();
    let count = call(&window, "crm_fiches_in_trash", json!({ "path": "c.md" })).unwrap();
    assert_eq!(count, json!(1));
    call(&window, "trash_note", json!({ "path": "c.md" })).unwrap();
    let trash = call(&window, "list_trash", json!({})).unwrap();
    assert_eq!(trash["notes"].as_array().unwrap().len(), 2);
}
