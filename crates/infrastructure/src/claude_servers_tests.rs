use super::*;

/// Ce que dit le vrai `claude mcp list` (2.1.311), les adresses raccourcies.
const LIST: &str = "Checking MCP server health…

claude.ai Claude Data: https://api.anthropic.com/api/dashboards/mcp - ✔ Connected
claude.ai Exa: https://mcp.exa.ai/mcp - ! Needs authentication
claude.ai Noota: https://mcp.noota.io/mcp - ✔ Connected
plugin:rag:rag: bash /Users/moi/rag/run-mcp-server.sh - ✘ Failed to connect — CONNECTION_CLOSED: Connection closed
essai-http: http://127.0.0.1:1/mcp (HTTP) - ✘ Failed to connect — ECONNREFUSED: Unable to connect. Is the computer able to access the url?
essai-stdio: /bin/echo a - b c - ✔ Connected
";

fn summary(servers: &[ExternalServer]) -> Vec<(&str, ServerState)> {
    servers
        .iter()
        .map(|server| (server.name.as_str(), server.state))
        .collect()
}

#[test]
fn the_list_gives_each_server_with_its_state_in_the_order_of_claude_code() {
    assert_eq!(
        summary(&parse_list(LIST)),
        [
            ("claude.ai Claude Data", ServerState::Connected),
            ("claude.ai Exa", ServerState::ToConnect),
            ("claude.ai Noota", ServerState::Connected),
            ("plugin:rag:rag", ServerState::Failed),
            ("essai-http", ServerState::Failed),
            ("essai-stdio", ServerState::Connected),
        ]
    );
}

#[test]
fn a_pending_server_is_a_failed_one_and_other_lines_are_ignored() {
    let list = "Checking MCP server health…\nserveur: http://x (HTTP) - ⏸ Pending approval\n\
                pas une ligne de serveur\nautre: cible - ◌ Inconnu\n: vide - ✔ Connected\n";
    assert_eq!(
        summary(&parse_list(list)),
        [("serveur", ServerState::Failed)]
    );
    assert!(parse_list("No MCP servers configured. Use `claude mcp add`.").is_empty());
    assert!(parse_list("").is_empty());
}

#[test]
fn a_reason_that_mentions_a_state_sign_does_not_change_the_state() {
    let list = "serveur: cible - ✘ Failed to connect — raison - ✔ Connected\n";
    assert_eq!(
        summary(&parse_list(list)),
        [("serveur", ServerState::Failed)]
    );
}

/// Ce que dit le vrai `claude mcp get` d'un serveur lancé sur le Mac (2.1.311).
const STDIO: &str = "essai-stdio:
  Scope: Local config (private to you in this project)
  Status: ✘ Failed to connect
  Issue: CONNECTION_CLOSED: Connection closed
  Type: stdio
  Command: /bin/echo
  Args: a b c
  Environment:
    KEY=dummy
    AUTRE=a=b

To remove this server, run: claude mcp remove essai-stdio -s local
";

/// Ce que dit le vrai `claude mcp get` d'un serveur web avec un en-tête.
const HTTP: &str = "essai-http:
  Scope: Local config (private to you in this project)
  Status: ✘ Failed to connect
  Issue: ECONNREFUSED: Unable to connect. Is the computer able to access the url?
  Type: http
  URL: http://127.0.0.1:1/mcp
  Headers:
    X-Essai: dummy

To remove this server, run: claude mcp remove essai-http -s local
";

const SSE: &str = "essai-sse:
  Scope: User config (available in all your projects)
  Status: ✔ Connected
  Type: sse
  URL: http://127.0.0.1:1/sse

To remove this server, run: claude mcp remove essai-sse -s user
";

#[test]
fn a_server_run_on_the_mac_is_described_by_its_command_arguments_and_environment() {
    assert_eq!(
        parse_description(STDIO).unwrap(),
        json!({
            "type": "stdio",
            "command": "/bin/echo",
            "args": ["a", "b", "c"],
            "env": { "KEY": "dummy", "AUTRE": "a=b" },
        })
    );
}

#[test]
fn a_web_server_is_described_by_its_address_and_headers() {
    assert_eq!(
        parse_description(HTTP).unwrap(),
        json!({
            "type": "http",
            "url": "http://127.0.0.1:1/mcp",
            "headers": { "X-Essai": "dummy" },
        })
    );
    assert_eq!(
        parse_description(SSE).unwrap(),
        json!({ "type": "sse", "url": "http://127.0.0.1:1/sse" })
    );
}

#[test]
fn a_command_without_arguments_has_an_empty_list() {
    let text = "s:\n  Type: stdio\n  Command: /bin/serveur\n";
    assert_eq!(
        parse_description(text).unwrap(),
        json!({ "type": "stdio", "command": "/bin/serveur", "args": [] })
    );
}

#[test]
fn what_is_not_a_known_description_gives_nothing() {
    for text in [
        "",
        "No MCP server found with name: x",
        "s:\n  Type: ws\n  URL: ws://x\n",
        "s:\n  Type: stdio\n  Args: a\n",
        "s:\n  Type: http\n  Headers:\n    A: b\n",
        "s:\n  Scope: User config\n",
    ] {
        assert_eq!(parse_description(text), None, "{text}");
    }
}
