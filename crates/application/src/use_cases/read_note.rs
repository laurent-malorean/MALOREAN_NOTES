//! Ouvrir une note pour l'éditer.

use domain::FileName;

use crate::{AppError, NoteStore, StoredNote};

/// Le contenu d'une note, pour l'éditer.
pub struct ReadNote<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ReadNote<'a> {
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

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
