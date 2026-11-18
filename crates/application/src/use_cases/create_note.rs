//! Créer une note : vide, ou depuis un modèle.

use domain::saving::{created_note_name, new_note_name};
use domain::template::note_from_template;
use domain::{Folder, NotePath};

use crate::{AppError, Clock, NoteStore};

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

/// Une nouvelle note tirée d'un modèle : son texte, variables remplacées, sous le nom de son titre.
#[derive(Debug)]
pub struct CreateNoteFromTemplate<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> CreateNoteFromTemplate<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// Le chemin de la note créée dans `folder` depuis le modèle `template`.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si le modèle n'existe plus ;
    /// [`AppError::StorageUnavailable`] si le dossier ne peut pas être lu ou écrit.
    pub fn execute(&self, template: &NotePath, folder: &Folder) -> Result<NotePath, AppError> {
        let content = note_from_template(&self.store.read(template)?.content, &self.clock.now());
        let existing = self.store.names(folder)?;
        let note = NotePath::new(folder.clone(), created_note_name(&content, &existing));
        self.store.write(&note, &content)?;
        Ok(note)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{FixedClock, InMemoryNoteStore};

    #[test]
    fn new_note_is_an_empty_untitled_file() {
        let store = InMemoryNoteStore::default();
        let name = CreateNote::new(&store).execute(&Folder::root()).unwrap();
        assert_eq!(name.to_path(), "sans-titre.md");
        assert_eq!(store.read(&name).unwrap().content, "");
    }

    fn from_template(store: &InMemoryNoteStore, template: &str, folder: &str) -> NotePath {
        let clock = FixedClock::default();
        CreateNoteFromTemplate::new(store, &clock)
            .execute(
                &NotePath::parse(template).unwrap(),
                &Folder::parse(folder).unwrap(),
            )
            .unwrap()
    }

    #[test]
    fn a_note_from_a_template_is_named_after_its_title_in_the_folder() {
        let store = InMemoryNoteStore::with_notes(&[
            (
                "Modèles/reunion.md",
                "---\ntags: [a]\npinned: true\n---\n# Réunion du {{date}}\n{{time}}",
            ),
            ("Travail/budget.md", "# Budget"),
        ]);
        let created = from_template(&store, "Modèles/reunion.md", "Travail");
        assert_eq!(created.to_path(), "Travail/reunion-du-16-novembre-2026.md");
        assert_eq!(
            store.read(&created).unwrap().content,
            "---\ntags: [a]\n---\n# Réunion du 16 novembre 2026\n18:30"
        );
    }

    #[test]
    fn a_note_from_a_template_never_overwrites_another_note() {
        let store = InMemoryNoteStore::with_notes(&[
            ("Modèles/journal.md", "# Journal"),
            ("journal.md", "garde-moi"),
        ]);
        let created = from_template(&store, "Modèles/journal.md", "");
        assert_eq!(created.to_path(), "journal-2.md");
        let kept = NotePath::parse("journal.md").unwrap();
        assert_eq!(store.read(&kept).unwrap().content, "garde-moi");
    }

    #[test]
    fn a_missing_template_creates_nothing() {
        let store = InMemoryNoteStore::default();
        let clock = FixedClock::default();
        let missing = NotePath::parse("Modèles/absent.md").unwrap();
        let result = CreateNoteFromTemplate::new(&store, &clock).execute(&missing, &Folder::root());
        assert!(result.is_err());
        assert!(store.names(&Folder::root()).unwrap().is_empty());
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
