//! Créer une note vide.

use domain::saving::new_note_name;
use domain::{Folder, NotePath};

use crate::{AppError, NoteStore};

/// Une nouvelle note vide, sans titre, qui n'écrase aucune autre note.
#[derive(Debug)]
pub struct CreateNote<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateNote<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le chemin de la note créée dans `folder`.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si le dossier ne peut pas être lu ou écrit.
    pub fn execute(&self, folder: &Folder) -> Result<NotePath, AppError> {
        let existing = self.store.names(folder)?;
        let note = NotePath::new(folder.clone(), new_note_name(&existing));
        self.store.write(&note, "")?;
        Ok(note)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;

    #[test]
    fn new_note_is_an_empty_untitled_file() {
        let store = InMemoryNoteStore::default();
        let name = CreateNote::new(&store).execute(&Folder::root()).unwrap();
        assert_eq!(name.to_path(), "sans-titre.md");
        assert_eq!(store.read(&name).unwrap().content, "");
    }

    #[test]
    fn new_note_never_overwrites_another_untitled_note() {
        let store = InMemoryNoteStore::with_notes(&[("sans-titre.md", "garde-moi")]);
        let name = CreateNote::new(&store).execute(&Folder::root()).unwrap();
        assert_eq!(name.to_path(), "sans-titre-2.md");
        let kept = NotePath::parse("sans-titre.md").unwrap();
        assert_eq!(store.read(&kept).unwrap().content, "garde-moi");
    }
}
