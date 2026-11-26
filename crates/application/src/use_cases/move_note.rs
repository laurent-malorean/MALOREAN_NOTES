//! Déplacer une note dans un autre dossier.

use domain::attachments::relink;
use domain::saving::moved_note;
use domain::{Folder, NotePath};

use super::crm_fiches::{fiches_of, move_with, taken_with_folders};
use crate::{AppError, NoteStore};

/// Déplace une note, avec ses pièces jointes, dans un autre dossier de l'espace de travail. Un CRM
/// emporte ses fiches (fiche 0091).
#[derive(Debug)]
pub struct MoveNote<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> MoveNote<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le chemin de la note dans `into` ; inchangé si elle y est déjà. Si son nom y est
    /// pris, elle reçoit le premier suffixe libre et ses liens vers ses pièces jointes suivent.
    /// Un CRM déplace ses fiches avec lui : le dossier qui porte son nom s'il ne contient que des
    /// fiches, sinon les fiches seules ; un nom ou un dossier pris à l'arrivée donne au CRM un
    /// suffixe, que son dossier des fiches prend aussi.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si la note n'existe pas, [`AppError::FolderNotFound`] si
    /// `into` n'existe pas, [`AppError::FolderInsideItself`] si un CRM va dans son propre dossier
    /// de fiches, [`AppError::NoteUnreadable`] si elle doit être renommée mais
    /// n'est pas du texte UTF-8, [`AppError::NameTaken`] si son nom est pris entre-temps,
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, note: &NotePath, into: &Folder) -> Result<NotePath, AppError> {
        if note.folder() == into {
            return Ok(note.clone());
        }
        let fiches = fiches_of(self.store, note)?;
        let mut taken = self.store.names(into)?;
        if let Some(fiches) = &fiches {
            if into.is_within(fiches.folder()) {
                return Err(AppError::FolderInsideItself(fiches.folder().clone()));
            }
            taken = taken_with_folders(taken, &self.store.folders()?, into);
        }
        let moved = moved_note(note, into, &taken);
        if let Some(fiches) = &fiches {
            move_with(self.store, fiches, &moved)?;
        }
        if moved.name() == note.name() {
            self.store.move_note(note, &moved)?;
        } else {
            let content = self.store.read(note)?.content;
            self.store.move_note(note, &moved)?;
            self.store
                .write(&moved, &relink(&content, note.name(), moved.name()))?;
        }
        Ok(moved)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn folder(text: &str) -> Folder {
        Folder::parse(text).unwrap()
    }

    fn store_with_folder(notes: &[(&str, &str)]) -> InMemoryNoteStore {
        let store = InMemoryNoteStore::with_notes(notes);
        store.create_folder(&folder("Perso")).unwrap();
        store
    }

    #[test]
    fn a_note_moves_into_another_folder_with_its_content() {
        let store = store_with_folder(&[("courses.md", "# Courses")]);
        let moved = MoveNote::new(&store)
            .execute(&path("courses.md"), &folder("Perso"))
            .unwrap();
        assert_eq!(moved, path("Perso/courses.md"));
        assert_eq!(store.read(&moved).unwrap().content, "# Courses");
        assert!(store.read(&path("courses.md")).is_err());
    }

    #[test]
    fn a_taken_name_gets_a_suffix_and_attachment_links_follow() {
        let store = store_with_folder(&[("voyage.md", "![vue](voyage.assets/vue.png)")]);
        store.write(&path("Perso/voyage.md"), "autre").unwrap();
        let moved = MoveNote::new(&store)
            .execute(&path("voyage.md"), &folder("Perso"))
            .unwrap();
        assert_eq!(moved, path("Perso/voyage-2.md"));
        assert_eq!(
            store.read(&moved).unwrap().content,
            "![vue](voyage-2.assets/vue.png)"
        );
        assert_eq!(
            store.read(&path("Perso/voyage.md")).unwrap().content,
            "autre"
        );
    }

    #[test]
    fn moving_a_note_onto_its_own_folder_changes_nothing() {
        let store = InMemoryNoteStore::with_notes(&[("Perso/a.md", "A")]);
        let moved = MoveNote::new(&store)
            .execute(&path("Perso/a.md"), &folder("Perso"))
            .unwrap();
        assert_eq!(moved, path("Perso/a.md"));
        assert_eq!(store.read(&moved).unwrap().content, "A");
    }

    #[test]
    fn moving_into_a_missing_folder_is_refused() {
        let store = store_with_folder(&[("a.md", "A")]);
        assert_eq!(
            MoveNote::new(&store).execute(&path("a.md"), &folder("Absent")),
            Err(AppError::FolderNotFound(folder("Absent")))
        );
    }

    #[test]
    fn moving_a_missing_note_is_refused() {
        let store = store_with_folder(&[]);
        assert_eq!(
            MoveNote::new(&store).execute(&path("absente.md"), &folder("Perso")),
            Err(AppError::NoteNotFound(path("absente.md")))
        );
    }
}

#[cfg(test)]
#[path = "move_crm_tests.rs"]
mod crm_tests;
