use domain::external_servers::{ExternalServer, ServerState};

use super::*;
use crate::ClaudeAccount;
use crate::testing::{FakeClaudeCode, FakePreferences};

fn name(text: &str) -> ServerName {
    ServerName::new(text).unwrap()
}

fn server(text: &str, state: ServerState) -> ExternalServer {
    ExternalServer {
        name: name(text),
        state,
    }
}

fn claude() -> FakeClaudeCode {
    FakeClaudeCode::default().knowing_servers(vec![
        server("claude.ai Slack", ServerState::Connected),
        server("claude.ai Noota", ServerState::Connected),
        server("claude.ai Figma", ServerState::ToConnect),
        server("plugin:rag:rag", ServerState::Failed),
    ])
}

fn listed(listing: ServersListing) -> Vec<(String, ServerState, bool)> {
    let ServersListing::Listed(lines) = listing else {
        panic!("la liste devrait être lue : {listing:?}");
    };
    lines
        .into_iter()
        .map(|line| {
            (
                line.server.name.as_str().to_owned(),
                line.server.state,
                line.allowed,
            )
        })
        .collect()
}

#[test]
fn nothing_is_allowed_at_first() {
    let (claude, preferences) = (claude(), FakePreferences::default());
    let servers = McpServers::new(Some(&claude), &preferences);
    assert_eq!(servers.allowed().unwrap(), []);
    assert_eq!(
        listed(servers.list().unwrap()),
        [
            ("claude.ai Figma".to_owned(), ServerState::ToConnect, false),
            ("claude.ai Noota".to_owned(), ServerState::Connected, false),
            ("claude.ai Slack".to_owned(), ServerState::Connected, false),
        ]
    );
}

#[test]
fn an_allowed_server_is_checked_in_the_list_and_kept_in_the_preferences() {
    let (claude, preferences) = (claude(), FakePreferences::default());
    let servers = McpServers::new(Some(&claude), &preferences);
    servers.allow("claude.ai Noota").unwrap();
    assert_eq!(servers.allowed().unwrap(), [name("claude.ai Noota")]);
    assert_eq!(
        preferences.allowed_servers().unwrap(),
        [name("claude.ai Noota")]
    );
    let checked: Vec<bool> = listed(servers.list().unwrap())
        .into_iter()
        .map(|(_, _, allowed)| allowed)
        .collect();
    assert_eq!(checked, [false, true, false]);
}

#[test]
fn allowing_twice_keeps_one_and_the_order_of_the_choices() {
    let (claude, preferences) = (claude(), FakePreferences::default());
    let servers = McpServers::new(Some(&claude), &preferences);
    servers.allow("claude.ai Slack").unwrap();
    servers.allow("claude.ai Noota").unwrap();
    servers.allow("claude.ai Slack").unwrap();
    assert_eq!(
        servers.allowed().unwrap(),
        [name("claude.ai Slack"), name("claude.ai Noota")]
    );
}

#[test]
fn a_server_that_is_no_longer_allowed_is_unchecked_and_the_others_stay() {
    let (claude, preferences) = (claude(), FakePreferences::default());
    let servers = McpServers::new(Some(&claude), &preferences);
    servers.allow("claude.ai Slack").unwrap();
    servers.allow("claude.ai Noota").unwrap();
    servers.disallow("claude.ai Slack").unwrap();
    assert_eq!(servers.allowed().unwrap(), [name("claude.ai Noota")]);
    servers.disallow("claude.ai Slack").unwrap();
    servers.disallow("claude.ai Figma").unwrap();
    assert_eq!(servers.allowed().unwrap(), [name("claude.ai Noota")]);
}

#[test]
fn an_allowed_server_that_claude_code_no_longer_knows_stays_checked_and_not_found() {
    let preferences = FakePreferences::default();
    preferences
        .save_allowed_servers(&[name("claude.ai Notion")])
        .unwrap();
    let claude = claude();
    let servers = McpServers::new(Some(&claude), &preferences);
    let lines = listed(servers.list().unwrap());
    assert_eq!(
        lines[2],
        ("claude.ai Notion".to_owned(), ServerState::NotFound, true)
    );
    servers.disallow("claude.ai Notion").unwrap();
    assert_eq!(listed(servers.list().unwrap()).len(), 3);
}

#[test]
fn a_name_that_is_not_a_name_is_refused() {
    let (claude, preferences) = (claude(), FakePreferences::default());
    let servers = McpServers::new(Some(&claude), &preferences);
    for name in ["", "  ", "a\nb"] {
        assert!(matches!(
            servers.allow(name),
            Err(AppError::InvalidServerName(_))
        ));
        assert!(matches!(
            servers.disallow(name),
            Err(AppError::InvalidServerName(_))
        ));
    }
    assert_eq!(
        servers.allow("a\nb").unwrap_err().to_string(),
        "« a\nb » n'est pas un nom de serveur MCP"
    );
    assert_eq!(preferences.allowed_servers().unwrap(), []);
}

#[test]
fn without_claude_code_or_without_its_connection_the_list_says_what_to_do() {
    let preferences = FakePreferences::default();
    for (status, sentence) in [
        (
            ClaudeStatus::Missing,
            "Claude Code n'est pas installé sur ce Mac : voyez la colonne Claude Code, puis cliquez sur « Actualiser ».",
        ),
        (
            ClaudeStatus::LoggedOut,
            "Claude Code n'est pas connecté à votre abonnement Claude : connectez-le dans la colonne Claude Code, puis cliquez sur « Actualiser ».",
        ),
        (
            ClaudeStatus::Failed,
            "Claude Code ne répond pas comme prévu : voyez la colonne Claude Code, puis cliquez sur « Actualiser ».",
        ),
        (
            ClaudeStatus::Incompatible("--mcp-config".to_owned()),
            "Claude Code ne répond pas comme prévu : voyez la colonne Claude Code, puis cliquez sur « Actualiser ».",
        ),
    ] {
        let claude = claude().with_status(status);
        assert_eq!(
            McpServers::new(Some(&claude), &preferences).list().unwrap(),
            ServersListing::Unavailable(sentence.to_owned())
        );
    }
    let ready = claude().with_status(ClaudeStatus::Ready(ClaudeAccount::default()));
    assert!(matches!(
        McpServers::new(Some(&ready), &preferences).list().unwrap(),
        ServersListing::Listed(_)
    ));
}

#[test]
fn a_claude_code_that_gives_no_list_says_why() {
    let preferences = FakePreferences::default();
    let missing = FakeClaudeCode::default().failing_to_list_servers(ClaudeError::Missing);
    assert_eq!(
        McpServers::new(Some(&missing), &preferences)
            .list()
            .unwrap(),
        ServersListing::Unavailable(unavailable(&ClaudeStatus::Missing))
    );
    let failed = FakeClaudeCode::default()
        .failing_to_list_servers(ClaudeError::Failed("délai dépassé".into()));
    assert_eq!(
        McpServers::new(Some(&failed), &preferences).list().unwrap(),
        ServersListing::Unavailable(
            "Claude Code n'a pas donné la liste de ses serveurs MCP : Claude Code s'est arrêté sans répondre : délai dépassé. Cliquez sur « Actualiser ».".to_owned()
        )
    );
}

#[test]
fn without_any_claude_code_the_list_says_it_is_missing_and_choices_are_still_kept() {
    let preferences = FakePreferences::default();
    let servers = McpServers::new(None, &preferences);
    assert_eq!(
        servers.list().unwrap(),
        ServersListing::Unavailable(unavailable(&ClaudeStatus::Missing))
    );
    servers.allow("claude.ai Noota").unwrap();
    assert_eq!(servers.allowed().unwrap(), [name("claude.ai Noota")]);
}
