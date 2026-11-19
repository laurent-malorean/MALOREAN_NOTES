//! Contrat de Claude Code : joué à l'identique sur le faux et sur l'adaptateur qui lance le
//! programme `claude` (lui-même remplacé, dans les tests, par un faux Claude Code qui rejoue un
//! flux enregistré).

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::mpsc;
use std::thread;

use domain::claude::{ClaudeEvent, ClaudeModel, ConversationId, Effort, TurnSettings};

use crate::{ClaudeCode, ClaudeError, ClaudeStatus, WorkspaceLocation};

/// Deux Claude Code préparés pour le contrat, dans l'espace de travail `workspace`.
#[derive(Debug)]
pub struct ClaudeCodes<'a> {
    /// L'espace de travail où chaque tour est joué.
    pub workspace: WorkspaceLocation,
    /// Un Claude Code connecté, dont chaque tour annonce `replayed`, puis se termine.
    pub replaying: &'a dyn ClaudeCode,
    /// Les événements annoncés par chaque tour de `replaying`.
    pub replayed: Vec<ClaudeEvent>,
    /// Un Claude Code dont chaque tour annonce au moins un événement, puis attend d'être arrêté.
    pub hanging: &'a dyn ClaudeCode,
}

/// Joue tout le contrat.
pub fn claude_code_contract(codes: &ClaudeCodes<'_>) {
    a_connected_claude_code_is_ready(codes);
    a_turn_gives_every_event_in_order(codes);
    a_continued_conversation_gives_every_event_in_order(codes);
    a_conversation_continued_with_other_settings_gives_every_event_in_order(codes);
    stopping_without_a_turn_changes_nothing(codes);
    a_running_turn_is_alone_and_stops_on_request(codes);
}

/// Les événements d'un tour de `claude`, et comment il s'est terminé.
fn turn(
    claude: &dyn ClaudeCode,
    workspace: &WorkspaceLocation,
    conversation: Option<&ConversationId>,
) -> (Result<(), ClaudeError>, Vec<ClaudeEvent>) {
    turn_with(claude, workspace, conversation, TurnSettings::default())
}

/// Les événements d'un tour de `claude` joué avec `settings`, et comment il s'est terminé.
fn turn_with(
    claude: &dyn ClaudeCode,
    workspace: &WorkspaceLocation,
    conversation: Option<&ConversationId>,
    settings: TurnSettings,
) -> (Result<(), ClaudeError>, Vec<ClaudeEvent>) {
    let mut events = Vec::new();
    let end = claude.send(workspace, conversation, settings, "Bonjour", &mut |event| {
        events.push(event);
    });
    (end, events)
}

fn a_connected_claude_code_is_ready(codes: &ClaudeCodes<'_>) {
    assert_eq!(codes.replaying.status(), ClaudeStatus::Ready);
}

fn a_turn_gives_every_event_in_order(codes: &ClaudeCodes<'_>) {
    let (end, events) = turn(codes.replaying, &codes.workspace, None);
    assert_eq!(end, Ok(()));
    assert_eq!(events, codes.replayed);
}

fn a_continued_conversation_gives_every_event_in_order(codes: &ClaudeCodes<'_>) {
    let conversation = ConversationId::new("conversation-1").unwrap();
    let (end, events) = turn(codes.replaying, &codes.workspace, Some(&conversation));
    assert_eq!(end, Ok(()));
    assert_eq!(events, codes.replayed);
}

fn a_conversation_continued_with_other_settings_gives_every_event_in_order(
    codes: &ClaudeCodes<'_>,
) {
    let conversation = ConversationId::new("conversation-1").unwrap();
    let settings = TurnSettings {
        model: Some(ClaudeModel::Opus),
        effort: Some(Effort::Max),
    };
    let (end, events) = turn_with(
        codes.replaying,
        &codes.workspace,
        Some(&conversation),
        settings,
    );
    assert_eq!(end, Ok(()));
    assert_eq!(events, codes.replayed);
}

fn stopping_without_a_turn_changes_nothing(codes: &ClaudeCodes<'_>) {
    codes.replaying.stop();
    let (end, events) = turn(codes.replaying, &codes.workspace, None);
    assert_eq!(end, Ok(()));
    assert_eq!(events, codes.replayed);
}

fn a_running_turn_is_alone_and_stops_on_request(codes: &ClaudeCodes<'_>) {
    let (sender, received) = mpsc::channel();
    thread::scope(|scope| {
        let running = scope.spawn(|| {
            codes.hanging.send(
                &codes.workspace,
                None,
                TurnSettings::default(),
                "Bonjour",
                &mut |event| {
                    sender.send(event).unwrap();
                },
            )
        });
        received.recv().unwrap();
        let second = turn(codes.hanging, &codes.workspace, None);
        codes.hanging.stop();
        assert_eq!(second, (Err(ClaudeError::Busy), Vec::new()));
        assert_eq!(running.join().unwrap(), Err(ClaudeError::Stopped));
    });
}
