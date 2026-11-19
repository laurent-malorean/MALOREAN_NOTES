//! Le flux de Claude Code (`--output-format stream-json`) traduit en événements de Claude : une
//! ligne JSON donne zéro, un ou plusieurs événements. Une ligne illisible, d'un type inconnu ou
//! sans ce qu'il faut est ignorée : Claude Code évolue vite (fiche 0032).

use std::time::Duration;

use domain::claude::{
    ActionId, ActionKind, ActionOutcome, AgentState, ClaudeAction, ClaudeEvent, ConversationId,
    TurnOutcome, TurnSummary,
};
use serde_json::Value;

/// Les compteurs de jetons du bilan, lus et écrits, additionnés.
const TOKEN_COUNTERS: [&str; 4] = [
    "input_tokens",
    "cache_creation_input_tokens",
    "cache_read_input_tokens",
    "output_tokens",
];

/// Ce que dit Claude Code d'une action dont l'outil, ou le sous-agent, est hors des autorisations
/// (`--tools`) : elle est refusée, comme celles que les autorisations interdisent.
const LEFT_OUT_MARKS: [&str; 2] = [
    "No such tool available",
    "denied by the current permission settings",
];

/// Les événements de Claude annoncés par une ligne du flux.
pub(crate) fn events_of(line: &str) -> Vec<ClaudeEvent> {
    let Ok(value) = serde_json::from_str::<Value>(line) else {
        return Vec::new();
    };
    match (text(&value["type"]), text(&value["subtype"])) {
        (Some("system"), Some("init")) => conversation_started(&value).into_iter().collect(),
        (Some("system"), Some("permission_denied")) => action_refused(&value).into_iter().collect(),
        (Some("system"), Some("task_notification")) => {
            sub_agent_finished(&value).into_iter().collect()
        }
        (Some("assistant"), _) => blocks(&value)
            .filter_map(|block| assistant_said(block, agent(&value)))
            .collect(),
        (Some("user"), _) => blocks(&value).flat_map(action_finished).collect(),
        (Some("result"), _) => vec![ClaudeEvent::Summary(summary(&value))],
        _ => Vec::new(),
    }
}

fn text(value: &Value) -> Option<&str> {
    value.as_str()
}

fn number(value: &Value) -> u64 {
    value.as_u64().unwrap_or(0)
}

fn action_id(value: &Value) -> Option<ActionId> {
    text(value).and_then(|id| ActionId::new(id).ok())
}

/// L'action qui a lancé le sous-agent auteur de la ligne ; aucune pour Claude lui-même.
fn agent(value: &Value) -> Option<ActionId> {
    action_id(&value["parent_tool_use_id"])
}

fn blocks(value: &Value) -> impl Iterator<Item = &Value> {
    value["message"]["content"].as_array().into_iter().flatten()
}

fn conversation_started(value: &Value) -> Option<ClaudeEvent> {
    let id = text(&value["session_id"])?;
    ConversationId::new(id)
        .ok()
        .map(ClaudeEvent::ConversationStarted)
}

fn action_refused(value: &Value) -> Option<ClaudeEvent> {
    action_id(&value["tool_use_id"]).map(|id| ClaudeEvent::ActionRefused { id })
}

/// Un bloc d'un message de Claude : un texte ou une action lancée ; la réflexion n'est pas montrée.
fn assistant_said(block: &Value, agent: Option<ActionId>) -> Option<ClaudeEvent> {
    match text(&block["type"])? {
        "text" => Some(ClaudeEvent::Message {
            agent,
            text: text(&block["text"])?.to_owned(),
        }),
        "tool_use" => Some(ClaudeEvent::ActionStarted {
            agent,
            action: action(block)?,
        }),
        _ => None,
    }
}

fn action(block: &Value) -> Option<ClaudeAction> {
    let id = action_id(&block["id"])?;
    let kind = kind(text(&block["name"])?);
    let field = match kind {
        ActionKind::Read | ActionKind::Write | ActionKind::Edit => "file_path",
        ActionKind::Search => "pattern",
        ActionKind::SubAgent => "description",
        ActionKind::Other(_) => "",
    };
    let target = text(&block["input"][field]).map(str::to_owned);
    Some(ClaudeAction { id, kind, target })
}

/// L'outil de Claude Code par son nom (l'outil des sous-agents s'appelait `Task` avant `Agent`).
fn kind(tool: &str) -> ActionKind {
    match tool {
        "Read" => ActionKind::Read,
        "Glob" | "Grep" => ActionKind::Search,
        "Write" => ActionKind::Write,
        "Edit" => ActionKind::Edit,
        "Agent" | "Task" => ActionKind::SubAgent,
        other => ActionKind::Other(other.to_owned()),
    }
}

/// L'issue d'une action ; refusée d'abord si son outil est hors des autorisations.
fn action_finished(block: &Value) -> Vec<ClaudeEvent> {
    let Some(id) = action_id(&block["tool_use_id"]) else {
        return Vec::new();
    };
    if text(&block["type"]) != Some("tool_result") {
        return Vec::new();
    }
    if block["is_error"].as_bool() != Some(true) {
        return vec![ClaudeEvent::ActionFinished {
            id,
            outcome: ActionOutcome::Succeeded,
        }];
    }
    let mut events = Vec::new();
    if left_out(&block["content"]) {
        events.push(ClaudeEvent::ActionRefused { id: id.clone() });
    }
    events.push(ClaudeEvent::ActionFinished {
        id,
        outcome: ActionOutcome::Failed,
    });
    events
}

/// L'issue en erreur dit que l'outil est hors des autorisations ; elle est un texte, ou une
/// liste de blocs de texte.
fn left_out(content: &Value) -> bool {
    let texts: Vec<&str> = match content.as_array() {
        Some(blocks) => blocks
            .iter()
            .filter_map(|block| text(&block["text"]))
            .collect(),
        None => text(content).into_iter().collect(),
    };
    texts
        .iter()
        .any(|said| LEFT_OUT_MARKS.iter().any(|mark| said.contains(mark)))
}

fn sub_agent_finished(value: &Value) -> Option<ClaudeEvent> {
    let id = action_id(&value["tool_use_id"])?;
    let state = match text(&value["status"]) {
        Some("completed") => AgentState::Done,
        Some("killed" | "stopped") => AgentState::Stopped,
        _ => AgentState::Failed,
    };
    let usage = &value["usage"];
    Some(ClaudeEvent::SubAgentFinished {
        id,
        state,
        duration: Duration::from_millis(number(&usage["duration_ms"])),
        tokens: number(&usage["total_tokens"]),
        actions: u32::try_from(number(&usage["tool_uses"])).unwrap_or(u32::MAX),
    })
}

fn summary(value: &Value) -> TurnSummary {
    let outcome = if value["is_error"].as_bool() == Some(true) {
        TurnOutcome::Failed(failure(value))
    } else {
        TurnOutcome::Succeeded
    };
    TurnSummary {
        outcome,
        duration: Duration::from_millis(number(&value["duration_ms"])),
        tokens: TOKEN_COUNTERS
            .iter()
            .map(|counter| number(&value["usage"][counter]))
            .sum(),
    }
}

/// Pourquoi Claude n'a pas pu répondre : les erreurs annoncées, sinon sa réponse, sinon le genre
/// de bilan.
fn failure(value: &Value) -> String {
    let errors: Vec<&str> = value["errors"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(text)
        .collect();
    if errors.is_empty() {
        text(&value["result"])
            .or_else(|| text(&value["subtype"]))
            .unwrap_or_default()
            .to_owned()
    } else {
        errors.join(" ; ")
    }
}

#[cfg(test)]
#[path = "claude_stream_tests.rs"]
mod tests;
