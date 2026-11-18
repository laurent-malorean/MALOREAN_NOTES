//! Les notes récentes de la bibliothèque ouverte, vues depuis la page.

use application::use_cases::ListRecentNotes;

use super::{Session, list_item};
use crate::{ApiError, NoteListItem};

impl Session {
    /// Les notes récentes `paths`, dans cet ordre, sans celles qui n'existent plus.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; bibliothèque illisible, aucune
    /// bibliothèque ouverte.
    pub fn list_recent_notes(&self, paths: &[String]) -> Result<Vec<NoteListItem>, ApiError> {
        let store = self.store()?;
        let notes = ListRecentNotes::new(&*store).execute(paths)?;
        Ok(notes.iter().map(list_item).collect())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::LibraryLocation;
    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;

    #[test]
    fn recent_notes_come_as_list_lines_in_the_given_order() {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(&[
            ("a.md", "---\ntags: [perso]\n---\n# Alpha"),
            ("Travail/b.md", "# Bêta"),
        ])));
        let session = Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        let paths = ["Travail/b.md", "partie.md", "a.md"].map(String::from);
        assert!(session.list_recent_notes(&paths).is_err());
        session
            .open_library(LibraryLocation::new("/Users/moi/Notes").unwrap())
            .unwrap();
        let notes = session.list_recent_notes(&paths).unwrap();
        let titles: Vec<_> = notes.iter().map(|n| n.title.as_str()).collect();
        assert_eq!(titles, ["Bêta", "Alpha"]);
        assert_eq!(notes[1].path, "a.md");
        assert_eq!(notes[1].tags, ["perso"]);
    }
}
