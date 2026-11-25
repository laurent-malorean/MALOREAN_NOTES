//! Tenir l'index à jour sur les fichiers de l'espace de travail, seule vérité.

use crate::indexed_store::{notes_on_disk, refresh};
use crate::{AppError, NoteIndex, NoteStore};

/// Met l'index à jour sur l'espace de travail : à son ouverture, et après un changement fait
/// hors de l'application. Seules les notes dont la date ou la taille a changé sont relues.
#[derive(Debug)]
pub struct RefreshIndex<'a> {
    store: &'a dyn NoteStore,
    index: &'a dyn NoteIndex,
}

impl<'a> RefreshIndex<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et son index.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, index: &'a dyn NoteIndex) -> Self {
        Self { store, index }
    }

    /// Relit les notes nouvelles ou changées, oublie celles qui ont disparu.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'espace de travail ou l'index ne répond pas.
    pub fn execute(&self) -> Result<(), AppError> {
        Ok(refresh(self.store, self.index)?)
    }
}

/// Reconstruit l'index : il oublie tout, puis relit chaque note de l'espace de travail.
#[derive(Debug)]
pub struct RebuildIndex<'a> {
    store: &'a dyn NoteStore,
    index: &'a dyn NoteIndex,
}

impl<'a> RebuildIndex<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et son index.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, index: &'a dyn NoteIndex) -> Self {
        Self { store, index }
    }

    /// Vide l'index et relit toutes les notes.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'espace de travail ou l'index ne répond pas.
    pub fn execute(&self) -> Result<(), AppError> {
        self.index.clear()?;
        Ok(refresh(self.store, self.index)?)
    }
}

/// Lire l'état de l'index de mots : combien de notes il connaît, et combien il devrait en connaître.
#[derive(Debug)]
pub struct ReadIndexStatus<'a> {
    store: &'a dyn NoteStore,
    index: &'a dyn NoteIndex,
}

impl<'a> ReadIndexStatus<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et son index.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, index: &'a dyn NoteIndex) -> Self {
        Self { store, index }
    }

    /// Le nombre de notes de l'espace de travail qui doivent être indexées : celles que
    /// l'indexation relit, trouvées par le même parcours des dossiers.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'espace de travail ne répond pas.
    pub fn notes_to_index(&self) -> Result<usize, AppError> {
        Ok(notes_on_disk(self.store)?.len())
    }

    /// Le nombre de notes que l'index connaît.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'index ne répond pas.
    pub fn indexed_notes(&self) -> Result<usize, AppError> {
        Ok(self.index.stamps()?.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;
    use crate::{IndexedNote, MemoryIndex};
    use domain::NotePath;

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn titles(index: &MemoryIndex) -> Vec<String> {
        let mut notes = index.all_notes().unwrap();
        notes.sort_by(|a, b| a.path().cmp(b.path()));
        notes.iter().map(|n| n.title().to_owned()).collect()
    }

    /// L'index croit connaître `a.md` : même relevé, autre contenu.
    fn stale(store: &InMemoryNoteStore, index: &MemoryIndex) {
        let note = store.read_indexed(&path("a.md")).unwrap();
        index
            .put(&[IndexedNote {
                stamp: note.stamp,
                content: "# Vieux".to_owned(),
            }])
            .unwrap();
    }

    #[test]
    fn a_refresh_reads_new_notes_and_keeps_unchanged_ones() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "# A"), ("T/b.md", "# B")]);
        let index = MemoryIndex::default();
        stale(&store, &index);
        RefreshIndex::new(&store, &index).execute().unwrap();
        assert_eq!(titles(&index), ["Vieux", "B"]);
    }

    #[test]
    fn a_rebuild_rereads_every_note() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "# A"), ("T/b.md", "# B")]);
        let index = MemoryIndex::default();
        stale(&store, &index);
        RebuildIndex::new(&store, &index).execute().unwrap();
        assert_eq!(titles(&index), ["A", "B"]);
    }

    #[test]
    fn the_status_counts_the_notes_the_index_knows() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "# A"), ("T/b.md", "# B")]);
        let index = MemoryIndex::default();
        assert_eq!(
            ReadIndexStatus::new(&store, &index)
                .indexed_notes()
                .unwrap(),
            0
        );
        RefreshIndex::new(&store, &index).execute().unwrap();
        assert_eq!(
            ReadIndexStatus::new(&store, &index)
                .indexed_notes()
                .unwrap(),
            2
        );
    }

    #[test]
    fn the_status_counts_the_notes_to_index_whatever_the_index_knows() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "# A"), ("T/U/b.md", "# B")])
            .with_file("T", "image.png", b"png");
        let index = MemoryIndex::default();
        let status = ReadIndexStatus::new(&store, &index);
        assert_eq!(status.notes_to_index().unwrap(), 2);
        RefreshIndex::new(&store, &index).execute().unwrap();
        assert_eq!(status.notes_to_index().unwrap(), 2);
        let empty = InMemoryNoteStore::default();
        assert_eq!(
            ReadIndexStatus::new(&empty, &index)
                .notes_to_index()
                .unwrap(),
            0
        );
    }
}
