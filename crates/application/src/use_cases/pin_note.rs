//! Épingler une note en tête de liste, ou la désépingler.

use domain::NotePath;
use domain::front_matter::{pinned, unpinned};

use crate::{AppError, NoteStore, StoredNote};

/// Épingle ou désépingle une note, sans changer sa date de modification.
#[derive(Debug)]
pub struct PinNote<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> PinNote<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// La note épinglée : `pinned: true` dans son en-tête.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si elle n'existe pas, [`AppError::NoteUnreadable`] si elle
    /// n'est pas du texte UTF-8, [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn pin(&self, note: &NotePath) -> Result<StoredNote, AppError> {
        self.change(note, pinned)
    }

    /// La note désépinglée : la clé `pinned` retirée de son en-tête.
    ///
    /// # Errors
    ///
    /// Les mêmes que [`PinNote::pin`].
    pub fn unpin(&self, note: &NotePath) -> Result<StoredNote, AppError> {
        self.change(note, unpinned)
    }

    /// Lire, décider le nouveau contenu, écrire seulement s'il a changé.
    fn change(
        &self,
        note: &NotePath,
        decide: impl Fn(&str) -> String,
    ) -> Result<StoredNote, AppError> {
        let stored = self.store.read(note)?;
        let content = decide(&stored.content);
        if content != stored.content {
            self.store.write_keeping_date(note, &content)?;
        }
        Ok(StoredNote { content, ..stored })
    }
}

#[cfg(test)]
mod tests {
    use domain::Folder;

    use super::*;
    use crate::testing::InMemoryNoteStore;
    use crate::use_cases::ListNotes;

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    #[test]
    fn a_pinned_note_comes_first_without_becoming_the_most_recent() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "# Alpha"), ("b.md", "# Bêta")]);
        let before = store.read(&path("a.md")).unwrap().modified;
        let pinned = PinNote::new(&store).pin(&path("a.md")).unwrap();
        assert_eq!(pinned.content, "---\npinned: true\n---\n# Alpha");
        assert_eq!(pinned.modified, before);
        assert_eq!(store.read(&path("a.md")).unwrap(), pinned);
        let notes = ListNotes::new(&store).execute(&Folder::root()).unwrap();
        assert_eq!(notes[0].title(), "Alpha");
    }

    #[test]
    fn an_unpinned_note_loses_its_pin() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "---\npinned: true\n---\n# A")]);
        let unpinned = PinNote::new(&store).unpin(&path("a.md")).unwrap();
        assert_eq!(unpinned.content, "# A");
        assert_eq!(store.read(&path("a.md")).unwrap().content, "# A");
    }

    #[test]
    fn unpinning_a_note_that_is_not_pinned_leaves_it_as_it_is() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "# A")]);
        let unpinned = PinNote::new(&store).unpin(&path("a.md")).unwrap();
        assert_eq!(unpinned.content, "# A");
    }

    #[test]
    fn a_missing_note_is_reported() {
        let store = InMemoryNoteStore::default();
        assert_eq!(
            PinNote::new(&store).pin(&path("x.md")),
            Err(AppError::NoteNotFound(path("x.md")))
        );
    }
}
