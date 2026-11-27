//! Les commandes des serveurs MCP extérieurs de la colonne Claude Code, appelées comme le fait
//! l'interface (nom, arguments JSON en camelCase), sur le faux Claude Code (fiche 0105).

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::Arc;

use api::Session;
use api::commands::invoke_handler;
use application::testing::{
    FakeClaudeCode, FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore,
};
use application::{ClaudeError, ClaudeStatus};
use domain::claude::TurnSettings;
use domain::external_servers::{ExternalServer, ServerName, ServerState};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};

const BRIDGE_SOURCE: &str = include_str!("../../../ui/src/bridge/mcp-servers.ts");

fn server(name: &str, state: ServerState) -> ExternalServer {
    ExternalServer {
        name: ServerName::new(name).unwrap(),
        state,
    }
}

fn claude() -> FakeClaudeCode {
    FakeClaudeCode::default().knowing_servers(vec![
        server("claude.ai Slack", ServerState::Connected),
        server("claude.ai Figma", ServerState::ToConnect),
        server("mon-serveur", ServerState::Failed),
        server("plugin:rag:rag", ServerState::Failed),
        server("claude.ai Noota", ServerState::Connected),
    ])
}

/// Une fenêtre simulée sur un espace de travail ouvert ; `claude` : Claude Code, s'il y en a un.
fn window(claude: Option<&Arc<FakeClaudeCode>>) -> (Arc<Session>, WebviewWindow<MockRuntime>) {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::default()))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    let session = match claude {
        Some(claude) => session.with_claude(Arc::clone(claude) as Arc<dyn application::ClaudeCode>),
        None => session,
    };
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    let session = Arc::new(session);
    let app = mock_builder()
        .manage(Arc::clone(&session))
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    (session, window)
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

fn line(name: &str, display: &str, connector: bool, state: &str, allowed: bool) -> Value {
    json!({
        "name": name,
        "displayName": display,
        "connector": connector,
        "state": state,
        "allowed": allowed,
    })
}

#[test]
fn the_list_is_sorted_without_the_plugin_servers_and_none_is_checked_at_first() {
    let (_session, window) = window(Some(&Arc::new(claude())));
    assert_eq!(
        call(&window, "list_mcp_servers", json!({})).unwrap(),
        json!({ "kind": "listed", "servers": [
            line("claude.ai Figma", "Figma", true, "toConnect", false),
            line("mon-serveur", "mon-serveur", false, "failed", false),
            line("claude.ai Noota", "Noota", true, "connected", false),
            line("claude.ai Slack", "Slack", true, "connected", false),
        ]})
    );
    for name in [
        "\"list_mcp_servers\"",
        "\"allow_mcp_server\"",
        "\"disallow_mcp_server\"",
    ] {
        assert!(BRIDGE_SOURCE.contains(name), "{name} absent du pont");
    }
}

#[test]
fn checking_and_unchecking_a_server_is_kept_and_shown_in_the_list() {
    let (_session, window) = window(Some(&Arc::new(claude())));
    let checked = |window: &WebviewWindow<MockRuntime>| -> Vec<String> {
        call(window, "list_mcp_servers", json!({})).unwrap()["servers"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|line| line["allowed"] == true)
            .map(|line| line["name"].as_str().unwrap().to_owned())
            .collect()
    };
    assert_eq!(
        call(
            &window,
            "allow_mcp_server",
            json!({ "name": "claude.ai Noota" })
        ),
        Ok(Value::Null)
    );
    assert_eq!(checked(&window), ["claude.ai Noota"]);
    call(
        &window,
        "allow_mcp_server",
        json!({ "name": "mon-serveur" }),
    )
    .unwrap();
    assert_eq!(checked(&window), ["mon-serveur", "claude.ai Noota"]);
    assert_eq!(
        call(
            &window,
            "disallow_mcp_server",
            json!({ "name": "claude.ai Noota" })
        ),
        Ok(Value::Null)
    );
    assert_eq!(checked(&window), ["mon-serveur"]);
}

#[test]
fn a_checked_server_that_claude_code_no_longer_knows_stays_in_the_list_not_found() {
    let (_session, window) = window(Some(&Arc::new(claude())));
    call(
        &window,
        "allow_mcp_server",
        json!({ "name": "claude.ai Notion" }),
    )
    .unwrap();
    let list = call(&window, "list_mcp_servers", json!({})).unwrap();
    assert!(
        list["servers"].as_array().unwrap().contains(&line(
            "claude.ai Notion",
            "Notion",
            true,
            "notFound",
            true
        )),
        "{list}"
    );
}

#[test]
fn a_name_that_is_empty_is_refused_with_a_message() {
    let (_session, window) = window(Some(&Arc::new(claude())));
    for command in ["allow_mcp_server", "disallow_mcp_server"] {
        assert_eq!(
            call(&window, command, json!({ "name": "  " })),
            Err(json!({ "message": "«  » n'est pas un nom de serveur MCP" }))
        );
    }
}

#[test]
fn without_claude_code_or_without_its_connection_the_rubric_gets_a_sentence() {
    let missing = "Claude Code n'est pas installé sur ce Mac : voyez la colonne Claude Code, puis cliquez sur « Actualiser ».";
    let (_session, window) = window(None);
    assert_eq!(
        call(&window, "list_mcp_servers", json!({})).unwrap(),
        json!({ "kind": "unavailable", "message": missing })
    );
    let logged_out = Arc::new(claude().with_status(ClaudeStatus::LoggedOut));
    let (_session, window) = window_of(&logged_out);
    assert_eq!(
        call(&window, "list_mcp_servers", json!({})).unwrap(),
        json!({ "kind": "unavailable", "message":
            "Claude Code n'est pas connecté à votre abonnement Claude : connectez-le dans la colonne Claude Code, puis cliquez sur « Actualiser »." })
    );
    let silent = Arc::new(FakeClaudeCode::default().failing_to_list_servers(ClaudeError::Missing));
    let (_session, window) = window_of(&silent);
    assert_eq!(
        call(&window, "list_mcp_servers", json!({})).unwrap(),
        json!({ "kind": "unavailable", "message": missing })
    );
}

fn window_of(claude: &Arc<FakeClaudeCode>) -> (Arc<Session>, WebviewWindow<MockRuntime>) {
    window(Some(claude))
}

#[test]
fn the_servers_checked_reach_the_next_turn_and_only_those() {
    let fake = Arc::new(claude());
    let (session, window) = window(Some(&fake));
    call(
        &window,
        "allow_mcp_server",
        json!({ "name": "claude.ai Noota" }),
    )
    .unwrap();
    session
        .send_to_claude("Un", None, TurnSettings::default(), |_| {})
        .unwrap();
    call(
        &window,
        "allow_mcp_server",
        json!({ "name": "mon-serveur" }),
    )
    .unwrap();
    session
        .send_to_claude("Deux", None, TurnSettings::default(), |_| {})
        .unwrap();
    call(
        &window,
        "disallow_mcp_server",
        json!({ "name": "claude.ai Noota" }),
    )
    .unwrap();
    call(
        &window,
        "disallow_mcp_server",
        json!({ "name": "mon-serveur" }),
    )
    .unwrap();
    session
        .send_to_claude("Trois", None, TurnSettings::default(), |_| {})
        .unwrap();
    let names: Vec<Vec<String>> = fake
        .allowed_servers()
        .into_iter()
        .map(|turn| turn.iter().map(|name| name.as_str().to_owned()).collect())
        .collect();
    assert_eq!(
        names,
        [
            vec!["claude.ai Noota".to_owned()],
            vec!["claude.ai Noota".to_owned(), "mon-serveur".to_owned()],
            Vec::new(),
        ]
    );
}
