//! Faux Claude Code, en mémoire (voir `claude_contract`).

use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};

use domain::claude::{ClaudeEvent, ConversationId, TurnSettings};

use crate::{ClaudeAccount, ClaudeCode, ClaudeError, ClaudeStatus, WorkspaceLocation};

/// Un tour demandé : l'espace de travail, la conversation continuée, les réglages, le message.
pub type ClaudeRequest = (
    WorkspaceLocation,
    Option<ConversationId>,
    TurnSettings,
    String,
);

#[derive(Debug, Default)]
struct Turn {
    running: bool,
    stopped: bool,
}

/// Claude Code qui annonce toujours les mêmes événements à chaque tour, puis se termine, ou
/// attend d'être arrêté. Il est prêt, sauf s'il reçoit une autre vérification de la connexion. Il
/// garde chaque tour demandé. Se déconnecter le laisse déconnecté ; se connecter donne
/// [`FakeClaudeCode::SIGN_IN_ADDRESS`], puis le connecte au compte prévu, ou attend d'être arrêté.
#[derive(Debug, Default)]
pub struct FakeClaudeCode {
    status: Mutex<Option<ClaudeStatus>>,
    events: Vec<ClaudeEvent>,
    hangs: bool,
    signed_in_as: ClaudeAccount,
    login_waits: bool,
    auth_fails: bool,
    turn: Mutex<Turn>,
    stopped: Condvar,
    requests: Mutex<Vec<ClaudeRequest>>,
}

impl FakeClaudeCode {
    /// L'adresse de connexion que donne le faux Claude Code.
    pub const SIGN_IN_ADDRESS: &str = "https://claude.ai/oauth/authorize?faux=1";

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

    /// Le même Claude Code, dont la vérification de la connexion donne `status`.
    #[must_use]
    pub fn with_status(self, status: ClaudeStatus) -> Self {
        *self.status.lock().unwrap_or_else(PoisonError::into_inner) = Some(status);
        self
    }

    /// Le même Claude Code, que se connecter connecte à `account`.
    #[must_use]
    pub fn signing_in_as(mut self, account: ClaudeAccount) -> Self {
        self.signed_in_as = account;
        self
    }

    /// Le même Claude Code, dont la connexion attend le navigateur jusqu'à être annulée.
    #[must_use]
    pub const fn waiting_for_the_browser(mut self) -> Self {
        self.login_waits = true;
        self
    }

    /// Le même Claude Code, qui ne parvient ni à se connecter, ni à se déconnecter.
    #[must_use]
    pub const fn failing_to_sign_in(mut self) -> Self {
        self.auth_fails = true;
        self
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

    fn set_status(&self, status: ClaudeStatus) {
        *self.status.lock().unwrap_or_else(PoisonError::into_inner) = Some(status);
    }

    /// Commence un tour ou une connexion, seul : sinon, Claude Code est occupé.
    fn begin(&self) -> Result<(), ClaudeError> {
        let mut turn = self.turn();
        if turn.running {
            return Err(ClaudeError::Busy);
        }
        *turn = Turn {
            running: true,
            stopped: false,
        };
        Ok(())
    }

    /// Attend d'être arrêté si `waits`, puis termine le tour ou la connexion : arrêté ou non.
    fn end(&self, waits: bool) -> Result<(), ClaudeError> {
        let mut turn = self.turn();
        while waits && !turn.stopped {
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
}

impl ClaudeCode for FakeClaudeCode {
    fn status(&self) -> ClaudeStatus {
        self.status
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
            .unwrap_or_else(|| ClaudeStatus::Ready(ClaudeAccount::default()))
    }

    fn log_out(&self) -> Result<(), ClaudeError> {
        if self.turn().running {
            return Err(ClaudeError::Busy);
        }
        if self.auth_fails {
            return Err(ClaudeError::LogoutFailed);
        }
        self.set_status(ClaudeStatus::LoggedOut);
        Ok(())
    }

    fn log_in(&self, on_address: &mut dyn FnMut(&str)) -> Result<(), ClaudeError> {
        self.begin()?;
        on_address(Self::SIGN_IN_ADDRESS);
        self.end(self.login_waits)?;
        if self.auth_fails {
            return Err(ClaudeError::LoginFailed);
        }
        self.set_status(ClaudeStatus::Ready(self.signed_in_as.clone()));
        Ok(())
    }

    fn send(
        &self,
        workspace: &WorkspaceLocation,
        conversation: Option<&ConversationId>,
        settings: TurnSettings,
        message: &str,
        on_event: &mut dyn FnMut(ClaudeEvent),
    ) -> Result<(), ClaudeError> {
        self.begin()?;
        self.requests
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push((
                workspace.clone(),
                conversation.cloned(),
                settings,
                message.to_owned(),
            ));
        self.events.iter().cloned().for_each(&mut *on_event);
        self.end(self.hangs)
    }

    fn stop(&self) {
        let mut turn = self.turn();
        turn.stopped = turn.running;
        self.stopped.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use domain::claude::{ClaudeModel, ConversationId, Effort, TurnOutcome, TurnSummary};
    use std::time::Duration;

    use super::*;
    use crate::testing::claude_contract::{
        ClaudeAccounts, ClaudeCodes, claude_account_contract, claude_code_contract,
    };

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

    fn account() -> ClaudeAccount {
        ClaudeAccount {
            email: Some("moi@example.com".to_owned()),
            organization: Some("Moi".to_owned()),
        }
    }

    #[test]
    fn honours_the_claude_account_contract() {
        let signing_in = FakeClaudeCode::default().signing_in_as(account());
        let waiting = FakeClaudeCode::default().waiting_for_the_browser();
        claude_account_contract(&ClaudeAccounts {
            workspace: workspace(),
            signing_in: &signing_in,
            address: FakeClaudeCode::SIGN_IN_ADDRESS.to_owned(),
            account: account(),
            waiting: &waiting,
        });
    }

    #[test]
    fn a_claude_code_failing_to_sign_in_stays_as_it_was() {
        let claude = FakeClaudeCode::default()
            .with_status(ClaudeStatus::LoggedOut)
            .failing_to_sign_in();
        assert_eq!(claude.log_in(&mut |_| {}), Err(ClaudeError::LoginFailed));
        assert_eq!(claude.status(), ClaudeStatus::LoggedOut);
        let ready = FakeClaudeCode::default().failing_to_sign_in();
        assert_eq!(ready.log_out(), Err(ClaudeError::LogoutFailed));
        assert_eq!(
            ready.status(),
            ClaudeStatus::Ready(ClaudeAccount::default())
        );
    }

    #[test]
    fn the_account_never_shows_in_debug_output() {
        let shown = format!("{:?}", ClaudeStatus::Ready(account()));
        assert_eq!(shown, "Ready(ClaudeAccount { .. })");
    }

    #[test]
    fn a_claude_code_given_a_status_reports_it() {
        let claude = FakeClaudeCode::replaying(Vec::new()).with_status(ClaudeStatus::LoggedOut);
        assert_eq!(claude.status(), ClaudeStatus::LoggedOut);
    }

    #[test]
    fn each_requested_turn_is_kept() {
        let claude = FakeClaudeCode::replaying(Vec::new());
        let conversation = ConversationId::new("conversation-1").unwrap();
        let opus = TurnSettings {
            model: Some(ClaudeModel::Opus),
            effort: Some(Effort::High),
        };
        claude
            .send(
                &workspace(),
                None,
                TurnSettings::default(),
                "Un",
                &mut |_| {},
            )
            .unwrap();
        claude
            .send(&workspace(), Some(&conversation), opus, "Deux", &mut |_| {})
            .unwrap();
        assert_eq!(
            claude.requests(),
            vec![
                (workspace(), None, TurnSettings::default(), "Un".to_owned()),
                (workspace(), Some(conversation), opus, "Deux".to_owned()),
            ]
        );
    }
}
