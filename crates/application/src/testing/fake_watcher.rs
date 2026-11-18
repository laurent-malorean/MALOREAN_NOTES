//! Surveillance simulée de l'espace de travail.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use crate::{
    ChangeListener, StoreError, Watching, WorkspaceChange, WorkspaceLocation, WorkspaceWatcher,
};

/// Surveillance simulée : le test annonce lui-même les changements avec [`FakeWatcher::announce`].
#[derive(Default)]
pub struct FakeWatcher {
    listener: Mutex<Option<(WorkspaceLocation, ChangeListener)>>,
}

impl std::fmt::Debug for FakeWatcher {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FakeWatcher")
            .field("watched", &self.watched())
            .finish()
    }
}

/// La surveillance simulée en cours.
#[derive(Debug)]
struct FakeWatching;

impl Watching for FakeWatching {}

impl FakeWatcher {
    /// L'espace de travail surveillé en ce moment, s'il y en a une.
    #[must_use]
    pub fn watched(&self) -> Option<WorkspaceLocation> {
        self.lock().as_ref().map(|(location, _)| location.clone())
    }

    /// Annonce un changement fait hors de l'application ; rien si aucun espace de travail n'est surveillée.
    pub fn announce(&self, change: WorkspaceChange) {
        let listener = self
            .lock()
            .as_ref()
            .map(|(_, listener)| Arc::clone(listener));
        if let Some(listener) = listener {
            listener(change);
        }
    }

    fn lock(&self) -> MutexGuard<'_, Option<(WorkspaceLocation, ChangeListener)>> {
        self.listener.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl WorkspaceWatcher for FakeWatcher {
    fn watch(
        &self,
        location: &WorkspaceLocation,
        listener: ChangeListener,
    ) -> Result<Box<dyn Watching>, StoreError> {
        *self.lock() = Some((location.clone(), listener));
        Ok(Box::new(FakeWatching))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use domain::NotePath;

    use super::*;

    #[test]
    fn the_fake_watcher_announces_changes_of_the_watched_workspace_only() {
        let watcher = FakeWatcher::default();
        watcher.announce(WorkspaceChange::default());
        assert_eq!(watcher.watched(), None);
        let heard = Arc::new(Mutex::new(Vec::new()));
        let kept = Arc::clone(&heard);
        let location = WorkspaceLocation::new("/Users/moi/Notes").unwrap();
        let _watching = watcher
            .watch(
                &location,
                Arc::new(move |change| kept.lock().unwrap().push(change)),
            )
            .unwrap();
        let change = WorkspaceChange {
            notes: vec![NotePath::parse("a.md").unwrap()],
        };
        watcher.announce(change.clone());
        assert_eq!(watcher.watched(), Some(location));
        assert_eq!(*heard.lock().unwrap(), [change]);
        assert!(format!("{watcher:?}").contains("/Users/moi/Notes"));
    }
}
