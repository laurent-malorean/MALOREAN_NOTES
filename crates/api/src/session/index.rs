//! L'index de l'espace de travail ouvert : d'où il vient, et sa reconstruction à la demande.

use std::sync::Arc;

use application::IndexOpener;
use application::use_cases::RebuildIndex;

use super::Session;
use crate::ApiError;

impl Session {
    /// La même session, dont chaque espace de travail ouvert a son index gardé par `indexes`.
    #[must_use]
    pub fn with_indexes(mut self, indexes: Arc<dyn IndexOpener>) -> Self {
        self.indexes = indexes;
        self
    }

    /// Reconstruit l'index de l'espace de travail ouvert : il oublie tout et relit chaque note.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; aucun espace de travail ouvert,
    /// espace de travail illisible, index impossible à écrire.
    pub fn rebuild_index(&self) -> Result<(), ApiError> {
        let opened = self.opened()?;
        Ok(RebuildIndex::new(&*opened.store, &*opened.index).execute()?)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};
    use application::{
        IndexedNote, MemoryIndex, NoteIndex, NoteStore, StoreError, WorkspaceLocation,
    };
    use domain::NotePath;

    use super::*;
    use crate::NoteOrderItem;

    /// Ouvre toujours le même index, que le test garde sous la main.
    #[derive(Debug, Default)]
    struct SharedIndex(Arc<MemoryIndex>);

    impl IndexOpener for SharedIndex {
        fn open(&self, _location: &WorkspaceLocation) -> Result<Arc<dyn NoteIndex>, StoreError> {
            Ok(self.0.clone())
        }
    }

    /// Ne peut ouvrir aucun index.
    #[derive(Debug)]
    struct NoIndex;

    impl IndexOpener for NoIndex {
        fn open(&self, _location: &WorkspaceLocation) -> Result<Arc<dyn NoteIndex>, StoreError> {
            Err(StoreError::Unavailable("disque plein".into()))
        }
    }

    fn session(store: &Arc<InMemoryNoteStore>, indexes: Arc<dyn IndexOpener>) -> Session {
        Session::new(
            Arc::new(FakeOpener::new(Arc::clone(store))),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        )
        .with_indexes(indexes)
    }

    fn titles(session: &Session) -> Vec<String> {
        let notes = session.list_notes("", NoteOrderItem::Title).unwrap();
        notes.into_iter().map(|n| n.title).collect()
    }

    #[test]
    fn the_index_of_the_opened_workspace_is_brought_up_to_date() {
        let store = Arc::new(InMemoryNoteStore::with_notes(&[("a.md", "# A")]));
        let index = Arc::new(MemoryIndex::default());
        let session = session(&store, Arc::new(SharedIndex(Arc::clone(&index))));
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        assert_eq!(index.all_notes().unwrap()[0].title(), "A");
        session.create_note("").unwrap();
        assert_eq!(index.all_notes().unwrap().len(), 2);
    }

    #[test]
    fn a_rebuilt_index_rereads_every_note() {
        let store = Arc::new(InMemoryNoteStore::with_notes(&[("a.md", "# A")]));
        let index = Arc::new(MemoryIndex::default());
        let session = session(&store, Arc::new(SharedIndex(Arc::clone(&index))));
        assert_eq!(
            session.rebuild_index().unwrap_err().message,
            "aucun espace de travail n'est ouvert"
        );
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        let read = store
            .read_indexed(&NotePath::parse("a.md").unwrap())
            .unwrap();
        index
            .put(&[IndexedNote {
                content: "# Abîmé".into(),
                ..read
            }])
            .unwrap();
        assert_eq!(titles(&session), ["Abîmé"]);
        session.rebuild_index().unwrap();
        assert_eq!(titles(&session), ["A"]);
    }

    #[test]
    fn a_workspace_whose_index_cannot_open_is_not_opened() {
        let store = Arc::new(InMemoryNoteStore::default());
        let session = session(&store, Arc::new(NoIndex));
        assert_eq!(
            session
                .add_workspace("Notes", "/Users/moi/Notes")
                .unwrap_err()
                .message,
            "stockage indisponible : disque plein"
        );
        assert!(session.list_notes("", NoteOrderItem::Title).is_err());
    }
}
