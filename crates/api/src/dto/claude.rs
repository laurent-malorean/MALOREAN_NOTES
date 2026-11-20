//! Données de la colonne Claude Code échangées avec l'interface (fiche 0032).

use domain::claude::{
    ActionId, ActionKind, ActionOutcome, AgentState, ClaudeAction, ClaudeEvent, TurnOutcome,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::claude_load::UsageWindowItem;

/// Si Claude Code peut répondre, et avec quel compte Claude, sinon pourquoi et quoi faire. Sa
/// forme de débogage tait le compte : il n'est jamais écrit dans le journal.
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum ClaudeStatusItem {
    /// Claude Code est installé et connecté à ce compte Claude.
    Ready {
        /// L'adresse e-mail du compte, si Claude Code la donne.
        email: Option<String>,
        /// Le nom de l'organisation du compte, si Claude Code le donne.
        organization: Option<String>,
    },
    /// Il ne peut pas répondre, pour cette raison, prête à afficher.
    Unavailable {
        /// Ce qui manque, et ce qu'on peut faire.
        reason: String,
    },
}

impl std::fmt::Debug for ClaudeStatusItem {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Ready { .. } => formatter.write_str("Ready { .. }"),
            Self::Unavailable { reason } => formatter
                .debug_struct("Unavailable")
                .field("reason", reason)
                .finish(),
        }
    }
}

/// Ce que fait une action de Claude.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ActionKindItem {
    /// Lire un fichier.
    Read,
    /// Chercher des fichiers par leur nom ou dans leur texte.
    Search,
    /// Créer un fichier ou remplacer tout son texte.
    Write,
    /// Modifier une partie d'un fichier.
    Edit,
    /// Lancer un sous-agent.
    SubAgent,
    /// Chercher sur le web.
    WebSearch,
    /// Lire une page web.
    WebPage,
    /// Un outil que l'application ne connaît pas encore.
    Other,
}

/// Où en est un sous-agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum AgentStateItem {
    /// Il travaille encore.
    Running,
    /// Il a terminé.
    Done,
    /// Il s'est arrêté en erreur.
    Failed,
    /// Il a été interrompu avant d'avoir terminé.
    Stopped,
}

impl From<AgentState> for AgentStateItem {
    fn from(state: AgentState) -> Self {
        match state {
            AgentState::Running => Self::Running,
            AgentState::Done => Self::Done,
            AgentState::Failed => Self::Failed,
            AgentState::Stopped => Self::Stopped,
        }
    }
}

/// Ce que Claude Code annonce pendant un tour, envoyé à la page au fil de l'eau. `agent` est
/// l'action qui a lancé le sous-agent auteur ; rien pour Claude lui-même.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum ClaudeEventItem {
    /// Un message de Claude, en Markdown.
    Message {
        /// Le sous-agent qui l'écrit, par l'action qui l'a lancé.
        agent: Option<String>,
        /// Son texte.
        text: String,
    },
    /// Une action lancée.
    ActionStarted {
        /// Le sous-agent qui la lance, par l'action qui l'a lancé.
        agent: Option<String>,
        /// Son identifiant.
        id: String,
        /// Ce qu'elle fait.
        action: ActionKindItem,
        /// Le nom de l'outil, seulement s'il est inconnu de l'application.
        tool: Option<String>,
        /// Ce qu'elle vise, tel que Claude l'a écrit.
        target: Option<String>,
    },
    /// L'issue d'une action.
    ActionFinished {
        /// L'action.
        id: String,
        /// Vrai si l'outil a fait ce qui était demandé.
        succeeded: bool,
    },
    /// Une action refusée par les autorisations de Claude.
    ActionRefused {
        /// L'action.
        id: String,
    },
    /// Une création ou une modification retenue par le garde-fou du web : Claude a lu le web
    /// pendant le tour ; l'utilisateur peut l'autoriser.
    ChangeHeldBack {
        /// L'action.
        id: String,
    },
    /// Un sous-agent a fini son travail.
    SubAgentFinished {
        /// L'action qui l'a lancé.
        id: String,
        /// Son état à la fin.
        state: AgentStateItem,
        /// Le temps qu'il a travaillé, en millisecondes.
        #[serde(rename = "durationMs")]
        #[ts(type = "number")]
        duration_ms: u64,
        /// Les jetons qu'il a consommés.
        #[ts(type = "number")]
        tokens: u64,
        /// Son nombre d'actions.
        actions: u32,
    },
    /// Une note que Claude vient de créer ou de modifier.
    ChangedNote {
        /// Son chemin depuis l'espace de travail : `dossier/nom.md`.
        path: String,
    },
    /// Le modèle qui répond, tel que Claude Code le nomme (`claude-opus-5-5`).
    ModelUsed {
        /// Son nom complet.
        model: String,
    },
    /// La limite d'utilisation de l'abonnement Claude.
    UsageLimits {
        /// Vrai si Claude Code ne répond plus avant une remise à zéro.
        reached: bool,
        /// Les périodes annoncées.
        windows: Vec<UsageWindowItem>,
    },
    /// Le remplissage du contexte de la conversation à la fin de la réponse.
    ContextFilled {
        /// Les jetons occupés.
        #[ts(type = "number")]
        used: u64,
        /// La taille maximale du contexte de ce modèle, en jetons.
        #[ts(type = "number")]
        size: u64,
    },
    /// Le bilan de la réponse.
    Summary {
        /// Pourquoi Claude n'a pas pu répondre ; rien s'il a répondu.
        failure: Option<String>,
        /// Sa durée, en millisecondes.
        #[serde(rename = "durationMs")]
        #[ts(type = "number")]
        duration_ms: u64,
        /// Les jetons consommés.
        #[ts(type = "number")]
        tokens: u64,
    },
}

fn millis(duration: std::time::Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

impl ClaudeEventItem {
    /// Une action lancée : ce qu'elle fait, et le nom de l'outil s'il est inconnu.
    fn action_started(agent: Option<ActionId>, action: ClaudeAction) -> Self {
        let (kind, tool) = match action.kind {
            ActionKind::Read => (ActionKindItem::Read, None),
            ActionKind::Search => (ActionKindItem::Search, None),
            ActionKind::Write => (ActionKindItem::Write, None),
            ActionKind::Edit => (ActionKindItem::Edit, None),
            ActionKind::SubAgent => (ActionKindItem::SubAgent, None),
            ActionKind::WebSearch => (ActionKindItem::WebSearch, None),
            ActionKind::WebPage => (ActionKindItem::WebPage, None),
            ActionKind::Other(name) => (ActionKindItem::Other, Some(name)),
        };
        Self::ActionStarted {
            agent: agent.map(|id| id.as_str().to_owned()),
            id: action.id.as_str().to_owned(),
            action: kind,
            tool,
            target: action.target,
        }
    }

    /// L'événement tel que la page le reçoit ; rien pour le début de la conversation, que la
    /// session garde pour elle.
    #[must_use]
    pub fn from_event(event: ClaudeEvent) -> Option<Self> {
        let item = match event {
            ClaudeEvent::ConversationStarted(_) => return None,
            ClaudeEvent::Message { agent, text } => Self::Message {
                agent: agent.map(|id| id.as_str().to_owned()),
                text,
            },
            ClaudeEvent::ActionStarted { agent, action } => Self::action_started(agent, action),
            ClaudeEvent::ActionFinished { id, outcome } => Self::ActionFinished {
                id: id.as_str().to_owned(),
                succeeded: outcome == ActionOutcome::Succeeded,
            },
            ClaudeEvent::ActionRefused { id } => Self::ActionRefused {
                id: id.as_str().to_owned(),
            },
            ClaudeEvent::ChangeHeldBack { id } => Self::ChangeHeldBack {
                id: id.as_str().to_owned(),
            },
            ClaudeEvent::SubAgentFinished {
                id,
                state,
                duration,
                tokens,
                actions,
            } => Self::SubAgentFinished {
                id: id.as_str().to_owned(),
                state: state.into(),
                duration_ms: millis(duration),
                tokens,
                actions,
            },
            ClaudeEvent::ModelUsed(model) => Self::ModelUsed { model },
            ClaudeEvent::UsageLimits(limits) => Self::UsageLimits {
                reached: limits.reached,
                windows: limits.windows.into_iter().map(Into::into).collect(),
            },
            ClaudeEvent::ContextFilled(fill) => Self::ContextFilled {
                used: fill.used,
                size: fill.size,
            },
            ClaudeEvent::Summary(summary) => Self::Summary {
                failure: match summary.outcome {
                    TurnOutcome::Succeeded => None,
                    TurnOutcome::Failed(reason) => Some(reason),
                },
                duration_ms: millis(summary.duration),
                tokens: summary.tokens,
            },
        };
        Some(item)
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use domain::claude::{
        ContextFill, ConversationId, LimitPeriod, TurnSummary, UsageLimits, UsageWindow,
    };

    use super::*;

    fn id(text: &str) -> ActionId {
        ActionId::new(text).unwrap()
    }

    fn item(event: ClaudeEvent) -> ClaudeEventItem {
        ClaudeEventItem::from_event(event).unwrap()
    }

    fn started(kind: ActionKind) -> (ActionKindItem, Option<String>) {
        match item(ClaudeEvent::ActionStarted {
            agent: None,
            action: ClaudeAction {
                id: id("a"),
                kind,
                target: None,
            },
        }) {
            ClaudeEventItem::ActionStarted { action, tool, .. } => (action, tool),
            other => panic!("pas une action lancée : {other:?}"),
        }
    }

    fn finished_sub_agent(state: AgentState) -> ClaudeEventItem {
        item(ClaudeEvent::SubAgentFinished {
            id: id("agent"),
            state,
            duration: Duration::from_millis(2500),
            tokens: 812,
            actions: 3,
        })
    }

    #[test]
    fn the_start_of_the_conversation_stays_in_rust() {
        let started = ClaudeEvent::ConversationStarted(ConversationId::new("c1").unwrap());
        assert_eq!(ClaudeEventItem::from_event(started), None);
    }

    #[test]
    fn a_message_keeps_its_text_and_its_sub_agent() {
        let message = item(ClaudeEvent::Message {
            agent: Some(id("agent")),
            text: "**Fait**".to_owned(),
        });
        assert_eq!(
            serde_json::to_value(message).unwrap(),
            serde_json::json!({ "kind": "message", "agent": "agent", "text": "**Fait**" })
        );
    }

    #[test]
    fn a_started_action_keeps_its_id_its_target_and_its_author() {
        let action = item(ClaudeEvent::ActionStarted {
            agent: Some(id("agent")),
            action: ClaudeAction {
                id: id("toolu_1"),
                kind: ActionKind::Edit,
                target: Some("/Notes/plan.md".to_owned()),
            },
        });
        assert_eq!(
            serde_json::to_value(action).unwrap(),
            serde_json::json!({
                "kind": "actionStarted", "agent": "agent", "id": "toolu_1",
                "action": "edit", "tool": null, "target": "/Notes/plan.md",
            })
        );
    }

    #[test]
    fn each_kind_of_action_is_named_for_the_page() {
        assert_eq!(started(ActionKind::Read), (ActionKindItem::Read, None));
        assert_eq!(started(ActionKind::Search), (ActionKindItem::Search, None));
        assert_eq!(started(ActionKind::Write), (ActionKindItem::Write, None));
        assert_eq!(started(ActionKind::Edit), (ActionKindItem::Edit, None));
        assert_eq!(
            started(ActionKind::SubAgent),
            (ActionKindItem::SubAgent, None)
        );
        assert_eq!(
            started(ActionKind::WebSearch),
            (ActionKindItem::WebSearch, None)
        );
        assert_eq!(
            started(ActionKind::WebPage),
            (ActionKindItem::WebPage, None)
        );
        assert_eq!(
            started(ActionKind::Other("NotebookEdit".to_owned())),
            (ActionKindItem::Other, Some("NotebookEdit".to_owned()))
        );
    }

    #[test]
    fn the_outcome_of_an_action_says_if_it_succeeded() {
        let outcome = |outcome| {
            item(ClaudeEvent::ActionFinished {
                id: id("a"),
                outcome,
            })
        };
        assert_eq!(
            outcome(ActionOutcome::Succeeded),
            ClaudeEventItem::ActionFinished {
                id: "a".to_owned(),
                succeeded: true
            }
        );
        assert_eq!(
            outcome(ActionOutcome::Failed),
            ClaudeEventItem::ActionFinished {
                id: "a".to_owned(),
                succeeded: false
            }
        );
    }

    #[test]
    fn a_refused_action_is_named_by_its_id() {
        assert_eq!(
            item(ClaudeEvent::ActionRefused { id: id("a") }),
            ClaudeEventItem::ActionRefused { id: "a".to_owned() }
        );
    }

    #[test]
    fn a_change_held_back_is_named_by_its_id() {
        assert_eq!(
            serde_json::to_value(item(ClaudeEvent::ChangeHeldBack { id: id("a") })).unwrap(),
            serde_json::json!({ "kind": "changeHeldBack", "id": "a" })
        );
    }

    #[test]
    fn a_finished_sub_agent_gives_its_work_in_milliseconds() {
        assert_eq!(
            serde_json::to_value(finished_sub_agent(AgentState::Done)).unwrap(),
            serde_json::json!({
                "kind": "subAgentFinished", "id": "agent", "state": "done",
                "durationMs": 2500, "tokens": 812, "actions": 3,
            })
        );
    }

    #[test]
    fn each_state_of_a_sub_agent_is_named_for_the_page() {
        let state = |state| match finished_sub_agent(state) {
            ClaudeEventItem::SubAgentFinished { state, .. } => state,
            other => panic!("pas un sous-agent terminé : {other:?}"),
        };
        assert_eq!(state(AgentState::Running), AgentStateItem::Running);
        assert_eq!(state(AgentState::Done), AgentStateItem::Done);
        assert_eq!(state(AgentState::Failed), AgentStateItem::Failed);
        assert_eq!(state(AgentState::Stopped), AgentStateItem::Stopped);
    }

    #[test]
    fn a_summary_gives_the_reason_of_a_failure() {
        let summary = item(ClaudeEvent::Summary(TurnSummary {
            outcome: TurnOutcome::Failed("conversation inconnue".to_owned()),
            duration: Duration::from_millis(40),
            tokens: 0,
        }));
        assert_eq!(
            serde_json::to_value(summary).unwrap(),
            serde_json::json!({
                "kind": "summary", "failure": "conversation inconnue",
                "durationMs": 40, "tokens": 0,
            })
        );
    }

    #[test]
    fn the_model_the_limits_and_the_context_fill_reach_the_page() {
        assert_eq!(
            serde_json::to_value(item(ClaudeEvent::ModelUsed("claude-opus-5-5".to_owned())))
                .unwrap(),
            serde_json::json!({ "kind": "modelUsed", "model": "claude-opus-5-5" })
        );
        let limits = item(ClaudeEvent::UsageLimits(UsageLimits {
            reached: true,
            windows: vec![UsageWindow {
                period: LimitPeriod::Week,
                percent: 100,
                resets_at: 9,
            }],
        }));
        assert_eq!(
            serde_json::to_value(limits).unwrap(),
            serde_json::json!({
                "kind": "usageLimits", "reached": true,
                "windows": [{ "period": "week", "percent": 100, "resetsAt": 9 }],
            })
        );
        let fill = item(ClaudeEvent::ContextFilled(ContextFill {
            used: 420,
            size: 1000,
        }));
        assert_eq!(
            serde_json::to_value(fill).unwrap(),
            serde_json::json!({ "kind": "contextFilled", "used": 420, "size": 1000 })
        );
    }

    #[test]
    fn an_endless_duration_is_capped() {
        let summary = item(ClaudeEvent::Summary(TurnSummary {
            outcome: TurnOutcome::Succeeded,
            duration: Duration::MAX,
            tokens: 1,
        }));
        assert_eq!(
            summary,
            ClaudeEventItem::Summary {
                failure: None,
                duration_ms: u64::MAX,
                tokens: 1
            }
        );
    }
}
