//! Enregistrer une note ; son nom de fichier suit son titre.

use domain::FileName;
use domain::saving::plan_save;

use crate::{AppError, NoteStore};

/// Enregistre une note ; si son titre a changé, le fichier (et ses pièces jointes) est renommé.
#[derive(Debug)]
pub struct SaveNote<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> SaveNote<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le nom de fichier de la note après enregistrement.
    ///
    /// # Errors
    ///
    /// [`AppError::NameTaken`] si le nouveau nom est pris entre-temps,
    /// [`AppError::NoteNotFound`] si la note a disparu, [`AppError::StorageUnavailable`]
    /// si le stockage ne répond pas.
    pub fn execute(&self, current: &FileName, content: &str) -> Result<FileName, AppError> {
        let existing = self.store.names()?;
        let plan = plan_save(current, content, &existing);
        self.store.write(current, plan.content())?;
        if plan.file_name() != current {
            self.store.rename(current, plan.file_name())?;
        }
        Ok(plan.file_name().clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;

    fn name(text: &str) -> FileName {
        FileName::parse(text).unwrap()
    }

    #[test]
    fn content_is_saved_under_the_same_name_when_title_matches() {
        let store = InMemoryNoteStore::with_notes(&[("courses.md", "# Courses")]);
        let saved = SaveNote::new(&store)
            .execute(&name("courses.md"), "# Courses\n- pain")
            .unwrap();
        assert_eq!(saved, name("courses.md"));
        assert_eq!(store.read(&saved).unwrap().content, "# Courses\n- pain");
    }

    #[test]
    fn changing_the_title_renames_the_file_in_kebab_case() {
        let store = InMemoryNoteStore::with_notes(&[("ancien-nom.md", "# Ancien")]);
        let saved = SaveNote::new(&store)
            .execute(&name("ancien-nom.md"), "# Mon idée")
            .unwrap();
        assert_eq!(saved, name("mon-idee.md"));
        assert_eq!(store.names().unwrap(), [name("mon-idee.md")]);
        assert_eq!(store.read(&saved).unwrap().content, "# Mon idée");
    }

    #[test]
    fn taken_name_gets_a_numbered_suffix() {
        let store = InMemoryNoteStore::with_notes(&[("idee.md", "# Idée"), ("brouillon.md", "")]);
        let saved = SaveNote::new(&store)
            .execute(&name("brouillon.md"), "# Idée")
            .unwrap();
        assert_eq!(saved, name("idee-2.md"));
        assert_eq!(store.read(&name("idee.md")).unwrap().content, "# Idée");
    }

    #[test]
    fn note_already_holding_its_numbered_name_keeps_it() {
        let store =
            InMemoryNoteStore::with_notes(&[("idee.md", "# Idée"), ("idee-2.md", "# Idée")]);
        let saved = SaveNote::new(&store)
            .execute(&name("idee-2.md"), "# Idée\nsuite")
            .unwrap();
        assert_eq!(saved, name("idee-2.md"));
    }

    #[test]
    fn attachment_links_follow_the_renamed_note() {
        let store = InMemoryNoteStore::with_notes(&[("voyage.md", "# Voyage")]);
        let content = "# Lisbonne\n![vue](voyage.assets/vue.png)";
        let saved = SaveNote::new(&store)
            .execute(&name("voyage.md"), content)
            .unwrap();
        assert_eq!(saved, name("lisbonne.md"));
        assert_eq!(
            store.read(&saved).unwrap().content,
            "# Lisbonne\n![vue](lisbonne.assets/vue.png)"
        );
    }

    #[test]
    fn removing_the_title_makes_the_note_untitled() {
        let store = InMemoryNoteStore::with_notes(&[("courses.md", "# Courses")]);
        let saved = SaveNote::new(&store)
            .execute(&name("courses.md"), "plus de titre")
            .unwrap();
        assert_eq!(saved, name("sans-titre.md"));
    }
}
