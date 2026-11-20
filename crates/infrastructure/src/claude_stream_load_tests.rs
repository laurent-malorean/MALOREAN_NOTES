//! La charge annoncée dans le flux de Claude Code : le modèle qui répond, la limite d'utilisation
//! de l'abonnement et le remplissage du contexte (flux enregistré `usage.jsonl` avec le vrai
//! `claude`, puis des lignes écrites à la main).

use super::*;

const USAGE: &str = include_str!("../tests/claude_streams/usage.jsonl");
const NOTE_EDITED: &str = include_str!("../tests/claude_streams/note_edited.jsonl");
const SUB_AGENT: &str = include_str!("../tests/claude_streams/sub_agent.jsonl");
const REFUSED: &str = include_str!("../tests/claude_streams/refused.jsonl");
const ESCAPES_REFUSED: &str = include_str!("../tests/claude_streams/escapes_refused.jsonl");
const WEB_HELD_BACK: &str = include_str!("../tests/claude_streams/web_held_back.jsonl");

fn all_events(lines: &str) -> Vec<ClaudeEvent> {
    let mut reader = StreamReader::default();
    lines
        .lines()
        .flat_map(|line| reader.events_of(line))
        .collect()
}

fn events_of(line: &str) -> Vec<ClaudeEvent> {
    StreamReader::default().events_of(line)
}

/// La charge seule.
fn load(lines: &str) -> Vec<ClaudeEvent> {
    all_events(lines)
        .into_iter()
        .filter(|event| {
            matches!(
                event,
                ClaudeEvent::ModelUsed(_)
                    | ClaudeEvent::UsageLimits(_)
                    | ClaudeEvent::ContextFilled(_)
            )
        })
        .collect()
}

fn window(period: LimitPeriod, percent: u32, resets_at: u64) -> UsageWindow {
    UsageWindow {
        period,
        percent,
        resets_at,
    }
}

fn limits(reached: bool, windows: Vec<UsageWindow>) -> ClaudeEvent {
    ClaudeEvent::UsageLimits(UsageLimits { reached, windows })
}

fn filled(used: u64, size: u64) -> ClaudeEvent {
    ClaudeEvent::ContextFilled(ContextFill { used, size })
}

fn said(text: &str) -> ClaudeEvent {
    ClaudeEvent::Message {
        agent: None,
        text: text.to_owned(),
    }
}

fn summary(milliseconds: u64, tokens: u64) -> ClaudeEvent {
    ClaudeEvent::Summary(TurnSummary {
        outcome: TurnOutcome::Succeeded,
        duration: Duration::from_millis(milliseconds),
        tokens,
    })
}

#[test]
fn a_turn_gives_the_model_the_usage_limits_and_the_context_fill_before_the_summary() {
    let events = all_events(USAGE);
    assert_eq!(
        events[1..],
        [
            ClaudeEvent::ModelUsed("claude-haiku-5-5".to_owned()),
            said("ok"),
            limits(
                false,
                vec![
                    window(LimitPeriod::Session, 16, 1_795_141_800),
                    window(LimitPeriod::Week, 43, 1_795_590_000),
                ]
            ),
            filled(2 + 1670 + 2346 + 4, 1_000_000),
            summary(868, 2 + 1670 + 2346 + 4),
        ]
    );
}

#[test]
fn the_context_fill_is_the_last_request_of_the_answer_not_the_whole_turn() {
    assert_eq!(
        load(NOTE_EDITED)[1..],
        [filled(2 + 9700 + 324 + 69, 1_000_000)]
    );
}

#[test]
fn every_recorded_turn_says_which_model_answered() {
    for recorded in [
        NOTE_EDITED,
        SUB_AGENT,
        REFUSED,
        ESCAPES_REFUSED,
        WEB_HELD_BACK,
    ] {
        assert_eq!(
            load(recorded)[0],
            ClaudeEvent::ModelUsed("claude-haiku-5-5".to_owned())
        );
    }
}

fn rate_limit(info: &str) -> Vec<ClaudeEvent> {
    events_of(&format!(
        r#"{{"type":"rate_limit_event","rate_limit_info":{info}}}"#
    ))
}

#[test]
fn a_reached_limit_is_said_so_and_a_utilization_is_rounded() {
    assert_eq!(
        rate_limit(
            r#"{"status":"rejected","unifiedWindows":{"seven_day":{"utilization":0.996,"resetsAt":9}}}"#
        ),
        vec![limits(true, vec![window(LimitPeriod::Week, 100, 9)])]
    );
    assert_eq!(
        rate_limit(r#"{"status":"rejected"}"#),
        vec![limits(true, Vec::new())]
    );
}

#[test]
fn a_limit_without_any_period_or_with_an_incomplete_one_says_nothing() {
    assert_eq!(rate_limit(r#"{"status":"allowed"}"#), Vec::new());
    assert_eq!(
        rate_limit(
            r#"{"status":"allowed","unifiedWindows":{"five_hour":{"resetsAt":9},"seven_day":{"utilization":0.5}}}"#
        ),
        Vec::new()
    );
}

fn result_with(model_usage: &str, iterations: &str) -> String {
    format!(
        r#"{{"type":"result","is_error":false,"duration_ms":1,"usage":{{"iterations":{iterations}}},"modelUsage":{model_usage}}}"#
    )
}

const LAST_REQUEST: &str = r#"[{"input_tokens":9},{"input_tokens":1,"cache_read_input_tokens":2,"cache_creation_input_tokens":3,"output_tokens":4}]"#;

#[test]
fn the_context_size_is_the_one_of_the_model_that_answered() {
    let mut reader = StreamReader::default();
    reader.events_of(
        r#"{"type":"system","subtype":"init","session_id":"c","model":"claude-opus-5-5"}"#,
    );
    let line = result_with(
        r#"{"claude-haiku-5-5":{"contextWindow":1000000},"claude-opus-5-5":{"contextWindow":200000}}"#,
        LAST_REQUEST,
    );
    assert_eq!(load(&line), Vec::new());
    assert_eq!(reader.events_of(&line)[0], filled(10, 200_000));
}

#[test]
fn a_single_model_gives_its_context_size_even_under_another_name() {
    let line = result_with(
        r#"{"claude-opus-5-5":{"contextWindow":200000}}"#,
        LAST_REQUEST,
    );
    assert_eq!(load(&line), vec![filled(10, 200_000)]);
}

#[test]
fn without_a_request_or_a_context_size_the_fill_is_unknown() {
    let size = r#"{"m":{"contextWindow":200000}}"#;
    assert_eq!(load(&result_with(size, "[]")), Vec::new());
    assert_eq!(
        load(&result_with(r#"{"m":{"contextWindow":0}}"#, LAST_REQUEST)),
        Vec::new()
    );
    assert_eq!(load(&result_with(r#"{"m":{}}"#, LAST_REQUEST)), Vec::new());
    assert_eq!(load(&result_with("{}", LAST_REQUEST)), Vec::new());
    assert_eq!(load(&result_with("[]", LAST_REQUEST)), Vec::new());
}
