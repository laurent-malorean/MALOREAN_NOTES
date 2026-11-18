//! Les modèles de note de l'espace de travail ouvert, vus depuis la page.

use application::use_cases::CreateNoteFromTemplate;
use domain::{Folder, NotePath};

use super::Session;
use crate::{ApiError, SavedNote};

impl Session {
    /// Crée une note dans `folder` depuis le modèle `template` ; rend son chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin ou dossier invalide,
    /// modèle absent, stockage indisponible, aucun espace de travail ouvert.
    pub fn create_note_from_template(
        &self,
        template: &str,
        folder: &str,
    ) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let created = CreateNoteFromTemplate::new(&*store, &*self.clock)
            .execute(&NotePath::parse(template)?, &Folder::parse(folder)?)?;
        Ok(SavedNote {
            path: created.to_path(),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::WorkspaceLocation;
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
    fn a_note_is_created_from_a_template_in_the_folder() {
        let session = session(&[("Modèles/journal.md", "# Journal du {{date}}")]);
        assert!(
            session
                .create_note_from_template("Modèles/journal.md", "")
                .is_err()
        );
        session
            .open_workspace(WorkspaceLocation::new("/Users/moi/Notes").unwrap())
            .unwrap();
        let created = session
            .create_note_from_template("Modèles/journal.md", "Modèles")
            .unwrap();
        assert_eq!(created.path, "Modèles/journal-du-16-novembre-2026.md");
        assert_eq!(
            session.read_note(&created.path).unwrap().content,
            "# Journal du 16 novembre 2026"
        );
        assert!(session.create_note_from_template("../x.md", "").is_err());
        assert!(
            session
                .create_note_from_template("Modèles/journal.md", "../x")
                .is_err()
        );
    }
}
