//! L'ouverture rapide : toutes les notes de la bibliothèque ouverte, vues depuis la page.

use application::use_cases::ListAllNotes;

use super::Session;
use crate::{ApiError, LibraryNoteItem};

impl Session {
    /// Toutes les notes de la bibliothèque, la plus récemment modifiée en premier.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; bibliothèque illisible, aucune
    /// bibliothèque ouverte.
    pub fn list_all_notes(&self) -> Result<Vec<LibraryNoteItem>, ApiError> {
        let store = self.store()?;
        Ok(ListAllNotes::new(&*store)
            .execute()?
            .into_iter()
            .map(|note| LibraryNoteItem {
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

    use application::LibraryLocation;
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
        session
            .open_library(LibraryLocation::new("/Users/moi/Notes").unwrap())
            .unwrap();
        assert_eq!(
            session.list_all_notes().unwrap(),
            [
                LibraryNoteItem {
                    path: "Travail/b.md".into(),
                    title: "Bêta".into(),
                    folder: "Travail".into(),
                },
                LibraryNoteItem {
                    path: "a.md".into(),
                    title: "Alpha".into(),
                    folder: String::new(),
                },
            ]
        );
    }
}
