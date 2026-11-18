//! Enregistrer une note de l'espace de travail ouvert, sans jamais écraser une version écrite ailleurs.

use application::use_cases::SaveNote;
use domain::title::displayed_title;
use domain::{Fingerprint, NotePath};

use super::Session;
use crate::{ApiError, SaveResult};

impl Session {
    /// Enregistre une note ; rend son chemin, dont le nom a peut-être changé avec le titre.
    /// `fingerprint` est l'empreinte de la note telle que la page l'a lue ou enregistrée :
    /// si le fichier a changé ailleurs depuis, sa version est gardée dans une copie de conflit.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin ou empreinte invalide,
    /// nom pris, stockage indisponible, aucun espace de travail ouvert.
    pub fn save_note(
        &self,
        path: &str,
        content: &str,
        fingerprint: &str,
    ) -> Result<SaveResult, ApiError> {
        let store = self.store()?;
        let saved = SaveNote::new(&*store, &*self.clock).execute(
            &NotePath::parse(path)?,
            content,
            &Fingerprint::parse(fingerprint)?,
        )?;
        Ok(SaveResult {
            path: saved.path.to_path(),
            title: displayed_title(content),
            fingerprint: saved.fingerprint.as_str().to_owned(),
            conflict_copy: saved.conflict_copy.as_ref().map(NotePath::to_path),
            tags_changed: saved.tags_changed,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;

    fn opened(notes: &[(&str, &str)]) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
        let session = Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        session
    }

    #[test]
    fn a_note_is_read_and_saved_with_renaming() {
        let session = opened(&[("a.md", "# Alpha")]);
        let read = session.read_note("a.md").unwrap();
        assert_eq!(read.content, "# Alpha");
        assert_eq!(read.title, "Alpha");
        let saved = session
            .save_note("a.md", "# Bêta", &read.fingerprint)
            .unwrap();
        assert_eq!(saved.path, "beta.md");
        assert_eq!(saved.title, "Bêta");
        assert_eq!(saved.conflict_copy, None);
        assert!(!saved.tags_changed);
        assert_eq!(
            saved.fingerprint,
            session.read_note("beta.md").unwrap().fingerprint
        );
    }

    #[test]
    fn a_note_without_heading_is_untitled() {
        let session = opened(&[("a.md", "texte")]);
        assert_eq!(session.read_note("a.md").unwrap().title, "Sans titre");
        let read = session.read_note("a.md").unwrap();
        let saved = session
            .save_note("a.md", "encore", &read.fingerprint)
            .unwrap();
        assert_eq!(saved.title, "Sans titre");
    }

    #[test]
    fn a_note_changed_elsewhere_is_kept_in_a_conflict_copy() {
        let session = opened(&[("a.md", "# Alpha\nailleurs")]);
        let saved = session
            .save_note("a.md", "# Alpha\nici", "cbf29ce484222325")
            .unwrap();
        let copy = "a (conflit 2026-11-16 18h30).md";
        assert_eq!(saved.conflict_copy.as_deref(), Some(copy));
        assert_eq!(
            session.read_note(copy).unwrap().content,
            "# Alpha\nailleurs"
        );
    }

    #[test]
    fn an_invalid_fingerprint_from_the_page_is_refused() {
        let session = opened(&[("a.md", "# Alpha")]);
        let error = session
            .save_note("a.md", "# Alpha", "pas-une-empreinte")
            .unwrap_err();
        assert_eq!(
            error.message,
            "empreinte de note invalide : « pas-une-empreinte »"
        );
    }
}
