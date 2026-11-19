//! Faux Claude Code, en mémoire (voir `claude_contract`).

use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};

use domain::claude::{ClaudeEvent, ConversationId};

use crate::{ClaudeCode, ClaudeError, WorkspaceLocation};

/// Un tour demandé : l'espace de travail, la conversation continuée, le message.
pub type ClaudeRequest = (WorkspaceLocation, Option<ConversationId>, String);

#[derive(Debug, Default)]
struct Turn {
    running: bool,
    stopped: bool,
}

/// Claude Code qui annonce toujours les mêmes événements à chaque tour, puis se termine, ou
/// attend d'être arrêté. Il garde chaque tour demandé.
#[derive(Debug, Default)]
pub struct FakeClaudeCode {
    events: Vec<ClaudeEvent>,
    hangs: bool,
    turn: Mutex<Turn>,
    stopped: Condvar,
    requests: Mutex<Vec<ClaudeRequest>>,
}

impl FakeClaudeCode {
    /// Un Claude Code dont chaque tour annonce `events`, puis se termine.
    #[must_use]
    pub fn replaying(events: Vec<ClaudeEvent>) -> Self {
        Self {
            events,
            ..Self::default()
        }
    }

    /// Un Claude Code dont chaque tour annonce `events`, puis attend d'être arrêté.
    #[must_use]
    pub fn hanging(events: Vec<ClaudeEvent>) -> Self {
        Self {
            events,
            hangs: true,
            ..Self::default()
        }
    }

    /// Les tours demandés, dans l'ordre.
    pub fn requests(&self) -> Vec<ClaudeRequest> {
        self.requests
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn turn(&self) -> MutexGuard<'_, Turn> {
        self.turn.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl ClaudeCode for FakeClaudeCode {
    fn send(
        &self,
        workspace: &WorkspaceLocation,
        conversation: Option<&ConversationId>,
        message: &str,
        on_event: &mut dyn FnMut(ClaudeEvent),
    ) -> Result<(), ClaudeError> {
        {
            let mut turn = self.turn();
            if turn.running {
                return Err(ClaudeError::Busy);
            }
            *turn = Turn {
                running: true,
                stopped: false,
            };
        }
        self.requests
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push((workspace.clone(), conversation.cloned(), message.to_owned()));
        self.events.iter().cloned().for_each(&mut *on_event);
        let mut turn = self.turn();
        while self.hangs && !turn.stopped {
            turn = self
                .stopped
                .wait(turn)
                .unwrap_or_else(PoisonError::into_inner);
        }
        turn.running = false;
        if turn.stopped {
            Err(ClaudeError::Stopped)
        } else {
            Ok(())
        }
    }

    fn stop(&self) {
        let mut turn = self.turn();
        turn.stopped = turn.running;
        self.stopped.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use domain::claude::{ConversationId, TurnOutcome, TurnSummary};
    use std::time::Duration;

    use super::*;
    use crate::testing::claude_contract::{ClaudeCodes, claude_code_contract};

    fn started() -> ClaudeEvent {
        ClaudeEvent::ConversationStarted(ConversationId::new("conversation-1").unwrap())
    }

    fn turn_events() -> Vec<ClaudeEvent> {
        vec![
            started(),
            ClaudeEvent::Message {
                agent: None,
                text: "Bonjour !".to_owned(),
            },
            ClaudeEvent::Summary(TurnSummary {
                outcome: TurnOutcome::Succeeded,
                duration: Duration::from_millis(900),
                tokens: 12,
            }),
        ]
    }

    fn workspace() -> WorkspaceLocation {
        WorkspaceLocation::new("/Notes").unwrap()
    }

    #[test]
    fn honours_the_claude_code_contract() {
        let replaying = FakeClaudeCode::replaying(turn_events());
        let hanging = FakeClaudeCode::hanging(vec![started()]);
        claude_code_contract(&ClaudeCodes {
            workspace: workspace(),
            replaying: &replaying,
            replayed: turn_events(),
            hanging: &hanging,
        });
    }

    #[test]
    fn each_requested_turn_is_kept() {
        let claude = FakeClaudeCode::replaying(Vec::new());
        let conversation = ConversationId::new("conversation-1").unwrap();
        claude.send(&workspace(), None, "Un", &mut |_| {}).unwrap();
        claude
            .send(&workspace(), Some(&conversation), "Deux", &mut |_| {})
            .unwrap();
        assert_eq!(
            claude.requests(),
            vec![
                (workspace(), None, "Un".to_owned()),
                (workspace(), Some(conversation), "Deux".to_owned()),
            ]
        );
    }
}
