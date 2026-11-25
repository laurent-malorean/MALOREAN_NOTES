//! Les gestes en attente de l'espace de travail ouvert (fiche 0058) : gardés pendant qu'un geste du
//! CRM change plusieurs fichiers, terminés à l'ouverture de l'espace de travail.

use std::sync::Arc;

use application::PendingGesturesOpener;

use super::Session;

impl Session {
    /// La même session, dont les gestes en attente de chaque espace de travail sont ouverts par
    /// `gestures`.
    #[must_use]
    pub fn with_pending_gestures(mut self, gestures: Arc<dyn PendingGesturesOpener>) -> Self {
        self.pending_gestures = gestures;
        self
    }
}

#[cfg(test)]
mod tests {
    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};
    use application::{
        Gesture, GestureStep, MemoryPendingGestures, NoteStore, PendingGestures, StoreError,
        WorkspaceLocation,
    };
    use domain::NotePath;

    use super::*;

    /// Des gestes en attente déjà gardés, que l'espace de travail ouvert trouve.
    #[derive(Debug)]
    struct Kept(Arc<MemoryPendingGestures>);

    impl PendingGesturesOpener for Kept {
        fn open(
            &self,
            _location: &WorkspaceLocation,
        ) -> Result<Arc<dyn PendingGestures>, StoreError> {
            Ok(self.0.clone())
        }
    }

    #[test]
    fn a_gesture_interrupted_before_the_last_launch_is_finished_when_the_workspace_opens() {
        let store = Arc::new(InMemoryNoteStore::with_notes(&[
            ("a.md", "A"),
            ("b.md", "B"),
        ]));
        let kept = Arc::new(MemoryPendingGestures::default());
        let note = |name: &str| NotePath::parse(name).unwrap();
        kept.begin(&Gesture::new(vec![
            GestureStep::Rewrite {
                note: note("a.md"),
                content: "A2".to_owned(),
            },
            GestureStep::Trash { note: note("b.md") },
        ]))
        .unwrap();
        let session = Session::new(
            Arc::new(FakeOpener::new(store.clone())),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        )
        .with_pending_gestures(Arc::new(Kept(kept.clone())));
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        assert_eq!(store.read(&note("a.md")).unwrap().content, "A2");
        assert!(store.read(&note("b.md")).is_err());
        assert!(kept.interrupted().unwrap().is_empty());
    }
}
