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
use domain::claude::{
    ChangesAfterWeb, ClaudeEvent, ClaudeModel, ConversationId, Effort, TurnOutcome, TurnSettings,
    TurnSummary,
};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};

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
fn each_event_of_a_turn_reaches_the_interface_under_the_names_it_uses() {
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
    let answer = call(
        &window,
        "send_to_claude",
        json!({ "message": "Salut", "conversation": null, "settings": { "model": null, "effort": null }, "changesAllowed": false }),
    );
    assert_eq!(answer, Ok(Value::Null));
    assert_eq!(
        *received.lock().unwrap(),
        [
            json!({ "kind": "conversationStarted", "conversation": "c1" }),
            json!({ "kind": "message", "agent": null, "text": "Bonjour !" }),
            json!({ "kind": "summary", "failure": null, "durationMs": 1500, "tokens": 20 }),
        ]
    );
    assert_eq!(claude.requests()[0].3, "Salut");
    for name in ["\"send_to_claude\"", "\"claude-event\""] {
        assert!(BRIDGE_SOURCE.contains(name), "{name} absent du pont");
    }
}

#[test]
fn the_conversation_of_the_tab_is_continued_with_the_settings_of_the_turn() {
    let claude = Arc::new(FakeClaudeCode::replaying(vec![summary()]));
    let window = opened_window(&claude);
    call(
        &window,
        "send_to_claude",
        json!({
            "message": "Deux",
            "conversation": "c1",
            "settings": { "model": "opus", "effort": "max" },
            "changesAllowed": true,
        }),
    )
    .unwrap();
    assert_eq!(
        claude.requests()[0].1,
        Some(ConversationId::new("c1").unwrap())
    );
    assert_eq!(
        claude.requests()[0].2,
        TurnSettings {
            model: Some(ClaudeModel::Opus),
            effort: Some(Effort::Max),
            changes_after_web: ChangesAfterWeb::Allowed,
        }
    );
}

#[test]
fn a_conversation_unlike_those_of_claude_code_is_refused_before_any_turn() {
    let claude = Arc::new(FakeClaudeCode::replaying(vec![summary()]));
    let window = opened_window(&claude);
    let refused = call(
        &window,
        "send_to_claude",
        json!({ "message": "Un", "conversation": "--help", "settings": { "model": null, "effort": null }, "changesAllowed": false }),
    );
    assert_eq!(
        refused,
        Err(
            json!({ "message": "la conversation à continuer est inconnue : commencez-en une nouvelle" })
        )
    );
    assert!(claude.requests().is_empty());
}

#[test]
fn a_turn_without_a_workspace_answers_why_and_stopping_changes_nothing() {
    let claude = Arc::new(FakeClaudeCode::replaying(vec![summary()]));
    let opened = opened_window(&claude);
    assert_eq!(call(&opened, "stop_claude", json!({})), Ok(Value::Null));
    assert!(BRIDGE_SOURCE.contains("\"stop_claude\""));
    let without = window(None);
    let refused = call(
        &without,
        "send_to_claude",
        json!({ "message": "Salut", "conversation": null, "settings": { "model": null, "effort": null }, "changesAllowed": false }),
    )
    .unwrap_err();
    assert_eq!(
        refused,
        json!({ "message": "aucun espace de travail n'est ouvert" })
    );
}

#[test]
fn a_connected_claude_code_is_ready_under_the_name_used_by_the_interface() {
    let window = window(Some(FakeClaudeCode::default()));
    assert_eq!(
        status(&window),
        json!({ "kind": "ready", "email": null, "organization": null })
    );
    assert!(BRIDGE_SOURCE.contains("\"claude_status\""));
}

#[test]
fn a_logged_out_claude_code_tells_how_to_log_in() {
    let window = window(Some(
        FakeClaudeCode::default().with_status(ClaudeStatus::LoggedOut),
    ));
    let reason = "Claude Code n'est pas connecté à votre abonnement Claude : cliquez sur « Se connecter », ou tapez « claude auth login » dans le Terminal puis rouvrez la colonne Claude Code";
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
fn a_running_turn_stops_under_the_name_used_by_the_interface() {
    let claude = Arc::new(FakeClaudeCode::hanging(vec![summary()]));
    let window = opened_window(&claude);
    std::thread::scope(|scope| {
        let running = scope.spawn(|| {
            call(
                &window,
                "send_to_claude",
                json!({ "message": "Un", "conversation": null, "settings": { "model": null, "effort": null }, "changesAllowed": false }),
            )
        });
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

#[test]
fn the_app_tools_reach_the_interface_by_events_and_its_answer_by_a_command() {
    let claude = Arc::new(FakeClaudeCode::replaying(Vec::new()));
    let window = opened_window(&claude);
    let received = Arc::new(Mutex::new(Vec::new()));
    for name in ["claude-shows-note", "claude-asks-view"] {
        let kept = Arc::clone(&received);
        window.listen_any(name, move |event| {
            kept.lock()
                .unwrap()
                .push(format!("{name} {}", event.payload()));
        });
    }
    let screen = api::commands::claude::TauriScreen(window.app_handle().clone());
    api::AppScreen::show_note(&screen, "Travail/a.md");
    api::AppScreen::ask_view(&screen, 3);
    assert_eq!(
        *received.lock().unwrap(),
        ["claude-shows-note \"Travail/a.md\"", "claude-asks-view 3"]
    );
    let answer = call(
        &window,
        "answer_view",
        json!({ "request": 3, "note": null, "selection": "" }),
    );
    assert_eq!(answer, Ok(Value::Null));
    for name in [
        "\"answer_view\"",
        "\"claude-shows-note\"",
        "\"claude-asks-view\"",
    ] {
        assert!(BRIDGE_SOURCE.contains(name), "{name} absent du pont");
    }
}

/// Une fenêtre simulée sur un espace de travail ouvert (la note `a.md`), avec ce Claude Code ;
/// la session touche à l'interface par ses événements.
fn window_with_screen(claude: &Arc<FakeClaudeCode>) -> (WebviewWindow<MockRuntime>, Arc<Session>) {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(&[
            ("a.md", "# Alpha"),
        ])))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    )
    .with_claude(Arc::clone(claude) as Arc<dyn application::ClaudeCode>);
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    let app = mock_builder()
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    let screen = api::commands::claude::TauriScreen(app.handle().clone());
    let session = Arc::new(session.with_screen(Arc::new(screen)));
    app.manage(Arc::clone(&session));
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    (window, session)
}

#[test]
fn the_answer_of_the_interface_reaches_the_tool_that_asked_what_the_user_is_looking_at() {
    let claude = Arc::new(FakeClaudeCode::hanging(Vec::new()));
    let (window, session) = window_with_screen(&claude);
    let asked = Arc::new(Mutex::new(Vec::new()));
    let kept = Arc::clone(&asked);
    window.listen_any("claude-asks-view", move |event| {
        kept.lock().unwrap().push(event.payload().to_owned());
    });
    let asking = &*session;
    let viewed = std::thread::scope(|scope| {
        let turn = scope.spawn(|| {
            session.send_to_claude("Bonjour", None, TurnSettings::default(), None, |_| {})
        });
        while claude.tools_keys().is_empty() {
            std::thread::yield_now();
        }
        let key = claude.tools_keys()[0]
            .clone()
            .map(|key| key.as_str().to_owned());
        let request = json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call",
                              "params": { "name": "viewed_note", "arguments": {} } })
        .to_string();
        let tool = scope.spawn(move || asking.answer_app_tools(&key.unwrap_or_default(), &request));
        while asked.lock().unwrap().is_empty() {
            std::thread::yield_now();
        }
        let answer = call(
            &window,
            "answer_view",
            json!({ "request": 0, "note": "a.md", "selection": "Alpha" }),
        );
        let viewed = tool.join();
        session.stop_claude();
        let _ended = turn.join();
        (answer, viewed)
    });
    assert_eq!(viewed.0, Ok(Value::Null));
    let reply: Value = serde_json::from_str(&viewed.1.unwrap().unwrap()).unwrap();
    let text: Value =
        serde_json::from_str(reply["result"]["content"][0]["text"].as_str().unwrap()).unwrap();
    assert_eq!(
        text,
        json!({ "workspace": "Notes", "note": { "path": "a.md", "title": "Alpha" },
                "selection": "Alpha" })
    );
}
