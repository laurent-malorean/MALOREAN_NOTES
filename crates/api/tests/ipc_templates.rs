//! Les commandes du dossier des modèles, appelées comme le fait l'interface (fiche 0077).

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
        Arc::new(FakeOpener::new(Arc::new(
            InMemoryNoteStore::with_notes(&[]),
        ))),
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
    call(
        &window,
        "add_workspace",
        json!({ "name": "Travail", "folder": "/Users/moi/Travail" }),
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
fn the_interface_chooses_reads_and_clears_the_templates_folder_of_the_open_workspace() {
    let window = window();
    assert_eq!(
        call(&window, "templates_folder", json!({})).unwrap(),
        Value::Null
    );

    call(
        &window,
        "set_templates_folder",
        json!({ "folder": "Perso/Modèles" }),
    )
    .unwrap();
    assert_eq!(
        call(&window, "templates_folder", json!({})).unwrap(),
        json!("Perso/Modèles")
    );

    call(&window, "set_templates_folder", json!({ "folder": null })).unwrap();
    assert_eq!(
        call(&window, "templates_folder", json!({})).unwrap(),
        Value::Null
    );
    call(&window, "set_templates_folder", json!({ "folder": "A" })).unwrap();
    call(&window, "set_templates_folder", json!({ "folder": "  " })).unwrap();
    assert_eq!(
        call(&window, "templates_folder", json!({})).unwrap(),
        Value::Null
    );
}

#[test]
fn an_invalid_folder_is_refused_and_keeps_the_choice() {
    let window = window();
    call(&window, "set_templates_folder", json!({ "folder": "A" })).unwrap();

    let refused = call(
        &window,
        "set_templates_folder",
        json!({ "folder": "../dehors" }),
    );

    assert!(refused.is_err());
    assert_eq!(
        call(&window, "templates_folder", json!({})).unwrap(),
        json!("A")
    );
}

#[test]
fn the_folders_the_interface_kept_are_taken_once_for_each_workspace_with_that_folder() {
    let window = window();
    let kept = json!({ "chosen": [
        { "location": "/Users/moi/Notes", "folder": "Gabarits" },
        { "location": "/Users/moi/Ailleurs", "folder": "X" },
        { "location": "/Users/moi/Travail", "folder": "../invalide" },
    ] });

    let taken = call(&window, "import_templates_folders", kept.clone()).unwrap();

    assert_eq!(taken, json!(1));
    // « Travail » est ouvert : son dossier invalide a été ignoré.
    assert_eq!(
        call(&window, "templates_folder", json!({})).unwrap(),
        Value::Null
    );
    call(&window, "open_workspace", json!({ "name": "Notes" })).unwrap();
    assert_eq!(
        call(&window, "templates_folder", json!({})).unwrap(),
        json!("Gabarits")
    );
    assert_eq!(
        call(&window, "import_templates_folders", kept).unwrap(),
        json!(0)
    );
}

#[test]
fn without_a_workspace_open_the_templates_folder_is_refused() {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(
            InMemoryNoteStore::with_notes(&[]),
        ))),
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

    assert!(call(&window, "templates_folder", json!({})).is_err());
    assert!(call(&window, "set_templates_folder", json!({ "folder": "A" })).is_err());
}
