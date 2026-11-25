//! Les commandes de « Brancher une IA », appelées comme le fait l'interface (fiche 0056).

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::path::PathBuf;
use std::sync::Arc;

use api::commands::invoke_handler;
use api::{ConnectionInfo, Session};
use application::testing::{
    CountingSecretMaker, FakeConnectionSocket, FakeOpener, FakePreferences, FixedClock,
    InMemoryConnectionKeys, InMemoryNoteStore,
};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};

fn window(socket: &Arc<FakeConnectionSocket>) -> WebviewWindow<MockRuntime> {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(
            InMemoryNoteStore::with_notes(&[]),
        ))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    )
    .with_connection(
        Arc::new(InMemoryConnectionKeys::default()),
        Arc::new(CountingSecretMaker::default()),
        Arc::clone(socket) as _,
        PathBuf::from("/app/malorean-notes"),
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

fn call(window: &WebviewWindow<MockRuntime>, command: &str) -> Result<Value, Value> {
    let request = InvokeRequest {
        cmd: command.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "tauri://localhost".parse().unwrap(),
        body: InvokeBody::Json(json!({})),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };
    get_ipc_response(window, request).map(|body| body.deserialize::<Value>().unwrap())
}

fn info(result: Result<Value, Value>) -> ConnectionInfo {
    serde_json::from_value(result.unwrap()).unwrap()
}

#[test]
fn the_interface_creates_and_reads_the_connection_key() {
    let socket = Arc::new(FakeConnectionSocket::default());
    let window = window(&socket);
    assert_eq!(info(call(&window, "connection_info")).key, None);

    let created = info(call(&window, "create_connection_key")).key.unwrap();

    assert_eq!(created.secret, "secret-1");
    assert_eq!(created.created_on, "16 novembre 2026");
    assert!(created.claude_config.contains("--brancher"));
    assert!(created.codex_config.contains("/app/malorean-notes"));
    assert!(socket.is_open());
    assert_eq!(info(call(&window, "connection_info")).key, Some(created));
}

#[test]
fn the_interface_revokes_the_connection_key() {
    let socket = Arc::new(FakeConnectionSocket::default());
    let window = window(&socket);
    call(&window, "create_connection_key").unwrap();

    assert_eq!(call(&window, "revoke_connection_key").unwrap(), Value::Null);

    assert_eq!(info(call(&window, "connection_info")).key, None);
    assert!(!socket.is_open());
}

#[test]
fn the_json_the_interface_receives_uses_camel_case_names() {
    let window = window(&Arc::new(FakeConnectionSocket::default()));

    let created = call(&window, "create_connection_key").unwrap();

    let mut names: Vec<_> = created["key"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    names.sort();
    assert_eq!(
        names,
        ["claudeConfig", "codexConfig", "createdOn", "secret"]
    );
}
