//! L'ouverture rapide : toutes les notes de l'espace de travail ouvert, vues depuis l'interface.

use application::use_cases::ListAllNotes;

use super::Session;
use crate::{ApiError, WorkspaceNoteItem};

impl Session {
    /// Toutes les notes de l'espace de travail, la plus récemment modifiée en premier.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; espace de travail illisible, aucun
    /// espace de travail ouvert.
    pub fn list_all_notes(&self) -> Result<Vec<WorkspaceNoteItem>, ApiError> {
        let index = self.index()?;
        Ok(ListAllNotes::new(&*index)
            .execute()?
            .into_iter()
            .map(|note| WorkspaceNoteItem {
                path: note.path().to_path(),
                title: note.title().to_owned(),
                folder: note.path().folder().to_path(),
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;

    fn session(notes: &[(&str, &str)]) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
        Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        )
    }

    #[test]
    fn every_note_comes_with_its_title_and_folder() {
        let session = session(&[("a.md", "# Alpha"), ("Travail/b.md", "# Bêta")]);
        assert!(session.list_all_notes().is_err());
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        assert_eq!(
            session.list_all_notes().unwrap(),
            [
                WorkspaceNoteItem {
                    path: "Travail/b.md".into(),
                    title: "Bêta".into(),
                    folder: "Travail".into(),
                },
                WorkspaceNoteItem {
                    path: "a.md".into(),
                    title: "Alpha".into(),
                    folder: String::new(),
                },
            ]
        );
    }
}
