//! Les serveurs MCP extérieurs de Claude Code (fiche 0105), avec un faux Claude Code : un script
//! qui répond à `claude mcp list` et `claude mcp get` par des textes enregistrés avec le vrai
//! `claude` (2.1.311), et qui note ses arguments, son dossier et son environnement. Le vrai `claude`
//! n'est jamais lancé.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::os::unix::fs::PermissionsExt;

use application::testing::claude_contract::{ClaudeServers, claude_servers_contract};
use application::{ClaudeCode, ClaudeError, ClaudeTurn, WorkspaceLocation};
use domain::claude::{ChangesAfterWeb, TurnSettings};
use domain::external_servers::{ExternalServer, ServerName, ServerState};
use infrastructure::ClaudeCodeCli;
use tempfile::TempDir;

/// Ce que dit le vrai `claude mcp list`, les adresses raccourcies.
const LIST: &str = "Checking MCP server health…

claude.ai Claude Docs: https://api.anthropic.com/v1/pages/mcp - ✔ Connected
claude.ai Figma: https://mcp.figma.com/mcp - ! Needs authentication
claude.ai Noota: https://mcp.noota.io/mcp - ✔ Connected
claude.ai Slack: https://mcp.slack.com/mcp - ✔ Connected
plugin:rag:rag: bash /Users/moi/rag/run-mcp-server.sh - ✘ Failed to connect — CONNECTION_CLOSED: Connection closed
mon-serveur: http://127.0.0.1:1/mcp (HTTP) - ✘ Failed to connect — ECONNREFUSED: Unable to connect.
";

/// Ce que dit le vrai `claude mcp get` de `mon-serveur`.
const GET: &str = "mon-serveur:
  Scope: User config (available in all your projects)
  Status: ✘ Failed to connect
  Type: http
  URL: http://127.0.0.1:1/mcp
  Headers:
    X-Essai: dummy

To remove this server, run: claude mcp remove mon-serveur -s user
";

const SUMMARY: &str = r#"{"type":"result","is_error":false,"duration_ms":5}"#;

/// Ce que dit `claude --help` : chaque option dont l'application a besoin.
const HELP: &str = "--output-format --verbose --resume --model --effort --tools \
    --allowed-tools --disallowed-tools --append-system-prompt --permission-mode \
    --strict-mcp-config --mcp-config --disable-slash-commands --setting-sources --settings";

fn name(text: &str) -> ServerName {
    ServerName::new(text).unwrap()
}

/// Un faux Claude Code dans un dossier jetable, avec l'espace de travail `Notes` à côté.
struct FakeClaude {
    folder: TempDir,
    claude: ClaudeCodeCli,
}

impl FakeClaude {
    /// Un faux qui répond à `mcp list` par `list` (en sortant avec `list_exit`) et à
    /// `mcp get mon-serveur` par `GET`.
    fn new(list: &str, list_exit: u8) -> Self {
        let folder = TempDir::new().unwrap();
        let dir = folder.path().display();
        fs::create_dir(folder.path().join("Notes")).unwrap();
        fs::write(folder.path().join("help"), HELP).unwrap();
        fs::write(folder.path().join("mcp_list"), list).unwrap();
        fs::write(folder.path().join("mcp_get_mon-serveur"), GET).unwrap();
        let script = folder.path().join("claude");
        fs::write(
            &script,
            format!(
                "#!/bin/sh\n[ \"$1\" = --help ] && exec cat '{dir}/help'\n\
                 [ \"$1\" = auth ] && exec echo '{{\"loggedIn\":true}}'\n\
                 if [ \"$1\" = mcp ]; then\n\
                 echo \"$*\" >> '{dir}/mcp_calls'\n\
                 pwd -P >> '{dir}/mcp_cwd'\nenv > '{dir}/mcp_env'\n\
                 if [ \"$2\" = list ]; then cat '{dir}/mcp_list'; exit {list_exit}; fi\n\
                 [ -f \"{dir}/mcp_get_$3\" ] && exec cat \"{dir}/mcp_get_$3\"\nexit 1\nfi\n\
                 printf '%s\\n' \"$@\" > '{dir}/args'\ncat > '{dir}/input'\n\
                 echo '{SUMMARY}'\n"
            ),
        )
        .unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        Self {
            claude: ClaudeCodeCli::new(script),
            folder,
        }
    }

    fn workspace(&self) -> WorkspaceLocation {
        WorkspaceLocation::new(self.folder.path().join("Notes").display().to_string()).unwrap()
    }

    /// Joue un tour où `servers` sont permis, avec les modifications après le web retenues ou non.
    fn turn(&self, servers: &[ServerName], changes: ChangesAfterWeb) {
        self.claude
            .send(
                ClaudeTurn {
                    workspace: &self.workspace(),
                    conversation: None,
                    settings: TurnSettings {
                        changes_after_web: changes,
                        ..TurnSettings::default()
                    },
                    tools: None,
                    servers,
                },
                "Bonjour",
                &mut |_| {},
            )
            .unwrap();
    }

    fn received(&self, file: &str) -> String {
        fs::read_to_string(self.folder.path().join(file)).unwrap_or_default()
    }

    /// Les arguments du tour, un par ligne.
    fn arguments(&self) -> Vec<String> {
        self.received("args").lines().map(str::to_owned).collect()
    }

    /// La valeur de l'option `option` du tour.
    fn option(&self, option: &str) -> Option<String> {
        let arguments = self.arguments();
        let at = arguments.iter().position(|argument| argument == option)?;
        arguments.get(at + 1).cloned()
    }

    /// Les sous-commandes de `claude mcp` lancées, une par appel.
    fn mcp_calls(&self) -> Vec<String> {
        self.received("mcp_calls")
            .lines()
            .map(|call| call.strip_prefix("mcp ").unwrap().to_owned())
            .collect()
    }
}

fn known() -> Vec<ExternalServer> {
    [
        ("claude.ai Claude Docs", ServerState::Connected),
        ("claude.ai Figma", ServerState::ToConnect),
        ("claude.ai Noota", ServerState::Connected),
        ("claude.ai Slack", ServerState::Connected),
        ("plugin:rag:rag", ServerState::Failed),
        ("mon-serveur", ServerState::Failed),
    ]
    .map(|(text, state)| ExternalServer {
        name: name(text),
        state,
    })
    .to_vec()
}

#[test]
fn the_list_comes_from_claude_mcp_list_with_each_state() {
    let fake = FakeClaude::new(LIST, 0);
    assert_eq!(fake.claude.external_servers(), Ok(known()));
    assert_eq!(fake.mcp_calls(), ["list"]);
}

#[test]
fn the_program_honours_the_claude_servers_contract() {
    let fake = FakeClaude::new(LIST, 0);
    claude_servers_contract(&ClaudeServers {
        knowing: &fake.claude,
        known: known(),
    });
}

#[test]
fn the_list_is_asked_from_the_home_folder_never_from_the_workspace_with_the_kept_variables_only() {
    let fake = FakeClaude::new(LIST, 0);
    fake.claude.external_servers().unwrap();
    let home = fs::canonicalize(std::env::var_os("HOME").unwrap()).unwrap();
    assert_eq!(fake.received("mcp_cwd"), format!("{}\n", home.display()));
    let env = fake.received("mcp_env");
    let names: Vec<&str> = env
        .lines()
        .filter_map(|line| line.split_once('=').map(|(name, _)| name))
        .filter(|name| !["PWD", "SHLVL", "_", "OLDPWD"].contains(name))
        .collect();
    assert!(names.contains(&"HOME"));
    assert!(
        names.iter().all(|name| [
            "HOME",
            "USER",
            "LOGNAME",
            "PATH",
            "SHELL",
            "TMPDIR",
            "LANG",
            "LC_ALL",
            "LC_CTYPE",
            "LC_MESSAGES",
            "CLAUDE_CONFIG_DIR",
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "NO_PROXY",
            "http_proxy",
            "https_proxy",
            "no_proxy",
            "NODE_EXTRA_CA_CERTS",
        ]
        .contains(name)),
        "{names:?}"
    );
}

#[test]
fn a_list_that_fails_without_a_server_is_an_error_and_an_empty_one_is_a_list() {
    let failing = FakeClaude::new("Something went wrong\n", 1);
    assert_eq!(
        failing.claude.external_servers(),
        Err(ClaudeError::Failed(
            "« claude mcp list » n'a pas répondu".to_owned()
        ))
    );
    let empty = FakeClaude::new("No MCP servers configured. Use `claude mcp add`.\n", 0);
    assert_eq!(empty.claude.external_servers(), Ok(Vec::new()));
}

#[test]
fn a_missing_program_gives_no_list() {
    let claude = ClaudeCodeCli::new("/nulle/part/claude");
    assert_eq!(claude.external_servers(), Err(ClaudeError::Missing));
}

#[test]
fn without_a_permitted_server_nothing_is_read_and_only_the_app_server_is_let_through() {
    let fake = FakeClaude::new(LIST, 0);
    fake.turn(&[], ChangesAfterWeb::Allowed);
    assert!(fake.mcp_calls().is_empty());
    assert!(fake.arguments().contains(&"--strict-mcp-config".to_owned()));
    assert_eq!(fake.option("--disallowed-tools"), None);
    assert_eq!(
        fake.option("--allowed-tools").as_deref(),
        Some("WebSearch,WebFetch")
    );
}

#[test]
fn a_permitted_connector_arrives_by_itself_and_the_other_connectors_are_hidden() {
    let fake = FakeClaude::new(LIST, 0);
    fake.turn(&[name("claude.ai Noota")], ChangesAfterWeb::Allowed);
    // La liste n'avait jamais été lue : elle l'est, une fois, pour savoir quoi cacher.
    assert_eq!(fake.mcp_calls(), ["list"]);
    let arguments = fake.arguments();
    assert!(!arguments.contains(&"--strict-mcp-config".to_owned()));
    assert_eq!(
        fake.option("--allowed-tools").as_deref(),
        Some("WebSearch,WebFetch,mcp__claude_ai_Noota")
    );
    assert_eq!(
        fake.option("--disallowed-tools").as_deref(),
        Some("mcp__claude_ai_Claude_Docs,mcp__claude_ai_Figma,mcp__claude_ai_Slack")
    );
    assert!(fake.option("--tools").unwrap().ends_with(",ToolSearch"));
    let instructions = fake.option("--append-system-prompt").unwrap();
    assert!(instructions.contains("ToolSearch") && instructions.contains(": Noota."));
    assert_eq!(fake.option("--mcp-config"), None);
}

#[test]
fn the_list_read_for_the_settings_is_reused_by_the_turns() {
    let fake = FakeClaude::new(LIST, 0);
    fake.claude.external_servers().unwrap();
    fake.turn(&[name("claude.ai Noota")], ChangesAfterWeb::Allowed);
    fake.turn(&[name("claude.ai Slack")], ChangesAfterWeb::Allowed);
    assert_eq!(fake.mcp_calls(), ["list"]);
    assert_eq!(
        fake.option("--disallowed-tools").as_deref(),
        Some("mcp__claude_ai_Claude_Docs,mcp__claude_ai_Figma,mcp__claude_ai_Noota")
    );
}

#[test]
fn every_connector_permitted_leaves_nothing_to_hide() {
    let fake = FakeClaude::new(LIST, 0);
    let all = [
        "claude.ai Claude Docs",
        "claude.ai Figma",
        "claude.ai Noota",
        "claude.ai Slack",
    ]
    .map(name);
    fake.turn(&all, ChangesAfterWeb::Allowed);
    assert_eq!(fake.option("--disallowed-tools"), None);
    assert_eq!(
        fake.option("--allowed-tools").as_deref(),
        Some(
            "WebSearch,WebFetch,mcp__claude_ai_Claude_Docs,mcp__claude_ai_Figma,\
             mcp__claude_ai_Noota,mcp__claude_ai_Slack"
        )
    );
}

#[test]
fn a_permitted_server_added_by_the_user_is_described_then_passed_by_the_application() {
    let fake = FakeClaude::new(LIST, 0);
    fake.turn(&[name("mon-serveur")], ChangesAfterWeb::Allowed);
    assert_eq!(fake.mcp_calls(), ["get mon-serveur"]);
    let arguments = fake.arguments();
    assert!(arguments.contains(&"--strict-mcp-config".to_owned()));
    let config: serde_json::Value =
        serde_json::from_str(&fake.option("--mcp-config").unwrap()).unwrap();
    assert_eq!(
        config,
        serde_json::json!({ "mcpServers": { "mon-serveur": {
            "type": "http",
            "url": "http://127.0.0.1:1/mcp",
            "headers": { "X-Essai": "dummy" },
        }}})
    );
    assert_eq!(
        fake.option("--allowed-tools").as_deref(),
        Some("WebSearch,WebFetch,mcp__mon-serveur")
    );
    assert_eq!(fake.option("--disallowed-tools"), None);
}

#[test]
fn a_permitted_server_that_claude_code_no_longer_describes_is_not_opened() {
    let fake = FakeClaude::new(LIST, 0);
    fake.turn(&[name("fantome")], ChangesAfterWeb::Allowed);
    assert_eq!(fake.mcp_calls(), ["get fantome"]);
    assert_eq!(fake.option("--mcp-config"), None);
    assert_eq!(
        fake.option("--allowed-tools").as_deref(),
        Some("WebSearch,WebFetch")
    );
    assert_eq!(fake.option("--append-system-prompt"), None);
    assert!(!fake.option("--tools").unwrap().contains("ToolSearch"));
}

#[test]
fn a_connector_and_an_added_server_are_opened_together() {
    let fake = FakeClaude::new(LIST, 0);
    fake.turn(
        &[name("mon-serveur"), name("claude.ai Noota")],
        ChangesAfterWeb::Allowed,
    );
    assert!(!fake.arguments().contains(&"--strict-mcp-config".to_owned()));
    assert_eq!(
        fake.option("--allowed-tools").as_deref(),
        Some("WebSearch,WebFetch,mcp__claude_ai_Noota,mcp__mon-serveur")
    );
    assert!(fake.option("--mcp-config").unwrap().contains("mon-serveur"));
}

#[test]
fn the_tools_of_a_permitted_server_count_as_a_web_read_for_the_web_guard() {
    let fake = FakeClaude::new(LIST, 0);
    fake.turn(
        &[name("claude.ai Noota"), name("mon-serveur")],
        ChangesAfterWeb::HeldBack,
    );
    let hooks: serde_json::Value =
        serde_json::from_str(&fake.option("--settings").unwrap()).unwrap();
    assert_eq!(
        hooks["hooks"]["PreToolUse"][0]["matcher"],
        "WebSearch|WebFetch|mcp__claude_ai_Noota__.*|mcp__mon-serveur__.*"
    );
}
