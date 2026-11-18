//! Les changements faits hors de l'application dans l'espace de travail ouvert.

use std::sync::{Arc, PoisonError};

use application::{AppError, WorkspaceWatcher};
use domain::NotePath;

use super::Session;
use crate::{ApiError, WorkspaceChanged};

impl Session {
    /// La même session, qui peut surveiller l'espace de travail qu'elle ouvre.
    #[must_use]
    pub fn with_watcher(mut self, watcher: Arc<dyn WorkspaceWatcher>) -> Self {
        self.watcher = Some(watcher);
        self
    }

    /// Surveille l'espace de travail ouvert, à la place du précédent : `announce` reçoit
    /// chaque changement fait hors de l'application, prêt à envoyer à la page.
    /// Rien n'est surveillé si la session n'a pas de surveillance.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; aucun espace de travail ouvert,
    /// dossier impossible à surveiller.
    pub fn watch_workspace(
        &self,
        announce: impl Fn(WorkspaceChanged) + Send + Sync + 'static,
    ) -> Result<(), ApiError> {
        let Some(watcher) = &self.watcher else {
            return Ok(());
        };
        let location = self.opened()?.location;
        let watching = watcher
            .watch(
                &location,
                Arc::new(move |change| {
                    announce(WorkspaceChanged {
                        notes: change.notes.iter().map(NotePath::to_path).collect(),
                    });
                }),
            )
            .map_err(AppError::from)?;
        *self.watching.lock().unwrap_or_else(PoisonError::into_inner) = Some(watching);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use application::testing::{
        FakeOpener, FakePreferences, FakeWatcher, FixedClock, InMemoryNoteStore,
    };
    use application::{WorkspaceChange, WorkspaceLocation};
    use domain::NotePath;

    use super::*;

    fn session(watcher: &Arc<FakeWatcher>) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
        Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        )
        .with_watcher(Arc::clone(watcher) as Arc<dyn WorkspaceWatcher>)
    }

    fn location(path: &str) -> WorkspaceLocation {
        WorkspaceLocation::new(path).unwrap()
    }

    #[test]
    fn changes_made_outside_the_app_are_announced_with_note_paths() {
        let watcher = Arc::new(FakeWatcher::default());
        let session = session(&watcher);
        session
            .open_workspace(location("/Users/moi/Notes"))
            .unwrap();
        let announced = Arc::new(Mutex::new(Vec::new()));
        let kept = Arc::clone(&announced);
        session
            .watch_workspace(move |change| kept.lock().unwrap().push(change))
            .unwrap();
        watcher.announce(WorkspaceChange {
            notes: vec![NotePath::parse("Travail/lundi.md").unwrap()],
        });
        assert_eq!(
            *announced.lock().unwrap(),
            [WorkspaceChanged {
                notes: vec!["Travail/lundi.md".into()]
            }]
        );
    }

    #[test]
    fn the_open_workspace_is_the_one_watched() {
        let watcher = Arc::new(FakeWatcher::default());
        let session = session(&watcher);
        session
            .open_workspace(location("/Users/moi/Notes"))
            .unwrap();
        session
            .open_workspace(location("/Users/moi/Autres"))
            .unwrap();
        session.watch_workspace(|_| {}).unwrap();
        assert_eq!(watcher.watched(), Some(location("/Users/moi/Autres")));
    }

    #[test]
    fn nothing_can_be_watched_before_a_workspace_is_open() {
        let watcher = Arc::new(FakeWatcher::default());
        let error = session(&watcher).watch_workspace(|_| {}).unwrap_err();
        assert_eq!(error.message, "aucun espace de travail n'est ouvert");
    }

    #[test]
    fn a_session_without_watcher_watches_nothing() {
        let session = Session::new(
            Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::default()))),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        assert!(session.watch_workspace(|_| {}).is_ok());
    }
}
