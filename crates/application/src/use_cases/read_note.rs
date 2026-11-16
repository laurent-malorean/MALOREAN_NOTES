//! Ouvrir une note pour l'éditer.

use domain::FileName;

use crate::{AppError, NoteStore, StoredNote};

/// Le contenu d'une note, pour l'éditer (port d'entrée de la lecture).
#[derive(Debug)]
pub struct ReadNote<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ReadNote<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// La note qui porte ce nom.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si elle n'existe pas, [`AppError::NoteUnreadable`] si elle
    /// n'est pas du texte UTF-8, [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, name: &FileName) -> Result<StoredNote, AppError> {
        Ok(self.store.read(name)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AppError;
    use crate::testing::InMemoryNoteStore;

    #[test]
    fn note_content_is_returned() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "# Alpha\ntexte")]);
        let note = ReadNote::new(&store)
            .execute(&FileName::parse("a.md").unwrap())
            .unwrap();
        assert_eq!(note.content, "# Alpha\ntexte");
    }

    #[test]
    fn missing_note_is_reported() {
        let store = InMemoryNoteStore::default();
        let name = FileName::parse("x.md").unwrap();
        assert_eq!(
            ReadNote::new(&store).execute(&name),
            Err(AppError::NoteNotFound(name))
        );
    }
}
