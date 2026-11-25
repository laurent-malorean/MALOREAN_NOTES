//! Appliquer un geste du CRM (fiche 0058) : « une intention, un enregistrement ». Un geste qui change
//! plusieurs fichiers est gardé avant d'être appliqué, appliqué entièrement, puis oublié ; interrompu,
//! il est terminé à l'ouverture suivante de l'espace de travail, ou avant le geste suivant.

use crate::use_cases::Trash;
use crate::{AppError, Gesture, GestureStep, NoteStore, PendingGestures, StoreError};

/// Termine les gestes que l'application a laissés à moitié faits (coupure, arrêt, écriture ratée).
#[derive(Debug)]
pub struct RecoverGestures<'a> {
    store: &'a dyn NoteStore,
    pending: &'a dyn PendingGestures,
}

impl<'a> RecoverGestures<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et ses gestes en attente.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, pending: &'a dyn PendingGestures) -> Self {
        Self { store, pending }
    }

    /// Applique, du plus ancien au plus récent, chaque geste en attente, puis l'oublie.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si le stockage ou les gestes en attente ne répondent pas :
    /// le geste en cours reste en attente.
    pub fn execute(&self) -> Result<(), AppError> {
        for (id, gesture) in self.pending.interrupted()? {
            apply_steps(self.store, &gesture)?;
            self.pending.end(id)?;
        }
        Ok(())
    }
}

/// Applique un geste : tous ses pas, ou, s'il échoue, ceux que le disque a refusés restent à faire.
#[derive(Debug)]
pub struct ApplyGesture<'a> {
    store: &'a dyn NoteStore,
    pending: &'a dyn PendingGestures,
}

impl<'a> ApplyGesture<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et ses gestes en attente.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, pending: &'a dyn PendingGestures) -> Self {
        Self { store, pending }
    }

    /// Termine d'abord les gestes interrompus, puis applique `gesture`. Un geste d'un seul fichier
    /// s'écrit directement ; un geste de plusieurs fichiers est gardé avant d'être appliqué.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas ; un geste de plusieurs fichiers
    /// reste alors en attente et sera terminé avant le prochain geste.
    pub fn execute(&self, gesture: &Gesture) -> Result<(), AppError> {
        RecoverGestures::new(self.store, self.pending).execute()?;
        if gesture.steps().len() < 2 {
            return apply_steps(self.store, gesture);
        }
        let id = self.pending.begin(gesture)?;
        apply_steps(self.store, gesture)?;
        Ok(self.pending.end(id)?)
    }
}

fn apply_steps(store: &dyn NoteStore, gesture: &Gesture) -> Result<(), AppError> {
    gesture
        .steps()
        .iter()
        .try_for_each(|step| apply_step(store, step))
}

/// Une note qui n'existe plus laisse son pas sans effet.
fn apply_step(store: &dyn NoteStore, step: &GestureStep) -> Result<(), AppError> {
    match step {
        GestureStep::Rewrite { note, content } => match store.read(note) {
            Ok(_) => Ok(store.write(note, content)?),
            Err(StoreError::NotFound(_)) => Ok(()),
            Err(error) => Err(error.into()),
        },
        GestureStep::Trash { note } => match Trash::new(store).put_note(note) {
            Err(AppError::NoteNotFound(_)) => Ok(()),
            trashed => trashed.map(drop),
        },
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use domain::NotePath;

    use super::*;
    use crate::testing::InMemoryNoteStore;
    use crate::{GestureId, MemoryPendingGestures};

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn rewrite(note: &str, content: &str) -> GestureStep {
        GestureStep::Rewrite {
            note: path(note),
            content: content.to_owned(),
        }
    }

    fn trash(note: &str) -> GestureStep {
        GestureStep::Trash { note: path(note) }
    }

    fn text(store: &InMemoryNoteStore, note: &str) -> String {
        store.read(&path(note)).unwrap().content
    }

    /// Des gestes en attente qui comptent combien de gestes ont été gardés.
    #[derive(Debug, Default)]
    struct Counting {
        inner: MemoryPendingGestures,
        begun: AtomicUsize,
    }

    impl PendingGestures for Counting {
        fn begin(&self, gesture: &Gesture) -> Result<GestureId, StoreError> {
            self.begun.fetch_add(1, Ordering::SeqCst);
            self.inner.begin(gesture)
        }
        fn end(&self, id: GestureId) -> Result<(), StoreError> {
            self.inner.end(id)
        }
        fn interrupted(&self) -> Result<Vec<(GestureId, Gesture)>, StoreError> {
            self.inner.interrupted()
        }
    }

    #[test]
    fn a_gesture_of_several_steps_is_kept_applied_then_forgotten() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "A"), ("b.md", "B"), ("c.md", "C")]);
        let pending = Counting::default();
        let gesture = Gesture::new(vec![
            rewrite("a.md", "A2"),
            rewrite("b.md", "B2"),
            trash("c.md"),
        ]);
        ApplyGesture::new(&store, &pending)
            .execute(&gesture)
            .unwrap();
        assert_eq!(pending.begun.load(Ordering::SeqCst), 1);
        assert!(pending.interrupted().unwrap().is_empty());
        assert_eq!(text(&store, "a.md"), "A2");
        assert_eq!(text(&store, "b.md"), "B2");
        assert!(store.read(&path("c.md")).is_err());
        assert_eq!(store.trash().unwrap().notes.len(), 1);
    }

    #[test]
    fn a_gesture_of_one_file_is_written_directly_and_an_empty_one_does_nothing() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "A")]);
        let pending = Counting::default();
        let apply = ApplyGesture::new(&store, &pending);
        apply
            .execute(&Gesture::new(vec![rewrite("a.md", "A2")]))
            .unwrap();
        apply.execute(&Gesture::default()).unwrap();
        assert_eq!(pending.begun.load(Ordering::SeqCst), 0);
        assert_eq!(text(&store, "a.md"), "A2");
    }

    #[test]
    fn a_failed_write_leaves_the_gesture_pending_and_the_next_gesture_finishes_it_first() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "A"), ("b.md", "B"), ("c.md", "C")]);
        let pending = MemoryPendingGestures::default();
        store.fail_writes_to(&path("b.md"));
        let apply = ApplyGesture::new(&store, &pending);
        let gesture = Gesture::new(vec![rewrite("a.md", "A2"), rewrite("b.md", "B2")]);
        assert!(matches!(
            apply.execute(&gesture),
            Err(AppError::StorageUnavailable(_))
        ));
        assert_eq!(text(&store, "a.md"), "A2");
        assert_eq!(text(&store, "b.md"), "B");
        assert_eq!(pending.interrupted().unwrap().len(), 1);
        store.stop_failing();
        apply
            .execute(&Gesture::new(vec![rewrite("c.md", "C2")]))
            .unwrap();
        assert_eq!(text(&store, "b.md"), "B2");
        assert_eq!(text(&store, "c.md"), "C2");
        assert!(pending.interrupted().unwrap().is_empty());
    }

    #[test]
    fn an_interrupted_gesture_is_finished_when_recovered_oldest_first() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "A"), ("b.md", "B")]);
        let pending = MemoryPendingGestures::default();
        pending
            .begin(&Gesture::new(vec![
                rewrite("a.md", "1"),
                rewrite("b.md", "1"),
            ]))
            .unwrap();
        pending
            .begin(&Gesture::new(vec![rewrite("a.md", "2"), trash("b.md")]))
            .unwrap();
        RecoverGestures::new(&store, &pending).execute().unwrap();
        assert_eq!(text(&store, "a.md"), "2");
        assert!(store.read(&path("b.md")).is_err());
        assert!(pending.interrupted().unwrap().is_empty());
        RecoverGestures::new(&store, &pending).execute().unwrap();
    }

    #[test]
    fn a_note_that_is_gone_is_neither_rewritten_nor_trashed() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "A")]);
        let pending = MemoryPendingGestures::default();
        let gesture = Gesture::new(vec![
            rewrite("absente.md", "X"),
            trash("absente.md"),
            rewrite("a.md", "A2"),
        ]);
        ApplyGesture::new(&store, &pending)
            .execute(&gesture)
            .unwrap();
        assert!(store.read(&path("absente.md")).is_err());
        assert_eq!(text(&store, "a.md"), "A2");
        assert!(store.trash().unwrap().notes.is_empty());
    }
}
