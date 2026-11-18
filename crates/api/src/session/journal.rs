//! Le journal de la bibliothèque ouverte, vu depuis la page : la note du jour.

use application::use_cases::CreateDailyNote;
use domain::{Folder, NotePath};

use super::Session;
use crate::{ApiError, SavedNote};

impl Session {
    /// La note du jour dans le dossier `journal`, créée si besoin depuis le modèle `template`
    /// (ou avec son seul titre) ; rend son chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; dossier ou chemin invalide,
    /// modèle absent, stockage indisponible, aucune bibliothèque ouverte.
    pub fn create_daily_note(
        &self,
        journal: &str,
        template: Option<&str>,
    ) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let template = template.map(NotePath::parse).transpose()?;
        let note = CreateDailyNote::new(&*store, &*self.clock)
            .execute(&Folder::parse(journal)?, template.as_ref())?;
        Ok(SavedNote {
            path: note.to_path(),
        })
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
    fn the_daily_note_is_created_once_in_the_journal() {
        let session = session(&[("Modèles/journal.md", "# Journal\n{{time}}")]);
        assert!(session.create_daily_note("Journal", None).is_err());
        session
            .open_library(LibraryLocation::new("/Users/moi/Notes").unwrap())
            .unwrap();
        let created = session
            .create_daily_note("Journal", Some("Modèles/journal.md"))
            .unwrap();
        assert_eq!(created.path, "Journal/2026-11-16.md");
        assert_eq!(
            session.read_note(&created.path).unwrap().content,
            "# 16 novembre 2026\n18:30"
        );
        let again = session.create_daily_note("Journal", None).unwrap();
        assert_eq!(again.path, created.path);
        assert!(session.create_daily_note("../x", None).is_err());
        assert!(
            session
                .create_daily_note("Journal", Some("../x.md"))
                .is_err()
        );
    }
}
