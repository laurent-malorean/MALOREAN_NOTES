//! Créer une note vide.

use domain::FileName;
use domain::saving::new_note_name;

use crate::{AppError, NoteStore};

/// Une nouvelle note vide, sans titre, qui n'écrase aucune autre note.
pub struct CreateNote<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateNote<'a> {
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    pub fn execute(&self) -> Result<FileName, AppError> {
        let existing = self.store.names()?;
        let name = new_note_name(&existing);
        self.store.write(&name, "")?;
        Ok(name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;

    #[test]
    fn new_note_is_an_empty_untitled_file() {
        let store = InMemoryNoteStore::default();
        let name = CreateNote::new(&store).execute().unwrap();
        assert_eq!(name.as_str(), "sans-titre.md");
        assert_eq!(store.read(&name).unwrap().content, "");
    }

    #[test]
    fn new_note_never_overwrites_another_untitled_note() {
        let store = InMemoryNoteStore::with_notes(&[("sans-titre.md", "garde-moi")]);
        let name = CreateNote::new(&store).execute().unwrap();
        assert_eq!(name.as_str(), "sans-titre-2.md");
        let kept = FileName::parse("sans-titre.md").unwrap();
        assert_eq!(store.read(&kept).unwrap().content, "garde-moi");
    }
}
