//! Les commandes de la colonne Claude Code, appelées comme le fait l'interface (nom, arguments
//! JSON), sur le faux Claude Code.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::{Arc, Mutex};
use std::time::Duration;

use api::Session;
use api::commands::invoke_handler;
use application::ClaudeStatus;
use application::testing::{
    FakeClaudeCode, FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore,
};
use domain::claude::{ClaudeEvent, ConversationId, TurnOutcome, TurnSummary};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{Listener, WebviewWindow, WebviewWindowBuilder};

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

fn status(window: &WebviewWindow<MockRuntime>) -> Value {
    call(window, "claude_status", json!({})).unwrap()
}

/// Une fenêtre simulée sur un espace de travail ouvert, avec ce Claude Code.
fn opened_window(claude: &Arc<FakeClaudeCode>) -> WebviewWindow<MockRuntime> {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::default()))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    )
    .with_claude(Arc::clone(claude) as Arc<dyn application::ClaudeCode>);
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    let app = mock_builder()
        .manage(Arc::new(session))
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap()
}

fn summary() -> ClaudeEvent {
    ClaudeEvent::Summary(TurnSummary {
        outcome: TurnOutcome::Succeeded,
        duration: Duration::from_millis(1500),
        tokens: 20,
    })
}

#[test]
fn each_event_of_a_turn_reaches_the_page_under_the_names_it_uses() {
    let claude = Arc::new(FakeClaudeCode::replaying(vec![
        ClaudeEvent::ConversationStarted(ConversationId::new("c1").unwrap()),
        ClaudeEvent::Message {
            agent: None,
            text: "Bonjour !".to_owned(),
        },
        summary(),
    ]));
    let window = opened_window(&claude);
    let received = Arc::new(Mutex::new(Vec::new()));
    let kept = Arc::clone(&received);
    window.listen_any("claude-event", move |event| {
        kept.lock()
            .unwrap()
            .push(serde_json::from_str::<Value>(event.payload()).unwrap());
    });
    let answer = call(&window, "send_to_claude", json!({ "message": "Salut" }));
    assert_eq!(answer, Ok(Value::Null));
    assert_eq!(
        *received.lock().unwrap(),
        [
            json!({ "kind": "message", "agent": null, "text": "Bonjour !" }),
            json!({ "kind": "summary", "failure": null, "durationMs": 1500, "tokens": 20 }),
        ]
    );
    assert_eq!(claude.requests()[0].2, "Salut");
    for name in ["\"send_to_claude\"", "\"claude-event\""] {
        assert!(BRIDGE_SOURCE.contains(name), "{name} absent du pont");
    }
}

#[test]
fn a_new_conversation_is_asked_under_the_name_used_by_the_page() {
    let claude = Arc::new(FakeClaudeCode::replaying(vec![
        ClaudeEvent::ConversationStarted(ConversationId::new("c1").unwrap()),
    ]));
    let window = opened_window(&claude);
    call(&window, "send_to_claude", json!({ "message": "Un" })).unwrap();
    assert_eq!(
        call(&window, "new_conversation", json!({})),
        Ok(Value::Null)
    );
    call(&window, "send_to_claude", json!({ "message": "Deux" })).unwrap();
    assert_eq!(claude.requests()[1].1, None);
    assert!(BRIDGE_SOURCE.contains("\"new_conversation\""));
}

#[test]
fn a_turn_without_a_workspace_answers_why_and_stopping_changes_nothing() {
    let claude = Arc::new(FakeClaudeCode::replaying(vec![summary()]));
    let opened = opened_window(&claude);
    assert_eq!(call(&opened, "stop_claude", json!({})), Ok(Value::Null));
    assert!(BRIDGE_SOURCE.contains("\"stop_claude\""));
    let without = window(None);
    let refused = call(&without, "send_to_claude", json!({ "message": "Salut" })).unwrap_err();
    assert_eq!(
        refused,
        json!({ "message": "aucun espace de travail n'est ouvert" })
    );
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

#[test]
fn a_running_turn_stops_under_the_name_used_by_the_page() {
    let claude = Arc::new(FakeClaudeCode::hanging(vec![summary()]));
    let window = opened_window(&claude);
    std::thread::scope(|scope| {
        let running = scope.spawn(|| call(&window, "send_to_claude", json!({ "message": "Un" })));
        while claude.requests().is_empty() {
            std::thread::yield_now();
        }
        assert_eq!(call(&window, "stop_claude", json!({})), Ok(Value::Null));
        assert_eq!(
            running.join().unwrap(),
            Err(json!({ "message": "la réponse de Claude a été arrêtée" }))
        );
    });
}
