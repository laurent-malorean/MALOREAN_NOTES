//! La colonne Claude Code vue depuis l'interface : si Claude Code peut répondre, un tour joué dans
//! l'espace de travail ouvert, dans la conversation que l'interface désigne (fiche 0032).

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use application::{ClaudeCode, ClaudeError, ClaudeStatus, WorkspaceLocation};
use domain::NotePath;
use domain::claude::{
    ActionId, ActionKind, ActionOutcome, ClaudeEvent, ConversationId, TurnSettings,
};

use super::Session;
use crate::{ApiError, ClaudeEventItem, ClaudeStatusItem};

impl Session {
    /// La même session, dont la colonne Claude Code passe par `claude`. Sans lui, Claude Code se
    /// dit introuvable.
    #[must_use]
    pub fn with_claude(mut self, claude: Arc<dyn ClaudeCode>) -> Self {
        self.claude = Some(claude);
        self
    }

    /// Si Claude Code peut répondre, sinon pourquoi et quoi faire, prêt à afficher. Le modèle
    /// n'est pas appelé.
    #[must_use]
    pub fn claude_status(&self) -> ClaudeStatusItem {
        match self
            .claude
            .as_ref()
            .map_or(ClaudeStatus::Missing, |claude| claude.status())
        {
            ClaudeStatus::Ready(account) => ClaudeStatusItem::Ready {
                email: account.email,
                organization: account.organization,
            },
            reason => ClaudeStatusItem::Unavailable {
                reason: reason.to_string(),
            },
        }
    }

    /// Joue un tour : envoie `message` à Claude dans l'espace de travail ouvert, en continuant
    /// `conversation` (celle de l'onglet de conversation ; rien en commence une neuve) avec le
    /// modèle et le niveau d'effort de `settings`, et donne à `on_event` chaque événement prêt pour
    /// l'interface dès qu'il arrive, dont le début de la conversation, avec chaque note modifiée
    /// par Claude. Rend la main à la fin du tour.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a empêché le tour : aucun espace de travail
    /// ouvert, Claude Code introuvable, déjà occupé, arrêté ou parti sans bilan.
    pub fn send_to_claude(
        &self,
        message: &str,
        conversation: Option<&ConversationId>,
        settings: TurnSettings,
        mut on_event: impl FnMut(ClaudeEventItem),
    ) -> Result<(), ApiError> {
        let location = self.opened()?.location;
        let claude = self.claude.as_ref().ok_or(ClaudeError::Missing)?;
        let mut notes = ChangedNotes::new(&location);
        claude.send(&location, conversation, settings, message, &mut |event| {
            let changed = notes.follow(&event);
            on_event(ClaudeEventItem::from_event(event));
            if let Some(path) = changed {
                on_event(ClaudeEventItem::ChangedNote { path });
            }
        })?;
        Ok(())
    }

    /// Déconnecte Claude Code de son compte Claude, pour tout le Mac.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a empêché la déconnexion : Claude Code
    /// introuvable, occupé, ou qui n'a pas pu.
    pub fn log_out_of_claude(&self) -> Result<(), ApiError> {
        let claude = self.claude.as_ref().ok_or(ClaudeError::Missing)?;
        claude.log_out()?;
        Ok(())
    }

    /// Connecte Claude Code à un compte Claude, pour tout le Mac : le navigateur s'ouvre sur la
    /// page de connexion, dont `on_address` reçoit l'adresse. Rend la main une fois la connexion
    /// terminée. [`Self::stop_claude`] l'annule.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a empêché la connexion : Claude Code
    /// introuvable, occupé, connexion annulée ou qui n'a pas abouti.
    pub fn log_in_to_claude(&self, mut on_address: impl FnMut(String)) -> Result<(), ApiError> {
        let claude = self.claude.as_ref().ok_or(ClaudeError::Missing)?;
        claude.log_in(&mut |address| on_address(address.to_owned()))?;
        Ok(())
    }

    /// Arrête le tour en cours, s'il y en a un (ce que Claude a déjà écrit reste écrit), ou
    /// annule la connexion en cours.
    pub fn stop_claude(&self) {
        if let Some(claude) = &self.claude {
            claude.stop();
        }
    }
}

/// Suit les créations et modifications de fichiers d'un tour, pour annoncer chaque note de
/// l'espace de travail que Claude a réussi à écrire.
struct ChangedNotes<'a> {
    workspace: &'a Path,
    /// Les écritures lancées sur une note, en attente de leur issue.
    writing: HashMap<ActionId, NotePath>,
}

impl<'a> ChangedNotes<'a> {
    fn new(workspace: &'a WorkspaceLocation) -> Self {
        Self {
            workspace: Path::new(workspace.as_str()),
            writing: HashMap::new(),
        }
    }

    /// Le chemin depuis l'espace de travail de la note que l'événement dit écrite, s'il y en a une.
    fn follow(&mut self, event: &ClaudeEvent) -> Option<String> {
        match event {
            ClaudeEvent::ActionStarted { action, .. }
                if matches!(action.kind, ActionKind::Write | ActionKind::Edit) =>
            {
                if let Some(note) = action.target.as_deref().and_then(|t| self.note_at(t)) {
                    self.writing.insert(action.id.clone(), note);
                }
                None
            }
            ClaudeEvent::ActionFinished { id, outcome } => self
                .writing
                .remove(id)
                .filter(|_| *outcome == ActionOutcome::Succeeded)
                .map(|note| note.to_path()),
            _ => None,
        }
    }

    /// La note que désigne le fichier `target` (absolu, ou relatif à l'espace de travail), s'il
    /// est une note de l'espace de travail.
    fn note_at(&self, target: &str) -> Option<NotePath> {
        let file = self.workspace.join(target);
        let relative = file.strip_prefix(self.workspace).ok()?.to_str()?;
        NotePath::parse(relative).ok()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;
    use std::thread;
    use std::time::Duration;

    use application::testing::{
        FakeClaudeCode, FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore,
    };
    use domain::claude::{
        ChangesAfterWeb, ClaudeAction, ClaudeModel, Effort, TurnOutcome, TurnSummary,
    };

    use super::*;
    use crate::ActionKindItem;

    const NOTES: &str = "/Users/moi/Notes";

    fn id(text: &str) -> ActionId {
        ActionId::new(text).unwrap()
    }

    fn started(conversation: &str) -> ClaudeEvent {
        ClaudeEvent::ConversationStarted(ConversationId::new(conversation).unwrap())
    }

    fn action(action: &str, kind: ActionKind, target: &str) -> ClaudeEvent {
        ClaudeEvent::ActionStarted {
            agent: None,
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

    fn summary() -> ClaudeEvent {
        ClaudeEvent::Summary(TurnSummary {
            outcome: TurnOutcome::Succeeded,
            duration: Duration::from_millis(1200),
            tokens: 34,
        })
    }

    fn session(claude: Option<Arc<FakeClaudeCode>>) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
        let session = Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        match claude {
            Some(claude) => session.with_claude(claude),
            None => session,
        }
    }

    fn opened(claude: &Arc<FakeClaudeCode>) -> Session {
        let session = session(Some(Arc::clone(claude)));
        session.add_workspace("Notes", NOTES).unwrap();
        session
    }

    fn turn(session: &Session, message: &str) -> (Result<(), ApiError>, Vec<ClaudeEventItem>) {
        let mut items = Vec::new();
        let end = session.send_to_claude(message, None, TurnSettings::default(), |item| {
            items.push(item);
        });
        (end, items)
    }

    /// Les notes que l'interface apprend modifiées pendant un tour qui annonce `events`.
    fn changed_notes(events: Vec<ClaudeEvent>) -> Vec<String> {
        let claude = Arc::new(FakeClaudeCode::replaying(events));
        let (_, items) = turn(&opened(&claude), "Range mes notes");
        items
            .into_iter()
            .filter_map(|item| match item {
                ClaudeEventItem::ChangedNote { path } => Some(path),
                _ => None,
            })
            .collect()
    }

    fn conversations(claude: &FakeClaudeCode) -> Vec<Option<String>> {
        claude
            .requests()
            .into_iter()
            .map(|(_, conversation, _, _)| conversation.map(|id| id.as_str().to_owned()))
            .collect()
    }

    #[test]
    fn a_turn_is_played_in_the_open_workspace_and_relayed_to_the_interface() {
        let claude = Arc::new(FakeClaudeCode::replaying(vec![started("c1"), summary()]));
        let (end, items) = turn(&opened(&claude), "Bonjour");
        assert_eq!(end, Ok(()));
        assert_eq!(
            items,
            vec![
                ClaudeEventItem::ConversationStarted {
                    conversation: "c1".to_owned()
                },
                ClaudeEventItem::Summary {
                    failure: None,
                    duration_ms: 1200,
                    tokens: 34,
                }
            ]
        );
        let (workspace, conversation, _, message) = claude.requests().remove(0);
        assert_eq!(workspace.as_str(), NOTES);
        assert_eq!(conversation, None);
        assert_eq!(message, "Bonjour");
    }

    #[test]
    fn nothing_is_sent_before_a_workspace_is_open() {
        let claude = Arc::new(FakeClaudeCode::replaying(vec![summary()]));
        let (end, items) = turn(&session(Some(Arc::clone(&claude))), "Bonjour");
        assert_eq!(
            end.unwrap_err().message,
            "aucun espace de travail n'est ouvert"
        );
        assert!(items.is_empty());
        assert!(claude.requests().is_empty());
    }

    #[test]
    fn without_claude_code_the_turn_says_it_is_missing() {
        let session = session(None);
        session.add_workspace("Notes", NOTES).unwrap();
        let (end, _) = turn(&session, "Bonjour");
        assert_eq!(end.unwrap_err().message, ClaudeError::Missing.to_string());
    }

    #[test]
    fn the_conversation_named_by_the_interface_is_continued() {
        let claude = Arc::new(FakeClaudeCode::replaying(vec![started("c1"), summary()]));
        let session = opened(&claude);
        let c7 = ConversationId::new("c7").unwrap();
        let settings = TurnSettings::default();
        session
            .send_to_claude("Un", Some(&c7), settings, |_| {})
            .unwrap();
        turn(&session, "Deux").0.unwrap();
        assert_eq!(conversations(&claude), [Some("c7".to_owned()), None]);
    }

    #[test]
    fn the_settings_of_each_turn_reach_claude_code_even_to_continue_the_conversation() {
        let claude = Arc::new(FakeClaudeCode::replaying(vec![started("c1"), summary()]));
        let session = opened(&claude);
        let opus = TurnSettings {
            model: Some(ClaudeModel::Opus),
            effort: Some(Effort::Low),
            changes_after_web: ChangesAfterWeb::Allowed,
        };
        let c1 = ConversationId::new("c1").unwrap();
        turn(&session, "Un").0.unwrap();
        session
            .send_to_claude("Deux", Some(&c1), opus, |_| {})
            .unwrap();
        let requests = claude.requests();
        assert_eq!(requests[0].2, TurnSettings::default());
        assert_eq!(
            (
                requests[1].1.as_ref().map(ConversationId::as_str),
                requests[1].2
            ),
            (Some("c1"), opus)
        );
    }

    #[test]
    fn a_running_turn_stops_on_request() {
        let claude = Arc::new(FakeClaudeCode::hanging(vec![started("c1")]));
        let session = opened(&claude);
        let (sender, received) = mpsc::channel();
        thread::scope(|scope| {
            let running = scope.spawn(|| {
                session.send_to_claude("Bonjour", None, TurnSettings::default(), |item| {
                    sender.send(item).unwrap();
                })
            });
            let (busy, _) = loop {
                if !claude.requests().is_empty() {
                    break turn(&session, "Encore");
                }
                thread::yield_now();
            };
            session.stop_claude();
            assert_eq!(busy.unwrap_err().message, ClaudeError::Busy.to_string());
            assert_eq!(
                running.join().unwrap().unwrap_err().message,
                ClaudeError::Stopped.to_string()
            );
        });
        drop(sender);
        let conversation = "c1".to_owned();
        assert_eq!(
            received.try_iter().collect::<Vec<_>>(),
            [ClaudeEventItem::ConversationStarted { conversation }]
        );
    }

    #[test]
    fn stopping_without_claude_code_changes_nothing() {
        session(None).stop_claude();
    }

    #[test]
    fn each_note_written_or_edited_in_the_workspace_is_announced() {
        let notes = changed_notes(vec![
            action("w", ActionKind::Write, "/Users/moi/Notes/Projets/plan.md"),
            finished("w", ActionOutcome::Succeeded),
            action("e", ActionKind::Edit, "courses.md"),
            finished("e", ActionOutcome::Succeeded),
        ]);
        assert_eq!(notes, ["Projets/plan.md", "courses.md"]);
    }

    #[test]
    fn a_failed_or_refused_write_changes_no_note() {
        let notes = changed_notes(vec![
            action("w", ActionKind::Write, "/Users/moi/Notes/plan.md"),
            ClaudeEvent::ActionRefused { id: id("w") },
            finished("w", ActionOutcome::Failed),
            finished("w", ActionOutcome::Succeeded),
        ]);
        assert!(notes.is_empty());
    }

    #[test]
    fn reading_or_writing_outside_the_notes_changes_no_note() {
        let notes = changed_notes(vec![
            action("r", ActionKind::Read, "/Users/moi/Notes/plan.md"),
            finished("r", ActionOutcome::Succeeded),
            action("o", ActionKind::Write, "/Users/moi/Ailleurs/plan.md"),
            finished("o", ActionOutcome::Succeeded),
            action("t", ActionKind::Write, "/Users/moi/Notes/liste.txt"),
            finished("t", ActionOutcome::Succeeded),
            action(
                "u",
                ActionKind::Edit,
                "/Users/moi/Notes/../Ailleurs/plan.md",
            ),
            finished("u", ActionOutcome::Succeeded),
            finished("inconnue", ActionOutcome::Succeeded),
        ]);
        assert!(notes.is_empty());
    }

    #[test]
    fn the_changed_note_follows_the_end_of_its_action() {
        let claude = Arc::new(FakeClaudeCode::replaying(vec![
            action("w", ActionKind::Write, "/Users/moi/Notes/plan.md"),
            finished("w", ActionOutcome::Succeeded),
        ]));
        let (_, items) = turn(&opened(&claude), "Écris un plan");
        assert_eq!(
            items,
            vec![
                ClaudeEventItem::ActionStarted {
                    agent: None,
                    id: "w".to_owned(),
                    action: ActionKindItem::Write,
                    tool: None,
                    target: Some("/Users/moi/Notes/plan.md".to_owned()),
                },
                ClaudeEventItem::ActionFinished {
                    id: "w".to_owned(),
                    succeeded: true,
                },
                ClaudeEventItem::ChangedNote {
                    path: "plan.md".to_owned(),
                },
            ]
        );
    }
}
