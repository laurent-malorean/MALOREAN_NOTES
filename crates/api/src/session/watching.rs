//! Les changements faits hors de l'application dans la bibliothèque ouverte.

use std::sync::{Arc, PoisonError};

use application::{AppError, LibraryWatcher};
use domain::NotePath;

use super::Session;
use crate::{ApiError, LibraryChanged};

impl Session {
    /// La même session, qui peut surveiller la bibliothèque qu'elle ouvre.
    #[must_use]
    pub fn with_watcher(mut self, watcher: Arc<dyn LibraryWatcher>) -> Self {
        self.watcher = Some(watcher);
        self
    }

    /// Surveille la bibliothèque ouverte, à la place de la précédente : `announce` reçoit
    /// chaque changement fait hors de l'application, prêt à envoyer à la page.
    /// Rien n'est surveillé si la session n'a pas de surveillance.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; aucune bibliothèque ouverte,
    /// dossier impossible à surveiller.
    pub fn watch_library(
        &self,
        announce: impl Fn(LibraryChanged) + Send + Sync + 'static,
    ) -> Result<(), ApiError> {
        let Some(watcher) = &self.watcher else {
            return Ok(());
        };
        let location = self.opened()?.location;
        let watching = watcher
            .watch(
                &location,
                Arc::new(move |change| {
                    announce(LibraryChanged {
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
    use application::{LibraryChange, LibraryLocation};
    use domain::NotePath;

    use super::*;

    fn session(watcher: &Arc<FakeWatcher>) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
        Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        )
        .with_watcher(Arc::clone(watcher) as Arc<dyn LibraryWatcher>)
    }

    fn location(path: &str) -> LibraryLocation {
        LibraryLocation::new(path).unwrap()
    }

    #[test]
    fn changes_made_outside_the_app_are_announced_with_note_paths() {
        let watcher = Arc::new(FakeWatcher::default());
        let session = session(&watcher);
        session.open_library(location("/Users/moi/Notes")).unwrap();
        let announced = Arc::new(Mutex::new(Vec::new()));
        let kept = Arc::clone(&announced);
        session
            .watch_library(move |change| kept.lock().unwrap().push(change))
            .unwrap();
        watcher.announce(LibraryChange {
            notes: vec![NotePath::parse("Travail/lundi.md").unwrap()],
        });
        assert_eq!(
            *announced.lock().unwrap(),
            [LibraryChanged {
                notes: vec!["Travail/lundi.md".into()]
            }]
        );
    }

    #[test]
    fn the_open_library_is_the_one_watched() {
        let watcher = Arc::new(FakeWatcher::default());
        let session = session(&watcher);
        session.open_library(location("/Users/moi/Notes")).unwrap();
        session.open_library(location("/Users/moi/Autres")).unwrap();
        session.watch_library(|_| {}).unwrap();
        assert_eq!(watcher.watched(), Some(location("/Users/moi/Autres")));
    }

    #[test]
    fn nothing_can_be_watched_before_a_library_is_open() {
        let watcher = Arc::new(FakeWatcher::default());
        let error = session(&watcher).watch_library(|_| {}).unwrap_err();
        assert_eq!(error.message, "aucune bibliothèque n'est ouverte");
    }

    #[test]
    fn a_session_without_watcher_watches_nothing() {
        let session = Session::new(
            Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::default()))),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        assert!(session.watch_library(|_| {}).is_ok());
    }
}
