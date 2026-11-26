//! Claude Code piloté en arrière-plan, avec un faux Claude Code : un script connecté qui note ses
//! arguments, son dossier, son entrée et son environnement, puis rejoue un flux enregistré.
//! Le vrai `claude` n'est jamais lancé.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::process::Command;
use std::time::Duration;

use application::testing::claude_contract::{ClaudeCodes, claude_code_contract};
use application::{ClaudeCode, ClaudeError, ClaudeTurn, WorkspaceLocation};
use domain::app_tools::AppToolsKey;
use domain::claude::{
    ChangesAfterWeb, ClaudeEvent, ClaudeModel, ContextFill, ConversationId, Effort, TurnOutcome,
    TurnSettings, TurnSummary,
};
use infrastructure::{AppToolsRelay, ClaudeCodeCli};
use tempfile::TempDir;

/// Un flux enregistré avec le vrai `claude` : une conversation continuée.
const RESUMED: &str = include_str!("claude_streams/resumed.jsonl");
/// Un flux enregistré avec le vrai `claude` : une conversation inconnue, en erreur.
const UNKNOWN_CONVERSATION: &str = include_str!("claude_streams/unknown_conversation.jsonl");
const INIT: &str = r#"{"type":"system","subtype":"init","session_id":"conversation-1"}"#;
const SUMMARY: &str = r#"{"type":"result","is_error":false,"duration_ms":5}"#;

/// Un faux Claude Code dans un dossier jetable, avec l'espace de travail `Notes` à côté.
struct FakeClaude {
    folder: TempDir,
    claude: ClaudeCodeCli,
}

impl FakeClaude {
    /// Rejoue `stream`, puis joue la commande `ending`.
    fn new(stream: &str, ending: &str) -> Self {
        let folder = TempDir::new().unwrap();
        let dir = folder.path().display();
        fs::create_dir(folder.path().join("Notes")).unwrap();
        // Chaque ligne se termine, comme celles de Claude Code : la dernière est lue sans
        // attendre la fin du programme.
        fs::write(folder.path().join("stream.jsonl"), format!("{stream}\n")).unwrap();
        fs::write(folder.path().join("help"), FULL_HELP).unwrap();
        let script = folder.path().join("claude");
        fs::write(
            &script,
            format!(
                "#!/bin/sh\n[ \"$1\" = --help ] && exec cat '{dir}/help'\n\
                 [ \"$1\" = auth ] && env > '{dir}/auth_env' && \
                 exec echo '{{\"loggedIn\":true}}'\n\
                 printf '%s\\n' \"$@\" > '{dir}/args'\npwd -P > '{dir}/cwd'\n\
                 env > '{dir}/env'\n\
                 previous=; for argument in \"$@\"; do [ \"$previous\" = --settings ] && \
                 printf '%s' \"$argument\" | sed -n \"s/.*touch '\\([^']*\\)\\/web-read'.*/\\1/p\" \
                 > '{dir}/guard' && [ -d \"$(cat '{dir}/guard')\" ] && touch '{dir}/guard_alive'; \
                 previous=$argument; done\n\
                 cat > '{dir}/input'\ncat '{dir}/stream.jsonl'\n{ending}\n"
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

    /// Le tour joué avec `message`, en continuant `conversation`.
    fn turn(
        &self,
        conversation: Option<&ConversationId>,
        message: &str,
    ) -> (Result<(), ClaudeError>, Vec<ClaudeEvent>) {
        self.turn_with(conversation, TurnSettings::default(), message)
    }

    /// Le tour joué avec `message` et `settings`, en continuant `conversation`.
    fn turn_with(
        &self,
        conversation: Option<&ConversationId>,
        settings: TurnSettings,
        message: &str,
    ) -> (Result<(), ClaudeError>, Vec<ClaudeEvent>) {
        self.turn_offering(conversation, settings, None, message)
    }

    /// Le tour joué avec `message`, `settings` et la clé des outils de l'application `tools`.
    fn turn_offering(
        &self,
        conversation: Option<&ConversationId>,
        settings: TurnSettings,
        tools: Option<&AppToolsKey>,
        message: &str,
    ) -> (Result<(), ClaudeError>, Vec<ClaudeEvent>) {
        let mut events = Vec::new();
        let end = self.claude.send(
            ClaudeTurn {
                workspace: &self.workspace(),
                conversation,
                settings,
                tools,
            },
            message,
            &mut |event| {
                events.push(event);
            },
        );
        (end, events)
    }

    /// Ce que le faux Claude Code a noté sous `name`.
    fn received(&self, name: &str) -> String {
        fs::read_to_string(self.folder.path().join(name)).unwrap()
    }
}

fn summary(outcome: TurnOutcome, milliseconds: u64, tokens: u64) -> ClaudeEvent {
    ClaudeEvent::Summary(TurnSummary {
        outcome,
        duration: Duration::from_millis(milliseconds),
        tokens,
    })
}

#[test]
fn the_claude_code_program_honours_the_claude_code_contract() {
    let replaying = FakeClaude::new(RESUMED, "");
    let hanging = FakeClaude::new(INIT, "exec sleep 30");
    claude_code_contract(&ClaudeCodes {
        workspace: replaying.workspace(),
        replaying: &replaying.claude,
        replayed: vec![
            ClaudeEvent::ConversationStarted(
                ConversationId::new("aae7955b-a3d2-411a-8134-172857db16ad").unwrap(),
            ),
            ClaudeEvent::ModelUsed("claude-haiku-5-5".to_owned()),
            ClaudeEvent::Message {
                agent: None,
                text: "Lait.".to_owned(),
            },
            ClaudeEvent::ContextFilled(ContextFill {
                used: 10150,
                size: 1_000_000,
            }),
            summary(TurnOutcome::Succeeded, 901, 10150),
        ],
        hanging: &hanging.claude,
    });
}

/// Ce que dit `claude --help` : chaque option dont l'application a besoin.
const FULL_HELP: &str = "--output-format --verbose --resume --model --effort --tools \\
    --allowed-tools --permission-mode --strict-mcp-config --mcp-config --disable-slash-commands \\
    --setting-sources --settings";

/// Les arguments attendus après le flux JSON, la conversation éventuelle, le modèle et le niveau
/// d'effort.
const PERMISSIONS: &str = "--tools\nRead,Write,Edit,Glob,Grep,Agent,WebSearch,WebFetch\n\
    --allowed-tools\nWebSearch,WebFetch\n\
    --permission-mode\nacceptEdits\n--strict-mcp-config\n--disable-slash-commands\n--setting-sources\n\n";

impl FakeClaude {
    /// Les arguments reçus, sans les crochets du garde-fou du web passés en dernier par
    /// `--settings` ; les crochets à part, lus.
    fn arguments_and_guard(&self) -> (String, serde_json::Value) {
        let received = self.received("args");
        let (arguments, hooks) = received.split_once("--settings\n").unwrap();
        let hooks = hooks.strip_suffix('\n').unwrap();
        assert!(!hooks.contains('\n'));
        (arguments.to_owned(), serde_json::from_str(hooks).unwrap())
    }
}

/// Les outils de l'application qui changent une note : le garde-fou du web les retient aussi.
const CHANGING_APP_TOOLS: &str = "mcp__malorean__create_note|mcp__malorean__create_folder|mcp__malorean__rename_folder|mcp__malorean__move_folder|mcp__malorean__trash_folder|mcp__malorean__create_note_from_template|mcp__malorean__trash_n\
    ote|mcp__malorean__rename_note|mcp__malorean__move_note|mcp__malorean__restore_version|mcp__malorean__replace_in_note|mcp__malorean__add_canvas_card|mcp__malorean__change_canvas_card|mcp__malorean__move_canvas_card|mcp__malorean__resize_canvas_card|mcp__malorean__remove_canvas_card|mcp__malorean__add_canvas_arrow|mcp__malorean__change_canvas_arrow|mcp__malorean__remove_canvas_arrow|mcp__malorean__add_canvas_group|mcp__malorean__change_canvas_group|mcp\
    __malorean__add_tags|mcp__malorean__remove_tags|mcp__malorean__pin_note|mcp__malorean__unp\
    in_note|mcp__malorean__add_attachment|mcp__malorean__add_entry|mcp__malorean__create_mind_map|mcp__malorean__create_crm";

/// Les outils que visent les crochets du garde-fou du web, dans l'ordre.
fn guarded_tools(hooks: &serde_json::Value) -> Vec<&str> {
    hooks["hooks"]["PreToolUse"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|hook| hook["matcher"].as_str())
        .collect()
}

#[test]
fn a_new_conversation_is_launched_with_the_stream_permission_and_web_guard_options() {
    let fake = FakeClaude::new(SUMMARY, "");
    fake.turn(None, "Bonjour").0.unwrap();
    let (arguments, hooks) = fake.arguments_and_guard();
    assert_eq!(
        arguments,
        format!("-p\n--output-format\nstream-json\n--verbose\n{PERMISSIONS}")
    );
    assert_eq!(
        guarded_tools(&hooks),
        [
            "WebSearch|WebFetch",
            &format!("Write|Edit|{CHANGING_APP_TOOLS}")
        ]
    );
}

/// Le relais des outils de l'application des tests : ni le programme ni la prise ne servent.
fn relay() -> AppToolsRelay {
    AppToolsRelay {
        program: "/Applications/MALOREAN Notes.app/Contents/MacOS/malorean-notes".into(),
        socket: "/tmp/malorean-outils-x/outils.sock".into(),
    }
}

#[test]
fn a_turn_with_a_key_offers_the_app_tools_by_the_relay_and_allows_each_of_them() {
    let mut fake = FakeClaude::new(SUMMARY, "");
    fake.claude = fake.claude.with_app_tools(relay());
    let key = AppToolsKey::new("clé-1").unwrap();
    fake.turn_offering(None, TurnSettings::default(), Some(&key), "Bonjour")
        .0
        .unwrap();
    let arguments = fake.arguments_and_guard().0;
    let (before, mcp) = arguments.split_once("--mcp-config\n").unwrap();
    let (mcp, after) = mcp.split_once('\n').unwrap();
    let allowed = "WebSearch,WebFetch,mcp__malorean__list_workspaces,mcp__malorean__search_notes,mcp__malorean__search_by_meaning,mcp__malorean__list_tags,mcp__malorean__list_folders,\
        mcp__malorean__linking_notes,mcp__malorean__read_note,mcp__malorean__read_canvas,mcp__malorean__list_templates,mcp__malorean__list_versions,\
        mcp__malorean__read_version,mcp__malorean__create_note,\
        mcp__malorean__create_folder,mcp__malorean__rename_folder,mcp__malorean__move_folder,mcp__malorean__trash_folder,mcp__malorean__create_note_from_template,mcp__malorean__trash_note,\
        mcp__malorean__rename_note,mcp__malorean__move_note,mcp__malorean__restore_version,mcp__malorean__replace_in_note,\
        mcp__malorean__add_canvas_card,mcp__malorean__change_canvas_card,mcp__malorean__move_canvas_card,mcp__malorean__resize_canvas_card,mcp__malorean__remove_canvas_card,mcp__malorean__add_canvas_arrow,mcp__malorean__change_canvas_arrow,mcp__malorean__remove_canvas_arrow,mcp__malorean__add_canvas_group,mcp__malorean__change_canvas_group,\
        mcp__malorean__add_tags,mcp__malorean__remove_tags,mcp__malorean__pin_note,\
        mcp__malorean__unpin_note,mcp__malorean__add_attachment,mcp__malorean__add_entry,\
        mcp__malorean__create_mind_map,mcp__malorean__create_crm,mcp__malorean__viewed_note,mcp__malorean__show_note";
    let (start, end) = PERMISSIONS.split_once("--disable").unwrap();
    assert_eq!(
        format!("{before}{after}"),
        format!(
            "-p\n--output-format\nstream-json\n--verbose\n{}--disable{end}",
            start.replace(
                "--allowed-tools\nWebSearch,WebFetch",
                &format!("--allowed-tools\n{allowed}")
            )
        )
    );
    let mcp: serde_json::Value = serde_json::from_str(mcp).unwrap();
    assert_eq!(
        mcp,
        serde_json::json!({ "mcpServers": { "malorean": {
            "command": "/Applications/MALOREAN Notes.app/Contents/MacOS/malorean-notes",
            "args": ["--relais-mcp", "/tmp/malorean-outils-x/outils.sock", "clé-1"],
        }}})
    );
}

#[test]
fn without_a_key_or_without_a_relay_no_app_tool_is_offered() {
    let mut fake = FakeClaude::new(SUMMARY, "");
    let key = AppToolsKey::new("clé-1").unwrap();
    let settings = TurnSettings::default();
    fake.turn_offering(None, settings, Some(&key), "Bonjour")
        .0
        .unwrap();
    let expected = format!("-p\n--output-format\nstream-json\n--verbose\n{PERMISSIONS}");
    assert_eq!(fake.arguments_and_guard().0, expected);
    fake.claude = fake.claude.with_app_tools(relay());
    fake.turn_offering(None, settings, None, "Bonjour")
        .0
        .unwrap();
    assert_eq!(fake.arguments_and_guard().0, expected);
}

#[test]
fn a_conversation_is_continued_by_its_id() {
    let fake = FakeClaude::new(SUMMARY, "");
    let conversation = ConversationId::new("aae7955b").unwrap();
    fake.turn(Some(&conversation), "Bonjour").0.unwrap();
    assert_eq!(
        fake.arguments_and_guard().0,
        format!("-p\n--output-format\nstream-json\n--verbose\n--resume\naae7955b\n{PERMISSIONS}")
    );
}

#[test]
fn the_web_guard_of_a_turn_lives_until_the_end_of_the_turn_only() {
    let fake = FakeClaude::new(SUMMARY, "");
    fake.turn(None, "Bonjour").0.unwrap();
    assert!(fake.folder.path().join("guard_alive").exists());
    let folder = fake.received("guard");
    assert!(folder.contains("malorean-web-guard-"), "{folder}");
    assert!(!std::path::Path::new(folder.trim_end()).exists());
}

#[test]
fn changes_allowed_by_the_user_launch_the_turn_without_the_web_guard() {
    let fake = FakeClaude::new(SUMMARY, "");
    let settings = TurnSettings {
        changes_after_web: ChangesAfterWeb::Allowed,
        ..TurnSettings::default()
    };
    fake.turn_with(None, settings, "Bonjour").0.unwrap();
    assert_eq!(
        fake.received("args"),
        format!("-p\n--output-format\nstream-json\n--verbose\n{PERMISSIONS}")
    );
    assert!(!fake.folder.path().join("guard_alive").exists());
}

#[test]
fn the_chosen_model_and_effort_are_passed_even_to_continue_a_conversation() {
    let fake = FakeClaude::new(SUMMARY, "");
    let conversation = ConversationId::new("aae7955b").unwrap();
    let settings = TurnSettings {
        model: Some(ClaudeModel::Sonnet),
        effort: Some(Effort::ExtraHigh),
        ..TurnSettings::default()
    };
    fake.turn_with(Some(&conversation), settings, "Bonjour")
        .0
        .unwrap();
    assert_eq!(
        fake.arguments_and_guard().0,
        format!(
            "-p\n--output-format\nstream-json\n--verbose\n--resume\naae7955b\n\
             --model\nsonnet\n--effort\nxhigh\n{PERMISSIONS}"
        )
    );
}

#[test]
fn claude_code_runs_in_the_workspace_folder() {
    let fake = FakeClaude::new(SUMMARY, "");
    fake.turn(None, "Bonjour").0.unwrap();
    let workspace = fake.folder.path().join("Notes").canonicalize().unwrap();
    assert_eq!(fake.received("cwd"), format!("{}\n", workspace.display()));
}

#[test]
fn the_message_is_written_on_its_input_never_given_as_an_option() {
    let fake = FakeClaude::new(SUMMARY, "");
    fake.turn(None, "--help\nAjoute « lait »").0.unwrap();
    assert_eq!(fake.received("input"), "--help\nAjoute « lait »");
    assert!(!fake.received("args").contains("--help"));
}

/// Les seules variables d'environnement que Claude Code reçoit de l'application : de quoi
/// trouver son dossier personnel, sa connexion, ses programmes, la langue, les fichiers
/// temporaires et le proxy du réseau. Aucune autre ne peut élargir ses droits ni changer qui paie.
const KEPT: [&str; 18] = [
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
];

/// Les variables que le shell du faux Claude Code pose lui-même.
const SHELL_OWN: [&str; 3] = ["PWD", "SHLVL", "_"];

/// Les noms des variables notées dans `env`, sans celles du shell, triés.
fn names(env: &str) -> Vec<String> {
    let mut names: Vec<String> = env
        .lines()
        .filter_map(|line| line.split_once('='))
        .map(|(name, _)| name.to_owned())
        .filter(|name| !SHELL_OWN.contains(&name.as_str()))
        .collect();
    names.sort();
    names
}

/// Les variables gardées que le test lui-même a reçues, triées.
fn kept_here() -> Vec<String> {
    let mut kept: Vec<String> = KEPT
        .iter()
        .filter(|name| std::env::var_os(name).is_some())
        .map(|name| (*name).to_owned())
        .collect();
    kept.sort();
    kept
}

/// Joué seul par le test qui suit, avec des variables qui élargiraient les droits ou changeraient
/// qui paie ; sans elles, il passe aussi.
#[test]
fn claude_code_receives_only_the_kept_variables() {
    let fake = FakeClaude::new(SUMMARY, "");
    fake.turn(None, "Bonjour").0.unwrap();
    assert_eq!(names(&fake.received("env")), kept_here());
    assert!(matches!(
        fake.claude.status(),
        application::ClaudeStatus::Ready(_)
    ));
    assert_eq!(names(&fake.received("auth_env")), kept_here());
    assert!(kept_here().contains(&"HOME".to_owned()));
}

#[test]
fn variables_of_the_application_other_than_the_kept_ones_never_reach_claude_code() {
    let status = Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "claude_code_receives_only_the_kept_variables",
            "--quiet",
        ])
        .env("ANTHROPIC_API_KEY", "clé-de-test")
        .env("ANTHROPIC_BASE_URL", "https://ailleurs.example")
        .env("CLAUDECODE", "1")
        .env("CLAUDE_CODE_SIMPLE", "1")
        .env("CLAUDE_CODE_USE_BEDROCK", "1")
        .env("LANG", "fr_FR.UTF-8")
        .env("HTTPS_PROXY", "http://proxy.example:3128")
        .output()
        .unwrap();
    let report = String::from_utf8_lossy(&status.stdout);
    assert!(status.status.success(), "{report}");
    assert!(report.contains("1 passed"), "{report}");
}

#[test]
fn a_summarized_turn_ends_well_even_when_claude_code_exits_in_error() {
    let fake = FakeClaude::new(UNKNOWN_CONVERSATION, "exit 1");
    let (end, events) = fake.turn(None, "Bonjour");
    assert_eq!(end, Ok(()));
    assert_eq!(
        events,
        vec![summary(
            TurnOutcome::Failed(
                "No conversation found with session ID: 00000000-0000-0000-0000-000000000000"
                    .to_owned()
            ),
            0,
            0
        )]
    );
}

#[test]
fn a_turn_with_several_summaries_ends_well_even_when_claude_code_exits_in_error() {
    let fake = FakeClaude::new(&format!("{SUMMARY}\n{SUMMARY}"), "exit 1");
    assert_eq!(fake.turn(None, "Bonjour").0, Ok(()));
}

#[test]
fn claude_code_exiting_in_error_without_summary_fails_the_turn() {
    let fake = FakeClaude::new(INIT, "exit 3");
    assert_eq!(
        fake.turn(None, "Bonjour").0,
        Err(ClaudeError::Failed("aucun bilan".to_owned()))
    );
}

#[test]
fn claude_code_exiting_in_error_with_a_reason_gives_the_reason_instead_of_no_summary() {
    let fake = FakeClaude::new("", "echo \"error: unknown option '--x'\" >&2; exit 1");
    assert_eq!(
        fake.turn(None, "Bonjour").0,
        Err(ClaudeError::Failed(
            "error: unknown option '--x'".to_owned()
        ))
    );
}

#[test]
fn the_reason_keeps_only_the_last_lines_of_what_claude_code_says() {
    let fake = FakeClaude::new(
        "",
        "for n in 1 2 3 4 5; do echo \"ligne $n\" >&2; done; exit 1",
    );
    assert_eq!(
        fake.turn(None, "Bonjour").0,
        Err(ClaudeError::Failed("ligne 3 ligne 4 ligne 5".to_owned()))
    );
}

#[test]
fn claude_code_exiting_well_without_summary_ends_the_turn_well() {
    let fake = FakeClaude::new(INIT, "exit 0");
    assert_eq!(fake.turn(None, "Bonjour").0, Ok(()));
}

#[test]
fn a_missing_program_means_claude_code_is_missing() {
    let fake = FakeClaude::new(SUMMARY, "");
    let claude = ClaudeCodeCli::new(fake.folder.path().join("introuvable"));
    let end = claude.send(
        ClaudeTurn {
            workspace: &fake.workspace(),
            conversation: None,
            settings: TurnSettings::default(),
            tools: None,
        },
        "Bonjour",
        &mut |_| {},
    );
    assert_eq!(end, Err(ClaudeError::Missing));
}

#[test]
fn a_missing_workspace_fails_the_turn_without_launching_claude_code() {
    let fake = FakeClaude::new(SUMMARY, "");
    let gone = fake.folder.path().join("Disparu").display().to_string();
    let end = fake.claude.send(
        ClaudeTurn {
            workspace: &WorkspaceLocation::new(gone.clone()).unwrap(),
            conversation: None,
            settings: TurnSettings::default(),
            tools: None,
        },
        "Bonjour",
        &mut |_| {},
    );
    assert_eq!(
        end,
        Err(ClaudeError::Failed(format!(
            "l'espace de travail {gone} est introuvable"
        )))
    );
    assert!(!fake.folder.path().join("args").exists());
}

#[test]
fn after_a_finished_turn_another_one_can_start() {
    let fake = FakeClaude::new(SUMMARY, "");
    fake.turn(None, "Un").0.unwrap();
    assert_eq!(fake.turn(None, "Deux").0, Ok(()));
    assert_eq!(fake.received("input"), "Deux");
}

#[test]
fn the_texts_of_sub_agents_are_followed_only_when_claude_code_knows_how() {
    let fake = FakeClaude::new(SUMMARY, "");
    fs::write(
        fake.folder.path().join("help"),
        format!("{FULL_HELP} --forward-subagent-text"),
    )
    .unwrap();
    fake.turn(None, "Bonjour").0.unwrap();
    assert!(
        fake.arguments_and_guard()
            .0
            .ends_with("--setting-sources\n\n--forward-subagent-text\n")
    );
}

#[test]
fn a_turn_with_a_claude_code_that_lacks_an_option_says_so_and_does_not_launch_it() {
    let fake = FakeClaude::new(SUMMARY, "");
    fs::write(
        fake.folder.path().join("help"),
        FULL_HELP.replace("--setting-sources", ""),
    )
    .unwrap();
    let Err(ClaudeError::Failed(reason)) = fake.turn(None, "Bonjour").0 else {
        panic!("le tour devait échouer");
    };
    assert!(reason.starts_with("Claude Code ne connaît pas --setting-sources"));
    assert!(!fake.folder.path().join("args").exists());
}
