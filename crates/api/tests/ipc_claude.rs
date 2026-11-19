//! Les commandes de la colonne Claude Code, appelées comme le fait l'interface (nom, arguments
//! JSON), sur le faux Claude Code.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::Arc;

use api::Session;
use api::commands::invoke_handler;
use application::ClaudeStatus;
use application::testing::{
    FakeClaudeCode, FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore,
};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};

const BRIDGE_SOURCE: &str = include_str!("../../../ui/src/bridge/index.ts");

/// Une fenêtre simulée, sans espace de travail ouvert : la vérification de la connexion n'en a
/// pas besoin.
fn window(claude: Option<FakeClaudeCode>) -> WebviewWindow<MockRuntime> {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::default()))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    let session = match claude {
        Some(claude) => session.with_claude(Arc::new(claude)),
        None => session,
    };
    let app = mock_builder()
        .manage(Arc::new(session))
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap()
}

fn status(window: &WebviewWindow<MockRuntime>) -> Value {
    let request = InvokeRequest {
        cmd: "claude_status".into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "tauri://localhost".parse().unwrap(),
        body: InvokeBody::Json(json!({})),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };
    get_ipc_response(window, request)
        .unwrap()
        .deserialize::<Value>()
        .unwrap()
}

#[test]
fn a_connected_claude_code_is_ready_under_the_name_used_by_the_page() {
    let window = window(Some(FakeClaudeCode::default()));
    assert_eq!(status(&window), json!({ "kind": "ready" }));
    assert!(BRIDGE_SOURCE.contains("\"claude_status\""));
}

#[test]
fn a_logged_out_claude_code_tells_how_to_log_in() {
    let window = window(Some(
        FakeClaudeCode::default().with_status(ClaudeStatus::LoggedOut),
    ));
    let reason = "Claude Code n'est pas connecté à votre abonnement Claude : tapez « claude auth login » dans le Terminal, puis rouvrez la colonne Claude Code";
    assert_eq!(
        status(&window),
        json!({ "kind": "unavailable", "reason": reason })
    );
}

#[test]
fn claude_code_unable_to_tell_says_where_to_look() {
    let window = window(Some(
        FakeClaudeCode::default().with_status(ClaudeStatus::Failed),
    ));
    let reason = "Claude Code n'a pas pu dire s'il est connecté : tapez « claude auth status » dans le Terminal pour voir ce qui ne va pas";
    assert_eq!(
        status(&window),
        json!({ "kind": "unavailable", "reason": reason })
    );
}

#[test]
fn a_session_without_claude_code_tells_how_to_install_it() {
    let window = window(None);
    let reason = "Claude Code n'est pas installé sur ce Mac : installez-le, tapez « claude auth login » dans le Terminal, puis rouvrez la colonne Claude Code";
    assert_eq!(
        status(&window),
        json!({ "kind": "unavailable", "reason": reason })
    );
}
