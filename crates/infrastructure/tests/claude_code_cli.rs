//! Claude Code piloté en arrière-plan, avec un faux Claude Code : un script qui note ses
//! arguments, son dossier, son entrée et la clé d'API qu'il voit, puis rejoue un flux enregistré.
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
use application::{ClaudeCode, ClaudeError, WorkspaceLocation};
use domain::claude::{ClaudeEvent, ConversationId, TurnOutcome, TurnSummary};
use infrastructure::ClaudeCodeCli;
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
        let script = folder.path().join("claude");
        fs::write(
            &script,
            format!(
                "#!/bin/sh\nprintf '%s\\n' \"$@\" > '{dir}/args'\npwd -P > '{dir}/cwd'\n\
                 printf '%s' \"${{ANTHROPIC_API_KEY-absente}}\" > '{dir}/api_key'\n\
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
        let mut events = Vec::new();
        let end = self
            .claude
            .send(&self.workspace(), conversation, message, &mut |event| {
                events.push(event);
            });
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
            ClaudeEvent::Message {
                agent: None,
                text: "Lait.".to_owned(),
            },
            summary(TurnOutcome::Succeeded, 901, 10150),
        ],
        hanging: &hanging.claude,
    });
}

/// Les arguments attendus après le flux JSON et la conversation éventuelle.
const PERMISSIONS: &str = "--tools\nRead,Write,Edit,Glob,Grep,Agent\n\
    --permission-mode\nacceptEdits\n--permission-prompts\nnone\n--restricted\n\
    --strict-mcp-config\n--disable-slash-commands\n--forward-subagent-text\n";

#[test]
fn a_new_conversation_is_launched_with_the_stream_and_permission_options() {
    let fake = FakeClaude::new(SUMMARY, "");
    fake.turn(None, "Bonjour").0.unwrap();
    assert_eq!(
        fake.received("args"),
        format!("-p\n--output-format\nstream-json\n--verbose\n{PERMISSIONS}")
    );
}

#[test]
fn a_conversation_is_continued_by_its_id() {
    let fake = FakeClaude::new(SUMMARY, "");
    let conversation = ConversationId::new("aae7955b").unwrap();
    fake.turn(Some(&conversation), "Bonjour").0.unwrap();
    assert_eq!(
        fake.received("args"),
        format!("-p\n--output-format\nstream-json\n--verbose\n--resume\naae7955b\n{PERMISSIONS}")
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

/// Joué seul par le test qui suit, avec une clé d'API dans l'environnement ; sans clé, il passe
/// aussi.
#[test]
fn claude_code_never_sees_an_api_key() {
    let fake = FakeClaude::new(SUMMARY, "");
    fake.turn(None, "Bonjour").0.unwrap();
    assert_eq!(fake.received("api_key"), "absente");
}

#[test]
fn an_api_key_of_the_application_is_left_out_so_the_subscription_serves() {
    let status = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "claude_code_never_sees_an_api_key", "--quiet"])
        .env("ANTHROPIC_API_KEY", "clé-de-test")
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
fn claude_code_exiting_well_without_summary_ends_the_turn_well() {
    let fake = FakeClaude::new(INIT, "exit 0");
    assert_eq!(fake.turn(None, "Bonjour").0, Ok(()));
}

#[test]
fn a_missing_program_means_claude_code_is_missing() {
    let fake = FakeClaude::new(SUMMARY, "");
    let claude = ClaudeCodeCli::new(fake.folder.path().join("introuvable"));
    let end = claude.send(&fake.workspace(), None, "Bonjour", &mut |_| {});
    assert_eq!(end, Err(ClaudeError::Missing));
}

#[test]
fn a_missing_workspace_fails_the_turn_without_launching_claude_code() {
    let fake = FakeClaude::new(SUMMARY, "");
    let gone = fake.folder.path().join("Disparu").display().to_string();
    let end = fake.claude.send(
        &WorkspaceLocation::new(gone.clone()).unwrap(),
        None,
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
