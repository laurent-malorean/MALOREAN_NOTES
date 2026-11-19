//! Le flux de Claude Code traduit : des flux enregistrés avec le vrai `claude` (`--model haiku`,
//! message trivial, dossier jetable, chemins remplacés par `/Users/moi`), puis des lignes écrites
//! à la main pour chaque cas.

use super::*;

const NOTE_EDITED: &str = include_str!("../tests/claude_streams/note_edited.jsonl");
const SUB_AGENT: &str = include_str!("../tests/claude_streams/sub_agent.jsonl");
const REFUSED: &str = include_str!("../tests/claude_streams/refused.jsonl");
const UNKNOWN_CONVERSATION: &str =
    include_str!("../tests/claude_streams/unknown_conversation.jsonl");

fn stream(lines: &str) -> Vec<ClaudeEvent> {
    lines.lines().flat_map(events_of).collect()
}

fn id(text: &str) -> ActionId {
    ActionId::new(text).unwrap()
}

fn started(conversation: &str) -> ClaudeEvent {
    ClaudeEvent::ConversationStarted(ConversationId::new(conversation).unwrap())
}

fn said(agent: Option<&str>, text: &str) -> ClaudeEvent {
    ClaudeEvent::Message {
        agent: agent.map(id),
        text: text.to_owned(),
    }
}

fn launched(agent: Option<&str>, action: &str, kind: ActionKind, target: &str) -> ClaudeEvent {
    ClaudeEvent::ActionStarted {
        agent: agent.map(id),
        action: ClaudeAction {
            id: id(action),
            kind,
            target: Some(target.to_owned()),
        },
    }
}

fn finished(action: &str, outcome: ActionOutcome) -> ClaudeEvent {
    ClaudeEvent::ActionFinished {
        id: id(action),
        outcome,
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
fn an_edited_note_gives_messages_actions_their_outcomes_and_the_summary() {
    assert_eq!(
        stream(NOTE_EDITED),
        vec![
            started("aae7955b-a3d2-411a-8134-172857db16ad"),
            said(
                None,
                "Je dois d'abord lire le fichier pour voir son format avant de l'ajouter."
            ),
            launched(
                None,
                "toolu_01QiSyLmQVvr3DeE6KYWmAjt",
                ActionKind::Read,
                "/Users/moi/Notes/liste de courses.md"
            ),
            finished("toolu_01QiSyLmQVvr3DeE6KYWmAjt", ActionOutcome::Failed),
            launched(
                None,
                "toolu_01SiLbrrCzd21LRNhCSUWvot",
                ActionKind::Search,
                "**/*ourses*.md"
            ),
            finished("toolu_01SiLbrrCzd21LRNhCSUWvot", ActionOutcome::Succeeded),
            launched(
                None,
                "toolu_012NfyDF3vax4ntzHcSuX7jf",
                ActionKind::Read,
                "/Users/moi/Notes/courses.md"
            ),
            finished("toolu_012NfyDF3vax4ntzHcSuX7jf", ActionOutcome::Succeeded),
            launched(
                None,
                "toolu_01XoxUSiWZ4maDHQ2B6c6KFs",
                ActionKind::Edit,
                "/Users/moi/Notes/courses.md"
            ),
            finished("toolu_01XoxUSiWZ4maDHQ2B6c6KFs", ActionOutcome::Succeeded),
            said(
                None,
                "« Lait » est ajouté à la liste de courses, dans `courses.md` (le fichier s'appelle en réalité `courses.md`, pas « liste de courses.md »), juste après « pain »."
            ),
            summary(TurnOutcome::Succeeded, 5720, 48260),
        ]
    );
}

#[test]
fn a_sub_agent_s_messages_and_actions_are_tied_to_the_action_that_launched_it() {
    let agent = Some("toolu_016jtHamLucgaXVyczP6UQkf");
    assert_eq!(
        stream(SUB_AGENT),
        vec![
            started("b47f5d4f-cf66-4ba6-9a15-09950ad6c728"),
            launched(
                None,
                "toolu_016jtHamLucgaXVyczP6UQkf",
                ActionKind::SubAgent,
                "Compter articles de courses.md"
            ),
            finished("toolu_016jtHamLucgaXVyczP6UQkf", ActionOutcome::Succeeded),
            said(
                None,
                "Le sous-agent lit courses.md en arrière-plan. Je vous donnerai le nombre d'articles dès qu'il aura terminé."
            ),
            launched(
                agent,
                "toolu_01N76UkgSric6C2Jn3Y4sBmc",
                ActionKind::Search,
                "**/courses.md"
            ),
            finished("toolu_01N76UkgSric6C2Jn3Y4sBmc", ActionOutcome::Succeeded),
            launched(
                agent,
                "toolu_018e9UM9UHeEh22A1ruCRYRb",
                ActionKind::Read,
                "/Users/moi/Notes/courses.md"
            ),
            finished("toolu_018e9UM9UHeEh22A1ruCRYRb", ActionOutcome::Succeeded),
            said(
                agent,
                "2 articles\n\n- pain\n- lait\n\nFichier lu : /Users/moi/Notes/courses.md"
            ),
            ClaudeEvent::SubAgentFinished {
                id: id("toolu_016jtHamLucgaXVyczP6UQkf"),
                state: AgentState::Done,
                duration: Duration::from_millis(3339),
                tokens: 8523,
                actions: 2,
            },
            started("b47f5d4f-cf66-4ba6-9a15-09950ad6c728"),
            said(
                None,
                "Le fichier courses.md contient 2 articles : pain et lait."
            ),
            summary(TurnOutcome::Succeeded, 2971, 19234),
            summary(TurnOutcome::Succeeded, 731, 10570),
        ]
    );
}

#[test]
fn an_action_outside_the_workspace_is_refused_then_fails() {
    let events = stream(REFUSED);
    assert_eq!(
        events[1..4],
        [
            launched(
                None,
                "toolu_01CJrjtUx1GEyL7FTRDqUMKm",
                ActionKind::Write,
                "/Users/moi/hors.md"
            ),
            ClaudeEvent::ActionRefused {
                id: id("toolu_01CJrjtUx1GEyL7FTRDqUMKm")
            },
            finished("toolu_01CJrjtUx1GEyL7FTRDqUMKm", ActionOutcome::Failed),
        ]
    );
}

#[test]
fn an_unknown_conversation_gives_a_failed_summary_with_the_reason() {
    assert_eq!(
        stream(UNKNOWN_CONVERSATION),
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
fn every_error_of_a_failed_summary_is_kept() {
    let line = r#"{"type":"result","is_error":true,"errors":["un",2,"deux"]}"#;
    assert_eq!(
        events_of(line),
        vec![summary(TurnOutcome::Failed("un ; deux".to_owned()), 0, 0)]
    );
}

#[test]
fn without_errors_a_failed_summary_gives_claude_s_answer_or_else_its_kind() {
    let answered = r#"{"type":"result","is_error":true,"errors":[],"result":"Limite atteinte"}"#;
    let bare = r#"{"type":"result","subtype":"error_max_turns","is_error":true}"#;
    assert_eq!(
        events_of(answered),
        vec![summary(
            TurnOutcome::Failed("Limite atteinte".to_owned()),
            0,
            0
        )]
    );
    assert_eq!(
        events_of(bare),
        vec![summary(
            TurnOutcome::Failed("error_max_turns".to_owned()),
            0,
            0
        )]
    );
}

#[test]
fn a_summary_adds_up_every_token_read_and_written() {
    let line = r#"{"type":"result","is_error":false,"duration_ms":7,"usage":{"input_tokens":1,"cache_creation_input_tokens":20,"cache_read_input_tokens":300,"output_tokens":4000}}"#;
    assert_eq!(
        events_of(line),
        vec![summary(TurnOutcome::Succeeded, 7, 4321)]
    );
}

/// La fin annoncée d'un sous-agent au statut `status`.
fn sub_agent_end(status: &str) -> Vec<ClaudeEvent> {
    events_of(&format!(
        r#"{{"type":"system","subtype":"task_notification","tool_use_id":"t1","status":"{status}"}}"#
    ))
}

fn ended(state: AgentState) -> Vec<ClaudeEvent> {
    vec![ClaudeEvent::SubAgentFinished {
        id: id("t1"),
        state,
        duration: Duration::ZERO,
        tokens: 0,
        actions: 0,
    }]
}

#[test]
fn each_end_of_a_sub_agent_gives_its_state() {
    assert_eq!(sub_agent_end("completed"), ended(AgentState::Done));
    assert_eq!(sub_agent_end("killed"), ended(AgentState::Stopped));
    assert_eq!(sub_agent_end("stopped"), ended(AgentState::Stopped));
    assert_eq!(sub_agent_end("failed"), ended(AgentState::Failed));
    assert_eq!(sub_agent_end("statut-futur"), ended(AgentState::Failed));
}

/// L'action lancée par une ligne qui utilise l'outil `tool` avec `input`.
fn action_of(tool: &str, input: &str) -> Vec<ClaudeEvent> {
    events_of(&format!(
        r#"{{"type":"assistant","message":{{"content":[{{"type":"tool_use","id":"t1","name":"{tool}","input":{input}}}]}}}}"#
    ))
}

fn action(kind: ActionKind, target: Option<&str>) -> Vec<ClaudeEvent> {
    vec![ClaudeEvent::ActionStarted {
        agent: None,
        action: ClaudeAction {
            id: id("t1"),
            kind,
            target: target.map(str::to_owned),
        },
    }]
}

#[test]
fn each_tool_of_claude_code_gives_its_kind_of_action_and_its_target() {
    assert_eq!(
        action_of("Write", r#"{"file_path":"/N/a.md"}"#),
        action(ActionKind::Write, Some("/N/a.md"))
    );
    assert_eq!(
        action_of("Grep", r#"{"pattern":"lait"}"#),
        action(ActionKind::Search, Some("lait"))
    );
    assert_eq!(
        action_of("Task", r#"{"description":"Compter"}"#),
        action(ActionKind::SubAgent, Some("Compter"))
    );
    assert_eq!(
        action_of("NotebookEdit", r#"{"file_path":"/N/a.ipynb"}"#),
        action(ActionKind::Other("NotebookEdit".to_owned()), None)
    );
}

#[test]
fn illegible_unknown_or_incomplete_lines_are_ignored() {
    let lines = [
        "pas du JSON",
        r#"{"type":"rate_limit_event"}"#,
        r#"{"type":"type-futur"}"#,
        r#"{"type":"system","subtype":"init"}"#,
        r#"{"type":"system","subtype":"init","session_id":""}"#,
        r#"{"type":"system","subtype":"permission_denied"}"#,
        r#"{"type":"system","subtype":"task_notification","status":"completed"}"#,
        r#"{"type":"system","subtype":"task_progress","tool_use_id":"t1"}"#,
        r#"{"type":"assistant","message":{"content":[{"type":"thinking"},{"type":"image"},{"text":"x"},{"type":"text"}]}}"#,
        r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read"},{"type":"tool_use","id":"t1"}]}}"#,
        r#"{"type":"user","message":{"content":[{"type":"text","text":"x"},{"type":"tool_result"},{"tool_use_id":"t1"}]}}"#,
        r#"{"type":"user","message":{"content":"Bonjour"}}"#,
    ];
    assert_eq!(stream(&lines.join("\n")), Vec::new());
}
