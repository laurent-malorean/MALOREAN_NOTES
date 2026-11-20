//! Le compte Claude de la colonne Claude Code (se connecter, se déconnecter, compte montré),
//! appelé comme le fait l'interface (nom, arguments JSON), sur le faux Claude Code.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::{Arc, Mutex};

use api::commands::invoke_handler;
use api::{ClaudeStatusItem, Session};
use application::testing::{
    FakeClaudeCode, FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore,
};
use application::{ClaudeAccount, ClaudeCode, ClaudeStatus};
use domain::claude::{ClaudeEvent, ConversationId};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{Listener, WebviewWindow, WebviewWindowBuilder};

const BRIDGE_SOURCE: &str = include_str!("../../../ui/src/bridge/index.ts");

/// Une fenêtre simulée sur un espace de travail ouvert, avec ce Claude Code, ou sans.
fn window(claude: Option<&Arc<FakeClaudeCode>>) -> WebviewWindow<MockRuntime> {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::default()))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    let session = match claude {
        Some(claude) => session.with_claude(Arc::clone(claude) as Arc<dyn ClaudeCode>),
        None => session,
    };
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

fn call(window: &WebviewWindow<MockRuntime>, command: &str) -> Result<Value, Value> {
    call_with(window, command, json!({}))
}

fn call_with(
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

fn send(window: &WebviewWindow<MockRuntime>) {
    call_with(
        window,
        "send_to_claude",
        json!({ "message": "Salut", "settings": { "model": null, "effort": null }, "changesAllowed": false }),
    )
    .unwrap();
}

fn other_account() -> ClaudeAccount {
    ClaudeAccount {
        email: Some("autre@example.com".to_owned()),
        organization: Some("Autre".to_owned()),
    }
}

/// Un faux Claude Code connecté, dont chaque tour commence la conversation `c1`.
fn conversing() -> FakeClaudeCode {
    FakeClaudeCode::replaying(vec![ClaudeEvent::ConversationStarted(
        ConversationId::new("c1").unwrap(),
    )])
}

#[test]
fn the_account_claude_code_is_logged_in_with_reaches_the_interface() {
    let claude = Arc::new(FakeClaudeCode::default().with_status(ClaudeStatus::Ready(
        ClaudeAccount {
            email: Some("moi@example.com".to_owned()),
            organization: Some("Moi".to_owned()),
        },
    )));
    assert_eq!(
        call(&window(Some(&claude)), "claude_status"),
        Ok(json!({ "kind": "ready", "email": "moi@example.com", "organization": "Moi" }))
    );
}

#[test]
fn the_account_never_shows_in_the_debug_output_of_the_status() {
    let ready = ClaudeStatusItem::Ready {
        email: Some("moi@example.com".to_owned()),
        organization: Some("Moi".to_owned()),
    };
    assert_eq!(format!("{ready:?}"), "Ready { .. }");
    let unavailable = ClaudeStatusItem::Unavailable {
        reason: "absent".to_owned(),
    };
    assert_eq!(
        format!("{unavailable:?}"),
        r#"Unavailable { reason: "absent" }"#
    );
}

#[test]
fn logging_in_gives_the_sign_in_address_then_the_new_account_and_a_new_conversation() {
    let claude = Arc::new(conversing().signing_in_as(other_account()));
    let window = window(Some(&claude));
    send(&window);
    let addresses = Arc::new(Mutex::new(Vec::new()));
    let kept = Arc::clone(&addresses);
    window.listen_any("claude-sign-in", move |event| {
        kept.lock()
            .unwrap()
            .push(serde_json::from_str::<Value>(event.payload()).unwrap());
    });
    assert_eq!(call(&window, "log_in_to_claude"), Ok(Value::Null));
    assert_eq!(
        *addresses.lock().unwrap(),
        [json!(FakeClaudeCode::SIGN_IN_ADDRESS)]
    );
    assert_eq!(
        call(&window, "claude_status"),
        Ok(json!({ "kind": "ready", "email": "autre@example.com", "organization": "Autre" }))
    );
    send(&window);
    assert_eq!(claude.requests()[1].1, None);
    for name in ["\"log_in_to_claude\"", "\"claude-sign-in\""] {
        assert!(BRIDGE_SOURCE.contains(name), "{name} absent du pont");
    }
}

#[test]
fn logging_out_leaves_claude_code_logged_out_and_forgets_the_conversation() {
    let claude = Arc::new(conversing());
    let window = window(Some(&claude));
    send(&window);
    assert_eq!(call(&window, "log_out_of_claude"), Ok(Value::Null));
    assert_eq!(
        call(&window, "claude_status").unwrap()["kind"],
        json!("unavailable")
    );
    send(&window);
    assert_eq!(claude.requests()[1].1, None);
    assert!(BRIDGE_SOURCE.contains("\"log_out_of_claude\""));
}

#[test]
fn a_failed_login_or_logout_says_what_to_do() {
    let claude = Arc::new(FakeClaudeCode::default().failing_to_sign_in());
    let window = window(Some(&claude));
    assert_eq!(
        call(&window, "log_in_to_claude"),
        Err(
            json!({ "message": "la connexion n'a pas abouti : réessayez, ou tapez « claude auth login » dans le Terminal" })
        )
    );
    assert_eq!(
        call(&window, "log_out_of_claude"),
        Err(
            json!({ "message": "la déconnexion n'a pas abouti : réessayez, ou tapez « claude auth logout » dans le Terminal" })
        )
    );
}

#[test]
fn without_claude_code_one_can_neither_log_in_nor_out() {
    let window = window(None);
    for command in ["log_in_to_claude", "log_out_of_claude"] {
        assert_eq!(
            call(&window, command).unwrap_err()["message"],
            json!(
                "Claude Code est introuvable : installez-le, puis rouvrez la colonne Claude Code"
            )
        );
    }
}

#[test]
fn a_login_waiting_for_the_browser_is_cancelled_by_stop() {
    let claude = Arc::new(conversing().waiting_for_the_browser());
    let window = window(Some(&claude));
    send(&window);
    let (sender, received) = std::sync::mpsc::channel();
    window.listen_any("claude-sign-in", move |_| sender.send(()).unwrap());
    std::thread::scope(|scope| {
        let running = scope.spawn(|| call(&window, "log_in_to_claude"));
        received.recv().unwrap();
        assert_eq!(call(&window, "stop_claude"), Ok(Value::Null));
        assert!(running.join().unwrap().is_err());
    });
    // Annulée, la connexion n'a rien changé : la conversation continue.
    send(&window);
    assert_eq!(
        claude.requests()[1].1,
        Some(ConversationId::new("c1").unwrap())
    );
}
