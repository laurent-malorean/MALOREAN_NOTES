//! Le flux de Claude Code traduit : des flux enregistrés avec le vrai `claude` (`--model haiku`,
//! message trivial, dossier jetable, chemins remplacés par `/Users/moi`), puis des lignes écrites
//! à la main pour chaque cas.

use super::*;

const NOTE_EDITED: &str = include_str!("../tests/claude_streams/note_edited.jsonl");
const SUB_AGENT: &str = include_str!("../tests/claude_streams/sub_agent.jsonl");
const REFUSED: &str = include_str!("../tests/claude_streams/refused.jsonl");
const ESCAPES_REFUSED: &str = include_str!("../tests/claude_streams/escapes_refused.jsonl");
const WEB_HELD_BACK: &str = include_str!("../tests/claude_streams/web_held_back.jsonl");
const UNKNOWN_CONVERSATION: &str =
    include_str!("../tests/claude_streams/unknown_conversation.jsonl");

/// Tous les événements d'un flux.
fn all_events(lines: &str) -> Vec<ClaudeEvent> {
    let mut reader = StreamReader::default();
    lines
        .lines()
        .flat_map(|line| reader.events_of(line))
        .collect()
}

/// Les événements d'une ligne seule.
fn events_of(line: &str) -> Vec<ClaudeEvent> {
    StreamReader::default().events_of(line)
}

/// La charge annoncée : version du modèle, limite d'utilisation, remplissage du contexte.
fn is_load(event: &ClaudeEvent) -> bool {
    matches!(
        event,
        ClaudeEvent::ModelUsed(_) | ClaudeEvent::UsageLimits(_) | ClaudeEvent::ContextFilled(_)
    )
}

/// Les événements du tour, sans la charge.
fn stream(lines: &str) -> Vec<ClaudeEvent> {
    all_events(lines)
        .into_iter()
        .filter(|event| !is_load(event))
        .collect()
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

/// Chaque action du flux : sa sorte, sa cible, si elle a été refusée, son issue.
fn actions_of(events: &[ClaudeEvent]) -> Vec<(ActionKind, String, bool, ActionOutcome)> {
    let mut actions = Vec::new();
    for event in events {
        match event {
            ClaudeEvent::ActionStarted { action, .. } => actions.push((
                action.kind.clone(),
                action.target.clone().unwrap_or_default(),
                false,
                ActionOutcome::Succeeded,
            )),
            ClaudeEvent::ActionRefused { .. } | ClaudeEvent::ChangeHeldBack { .. } => {
                actions.last_mut().unwrap().2 = true;
            }
            ClaudeEvent::ActionFinished { outcome, .. } => {
                actions.last_mut().unwrap().3 = *outcome;
            }
            _ => {}
        }
    }
    actions
}

/// Enregistré avec les options de l'adaptateur du 19/11 au matin, sans le web (fiche 0032) :
/// chaque échappée hors du dossier est refusée (chemin en `..`, lien symbolique vers un fichier
/// ou un dossier du dehors, écriture et recherche au dehors) ; les commandes système et, ce
/// jour-là, le web n'existaient pas, et y recourir était refusé aussi ; les notes du dossier sont
/// modifiées et créées sans rien demander.
#[test]
fn every_escape_from_the_workspace_is_refused_and_notes_inside_are_written() {
    use ActionKind::{Edit, Other, Read, Search, WebPage, Write};
    use ActionOutcome::{Failed, Succeeded};
    let refused = |kind, target: &str| (kind, target.to_owned(), true, Failed);
    let absent = |tool: &str| (Other(tool.to_owned()), String::new(), true, Failed);
    let done = |kind, target: &str| (kind, target.to_owned(), false, Succeeded);
    assert_eq!(
        actions_of(&stream(ESCAPES_REFUSED)),
        [
            refused(Read, "/Users/moi/Notes/../Hors/secret.txt"),
            refused(Read, "/Users/moi/Notes/lien.md"),
            refused(Read, "/Users/moi/Notes/dossier-lien/secret.txt"),
            refused(Write, "/Users/moi/Hors/written.txt"),
            refused(Write, "/Users/moi/Notes/dossier-lien/via-link.txt"),
            absent("Bash"),
            (WebPage, "https://example.com".to_owned(), true, Failed),
            done(Edit, "/Users/moi/Notes/note.md"),
            done(Write, "/Users/moi/Notes/nouvelle.md"),
            refused(Search, "*"),
        ]
    );
}

fn result_of(content: &str) -> Vec<ClaudeEvent> {
    stream(&format!(
        r#"{{"type":"user","message":{{"content":[{{"type":"tool_result","tool_use_id":"toolu_1","is_error":true,"content":{content}}}]}}}}"#
    ))
}

#[test]
fn a_tool_or_a_sub_agent_left_out_by_the_permissions_is_refused() {
    let refused = vec![
        ClaudeEvent::ActionRefused { id: id("toolu_1") },
        finished("toolu_1", ActionOutcome::Failed),
    ];
    assert_eq!(
        result_of(r#""<tool_use_error>Error: No such tool available: Bash.</tool_use_error>""#),
        refused
    );
    assert_eq!(
        result_of(
            r#"[{"type":"text","text":"Agent type 'web-fetch' is unavailable because every tool it may use is denied by the current permission settings."}]"#
        ),
        refused
    );
}

#[test]
fn a_change_held_back_by_the_web_guard_is_said_so_then_fails() {
    let held_back = vec![
        ClaudeEvent::ChangeHeldBack { id: id("toolu_1") },
        finished("toolu_1", ActionOutcome::Failed),
    ];
    let said = format!("PreToolUse:Write hook error: {HELD_BACK}");
    assert_eq!(result_of(&serde_json::to_string(&said).unwrap()), held_back);
    let blocks = serde_json::json!([{ "type": "text", "text": said }]);
    assert_eq!(result_of(&blocks.to_string()), held_back);
}

/// Enregistré avec les options exactes de l'adaptateur et son garde-fou du web (fiche 0032) :
/// Claude cherche sur le web, puis sa modification de note est retenue.
#[test]
fn after_a_web_search_the_change_of_a_note_is_held_back() {
    use ActionKind::{Edit, Read, WebSearch};
    use ActionOutcome::{Failed, Succeeded};
    let events = stream(WEB_HELD_BACK);
    assert_eq!(
        actions_of(&events),
        [
            (
                WebSearch,
                "capitale de la Mongolie".to_owned(),
                false,
                Succeeded
            ),
            (Read, "/Users/moi/Notes/a.md".to_owned(), false, Succeeded),
            (Edit, "/Users/moi/Notes/a.md".to_owned(), true, Failed),
        ]
    );
    assert!(
        events
            .iter()
            .any(|event| matches!(event, ClaudeEvent::ChangeHeldBack { .. }))
    );
    assert!(
        !events
            .iter()
            .any(|event| matches!(event, ClaudeEvent::ActionRefused { .. }))
    );
}

#[test]
fn any_other_error_of_an_action_is_a_failure() {
    let failed = vec![finished("toolu_1", ActionOutcome::Failed)];
    assert_eq!(result_of(r#""File has not been read yet.""#), failed);
    assert_eq!(
        result_of(r#"[{"type":"text","text":"Introuvable"}]"#),
        failed
    );
    assert_eq!(result_of("[{}]"), failed);
    assert_eq!(result_of("42"), failed);
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
        action_of("WebSearch", r#"{"query":"capitale","mode":"standard"}"#),
        action(ActionKind::WebSearch, Some("capitale"))
    );
    assert_eq!(
        action_of(
            "WebFetch",
            r#"{"url":"https://example.com","prompt":"Titre"}"#
        ),
        action(ActionKind::WebPage, Some("https://example.com"))
    );
    assert_eq!(
        action_of("NotebookEdit", r#"{"file_path":"/N/a.ipynb"}"#),
        action(ActionKind::Other("NotebookEdit".to_owned()), None)
    );
}

#[test]
fn a_tool_of_the_application_gives_its_action_and_its_target() {
    assert_eq!(
        action_of("mcp__malorean_notes__search_notes", r#"{"query":"pain"}"#),
        action(ActionKind::AppTool(AppTool::SearchNotes), Some("pain"))
    );
    assert_eq!(
        action_of("mcp__malorean_notes__list_tags", r#"{"query":"x"}"#),
        action(ActionKind::AppTool(AppTool::ListTags), None)
    );
    assert_eq!(
        action_of("mcp__autre__search_notes", r#"{"query":"pain"}"#),
        action(ActionKind::Other("autre · search_notes".to_owned()), None)
    );
}

#[test]
fn a_tool_of_a_permitted_server_is_shown_with_the_server_name_then_the_tool_name() {
    assert_eq!(
        action_of(
            "mcp__claude_ai_Noota__search_records",
            r#"{"query":"réunion"}"#
        ),
        action(ActionKind::Other("Noota · search_records".to_owned()), None)
    );
    assert_eq!(
        action_of("mcp__claude_ai_Google_Drive__search_files", "{}"),
        action(
            ActionKind::Other("Google Drive · search_files".to_owned()),
            None
        )
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
    assert_eq!(all_events(&lines.join("\n")), Vec::new());
}
