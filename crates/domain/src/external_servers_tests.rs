use super::*;

fn name(text: &str) -> ServerName {
    ServerName::new(text).unwrap()
}

fn server(text: &str, state: ServerState) -> ExternalServer {
    ExternalServer {
        name: name(text),
        state,
    }
}

fn names(listed: &[ListedServer]) -> Vec<&str> {
    listed
        .iter()
        .map(|line| line.server.name.as_str())
        .collect()
}

#[test]
fn a_name_is_trimmed_and_never_empty_or_on_several_lines() {
    assert_eq!(name("  claude.ai Noota ").as_str(), "claude.ai Noota");
    assert_eq!(ServerName::new(""), None);
    assert_eq!(ServerName::new("  \t "), None);
    assert_eq!(ServerName::new("a\nb"), None);
    assert_eq!(ServerName::new("a\u{7}b"), None);
}

#[test]
fn a_connector_is_named_by_the_claude_ai_prefix_and_shown_without_it() {
    let noota = name("claude.ai Noota");
    assert!(noota.is_connector());
    assert_eq!(noota.display(), "Noota");
    assert_eq!(name("claude.ai   Google Drive").display(), "Google Drive");
    for other in ["Noota", "claude.aiNoota", "my claude.ai Noota"] {
        assert!(!name(other).is_connector(), "{other}");
        assert_eq!(name(other).display(), other);
    }
}

#[test]
fn a_plugin_server_is_named_by_the_plugin_prefix() {
    assert!(name("plugin:rag:rag").is_plugin());
    assert!(!name("rag").is_plugin());
    assert!(!name("claude.ai Noota").is_plugin());
}

#[test]
fn the_tools_of_a_server_start_with_its_name_as_claude_code_writes_it() {
    for (server, prefix) in [
        ("claude.ai Noota", "mcp__claude_ai_Noota"),
        ("claude.ai Claude Docs", "mcp__claude_ai_Claude_Docs"),
        ("claude.ai monday.com", "mcp__claude_ai_monday_com"),
        (
            "claude.ai Mobility Work MCP",
            "mcp__claude_ai_Mobility_Work_MCP",
        ),
        ("claude.ai  Spaced  Out ", "mcp__claude_ai_Spaced_Out"),
        ("claude.ai Café!", "mcp__claude_ai_Caf"),
        ("mon-serveur", "mcp__mon-serveur"),
        ("mon serveur", "mcp__mon_serveur"),
        ("mon  serveur.v2", "mcp__mon__serveur_v2"),
        ("_x_", "mcp___x_"),
    ] {
        assert_eq!(name(server).tool_prefix(), prefix, "{server}");
    }
}

#[test]
fn the_list_is_sorted_by_shown_name_ignoring_case_and_hides_plugin_servers() {
    let listed = listed_servers(
        vec![
            server("claude.ai Slack", ServerState::Connected),
            server("plugin:rag:rag", ServerState::Failed),
            server("atlassian", ServerState::Connected),
            server("claude.ai Figma", ServerState::ToConnect),
            server("claude.ai Noota", ServerState::Connected),
        ],
        &[],
    );
    assert_eq!(
        names(&listed),
        [
            "atlassian",
            "claude.ai Figma",
            "claude.ai Noota",
            "claude.ai Slack"
        ]
    );
    assert!(listed.iter().all(|line| !line.allowed));
    assert_eq!(listed[1].server.state, ServerState::ToConnect);
}

#[test]
fn a_server_known_twice_is_listed_once() {
    let listed = listed_servers(
        vec![
            server("claude.ai Noota", ServerState::Connected),
            server("claude.ai Noota", ServerState::Failed),
        ],
        &[],
    );
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].server.state, ServerState::Connected);
}

#[test]
fn an_allowed_server_is_checked() {
    let listed = listed_servers(
        vec![
            server("claude.ai Noota", ServerState::Connected),
            server("claude.ai Notion", ServerState::Connected),
        ],
        &[name("claude.ai Noota")],
    );
    assert_eq!(
        listed.iter().map(|line| line.allowed).collect::<Vec<_>>(),
        [true, false]
    );
}

#[test]
fn an_allowed_server_that_claude_code_no_longer_knows_stays_checked_and_not_found() {
    let listed = listed_servers(
        vec![server("claude.ai Slack", ServerState::Connected)],
        &[name("claude.ai Noota"), name("claude.ai Slack")],
    );
    assert_eq!(names(&listed), ["claude.ai Noota", "claude.ai Slack"]);
    assert_eq!(listed[0].server.state, ServerState::NotFound);
    assert!(listed[0].allowed);
    assert_eq!(listed[1].server.state, ServerState::Connected);
}

#[test]
fn an_allowed_plugin_server_is_never_listed() {
    let listed = listed_servers(Vec::new(), &[name("plugin:rag:rag")]);
    assert!(listed.is_empty());
}

#[test]
fn only_the_connectors_that_are_not_allowed_are_hidden() {
    let known = [
        name("claude.ai Noota"),
        name("claude.ai Slack"),
        name("claude.ai Notion"),
        name("atlassian"),
    ];
    assert_eq!(
        hidden_connectors(&known, &[name("claude.ai Noota"), name("atlassian")]),
        [name("claude.ai Slack"), name("claude.ai Notion")]
    );
    assert!(hidden_connectors(&[], &[name("claude.ai Noota")]).is_empty());
}

#[test]
fn a_tool_of_a_connector_is_shown_with_the_server_name_and_the_tool_name() {
    assert_eq!(
        external_tool_label("mcp__claude_ai_Noota__search_records").as_deref(),
        Some("Noota · search_records")
    );
    assert_eq!(
        external_tool_label("mcp__claude_ai_Google_Drive__read_file_content").as_deref(),
        Some("Google Drive · read_file_content")
    );
    assert_eq!(
        external_tool_label("mcp__mon-serveur__lire__vite").as_deref(),
        Some("mon-serveur · lire__vite")
    );
}

#[test]
fn a_name_that_is_not_a_server_tool_has_no_label() {
    for other in [
        "Read",
        "mcp__",
        "mcp__serveur",
        "mcp____outil",
        "mcp__serveur__",
        "xmcp__serveur__outil",
    ] {
        assert_eq!(external_tool_label(other), None, "{other}");
    }
}
