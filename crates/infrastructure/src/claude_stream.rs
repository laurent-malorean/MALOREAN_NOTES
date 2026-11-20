//! Le flux de Claude Code (`--output-format stream-json`) traduit en événements de Claude : une
//! ligne JSON donne zéro, un ou plusieurs événements. Une ligne illisible, d'un type inconnu ou
//! sans ce qu'il faut est ignorée : Claude Code évolue vite (fiche 0032). Le lecteur retient le
//! modèle annoncé au début de la réponse, pour trouver la taille de son contexte dans le bilan.

use std::time::Duration;

use domain::claude::{
    ActionId, ActionKind, ActionOutcome, AgentState, ClaudeAction, ClaudeEvent, ContextFill,
    ConversationId, LimitPeriod, TurnOutcome, TurnSummary, UsageLimits, UsageWindow,
};
use serde_json::Value;

use crate::web_guard::HELD_BACK;

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

/// Les périodes de la limite d'utilisation, sous leur nom dans le flux.
const PERIODS: [(&str, LimitPeriod); 2] = [
    ("five_hour", LimitPeriod::Session),
    ("seven_day", LimitPeriod::Week),
];

/// Le lecteur du flux d'un tour.
#[derive(Debug, Default)]
pub(crate) struct StreamReader {
    /// Le modèle annoncé au début de la réponse.
    model: Option<String>,
}

impl StreamReader {
    /// Les événements de Claude annoncés par une ligne du flux.
    pub(crate) fn events_of(&mut self, line: &str) -> Vec<ClaudeEvent> {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return Vec::new();
        };
        match (text(&value["type"]), text(&value["subtype"])) {
            (Some("system"), Some("init")) => self.started(&value),
            (Some("system"), Some("permission_denied")) => {
                action_refused(&value).into_iter().collect()
            }
            (Some("system"), Some("task_notification")) => {
                sub_agent_finished(&value).into_iter().collect()
            }
            (Some("assistant"), _) => blocks(&value)
                .filter_map(|block| assistant_said(block, agent(&value)))
                .collect(),
            (Some("user"), _) => blocks(&value).flat_map(action_finished).collect(),
            (Some("rate_limit_event"), _) => usage_limits(&value).into_iter().collect(),
            (Some("result"), _) => context_filled(&value, self.model.as_deref())
                .into_iter()
                .chain([ClaudeEvent::Summary(summary(&value))])
                .collect(),
            _ => Vec::new(),
        }
    }

    /// Le début de la réponse : la conversation, et le modèle qui répond, retenu.
    fn started(&mut self, value: &Value) -> Vec<ClaudeEvent> {
        self.model = text(&value["model"]).map(str::to_owned);
        conversation_started(value)
            .into_iter()
            .chain(self.model.clone().map(ClaudeEvent::ModelUsed))
            .collect()
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
        ActionKind::WebSearch => "query",
        ActionKind::WebPage => "url",
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
        "WebSearch" => ActionKind::WebSearch,
        "WebFetch" => ActionKind::WebPage,
        other => ActionKind::Other(other.to_owned()),
    }
}

/// L'issue d'une action ; refusée d'abord si son outil est hors des autorisations, retenue
/// d'abord si le garde-fou du web l'a empêchée.
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
    let said = texts(&block["content"]);
    if said.iter().any(|said| said.contains(HELD_BACK)) {
        events.push(ClaudeEvent::ChangeHeldBack { id: id.clone() });
    } else if said
        .iter()
        .any(|said| LEFT_OUT_MARKS.iter().any(|mark| said.contains(mark)))
    {
        events.push(ClaudeEvent::ActionRefused { id: id.clone() });
    }
    events.push(ClaudeEvent::ActionFinished {
        id,
        outcome: ActionOutcome::Failed,
    });
    events
}

/// Ce que dit l'issue d'une action : un texte, ou une liste de blocs de texte.
fn texts(content: &Value) -> Vec<&str> {
    match content.as_array() {
        Some(blocks) => blocks
            .iter()
            .filter_map(|block| text(&block["text"]))
            .collect(),
        None => text(content).into_iter().collect(),
    }
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

/// La limite d'utilisation : chaque période annoncée en entier, et si elle est atteinte.
fn usage_limits(value: &Value) -> Option<ClaudeEvent> {
    let info = &value["rate_limit_info"];
    let windows: Vec<UsageWindow> = PERIODS
        .into_iter()
        .filter_map(|(name, period)| {
            let window = &info["unifiedWindows"][name];
            Some(UsageWindow {
                period,
                percent: percent(window["utilization"].as_f64()?),
                resets_at: window["resetsAt"].as_u64()?,
            })
        })
        .collect();
    let reached = text(&info["status"]) == Some("rejected");
    (reached || !windows.is_empty())
        .then_some(ClaudeEvent::UsageLimits(UsageLimits { reached, windows }))
}

/// Une part (de 0 à 1) en pourcentage arrondi.
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "la conversion d'un flottant en entier sature : une part négative donne 0"
)]
fn percent(share: f64) -> u32 {
    (share * 100.0).round() as u32
}

/// Le remplissage du contexte : les jetons de la dernière requête de la réponse (lus, dont le
/// cache, et écrits), sur la taille du contexte du modèle qui a répondu (le seul annoncé, à
/// défaut).
fn context_filled(value: &Value, model: Option<&str>) -> Option<ClaudeEvent> {
    let last = value["usage"]["iterations"].as_array()?.last()?;
    let models = value["modelUsage"].as_object()?;
    let usage = match model.and_then(|model| models.get(model)) {
        Some(usage) => usage,
        None if models.len() == 1 => models.values().next()?,
        None => return None,
    };
    let size = usage["contextWindow"].as_u64().filter(|size| *size > 0)?;
    let used = TOKEN_COUNTERS
        .iter()
        .map(|counter| number(&last[counter]))
        .sum();
    Some(ClaudeEvent::ContextFilled(ContextFill { used, size }))
}

#[cfg(test)]
#[path = "claude_stream_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "claude_stream_load_tests.rs"]
mod load_tests;
