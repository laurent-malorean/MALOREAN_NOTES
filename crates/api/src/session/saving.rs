//! Enregistrer une note de l'espace de travail ouvert, sans jamais écraser une version écrite ailleurs.

use application::use_cases::{RenameNote, ReplaceInNote, SaveNote};
use domain::title::displayed_title_of_note;
use domain::{Fingerprint, NotePath};
use serde::Serialize;

use super::Session;
use crate::{ApiError, SaveResult};

/// Ce que rend un remplacement de texte dans une note (outil `replace_in_note`, fiche 0075).
#[derive(Debug, Serialize, PartialEq, Eq)]
pub(super) struct ReplacedText {
    /// Le chemin de la note, dont le nom a peut-être changé avec son titre.
    pub path: String,
    /// Son titre après le remplacement.
    pub title: String,
    /// Le nombre d'occurrences remplacées.
    pub replacements: usize,
}

impl Session {
    /// Enregistre une note ; rend son chemin, dont le nom a peut-être changé avec le titre.
    /// `fingerprint` est l'empreinte de la note telle que l'interface l'a lue ou enregistrée :
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
        let note = NotePath::parse(path)?;
        let saved = SaveNote::new(&*store, &*self.clock).execute(
            &note,
            content,
            &Fingerprint::parse(fingerprint)?,
        )?;
        self.saved_since_version(&note, &saved.path)?;
        self.worker.request();
        Ok(SaveResult {
            path: saved.path.to_path(),
            title: displayed_title_of_note(content, saved.path.name()),
            fingerprint: saved.fingerprint.as_str().to_owned(),
            conflict_copy: saved.conflict_copy.as_ref().map(NotePath::to_path),
            tags_changed: saved.tags_changed,
        })
    }

    /// Renomme le contenu `path` : il prend le titre `title` et son fichier le suit (fiche 0090).
    /// Rend son nouveau chemin et son titre ; l'historique, les épingles et l'index suivent.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; titre vide ou déjà pris, fiche de
    /// CRM, chemin invalide, contenu absent, stockage indisponible, aucun espace de travail ouvert.
    pub fn rename_note(&self, path: &str, title: &str) -> Result<SaveResult, ApiError> {
        let opened = self.opened()?;
        let note = NotePath::parse(path)?;
        let renamed = RenameNote::new(&*opened.store, &*opened.history, &*self.clock)
            .execute(&note, title)?;
        if renamed.path != note {
            self.saved_since_version(&note, &renamed.path)?;
        }
        self.worker.request();
        Ok(SaveResult {
            title: displayed_title_of_note(&renamed.content, renamed.path.name()),
            fingerprint: Fingerprint::of(&renamed.content).as_str().to_owned(),
            path: renamed.path.to_path(),
            conflict_copy: None,
            tags_changed: false,
        })
    }

    /// Dans la note `path`, remplace `old_text` par `new_text` (à toutes ses occurrences si
    /// `replace_all`, sinon à sa seule occurrence) avec les règles de la saisie : le texte
    /// d'avant est gardé en version, l'index suit, le sens se recalcule. Rend le chemin de la
    /// note (changé si le titre l'est), son titre et le nombre de remplacements.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, note absente,
    /// contenu qui n'est pas une note simple, texte à remplacer vide, absent, égal au nouveau ou
    /// répété sans `replace_all`, stockage indisponible, aucun espace de travail ouvert.
    pub(super) fn replace_in_note(
        &self,
        path: &str,
        old_text: &str,
        new_text: &str,
        replace_all: bool,
    ) -> Result<ReplacedText, ApiError> {
        let opened = self.opened()?;
        let note = NotePath::parse(path)?;
        let done = ReplaceInNote::new(&*opened.store, &*opened.history, &*self.clock).execute(
            &note,
            old_text,
            new_text,
            replace_all,
        )?;
        self.saved_since_version(&note, &done.path)?;
        self.worker.request();
        Ok(ReplacedText {
            title: displayed_title_of_note(&done.content, done.path.name()),
            path: done.path.to_path(),
            replacements: done.count,
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
    fn a_note_without_heading_shows_and_keeps_its_file_name() {
        let session = opened(&[("a.md", "texte")]);
        assert_eq!(session.read_note("a.md").unwrap().title, "a");
        let read = session.read_note("a.md").unwrap();
        let saved = session
            .save_note("a.md", "encore", &read.fingerprint)
            .unwrap();
        assert_eq!(saved.title, "a");
        assert_eq!(saved.path, "a.md");
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
    fn a_renamed_note_takes_its_title_and_file_name_and_is_read_under_them() {
        let session = opened(&[("a.md", "---\npinned: true\n---\n# Alpha\ntexte")]);
        let renamed = session.rename_note("a.md", "Mon idée").unwrap();
        assert_eq!(renamed.path, "mon-idee.md");
        assert_eq!(renamed.title, "Mon idée");
        assert_eq!(renamed.conflict_copy, None);
        assert!(!renamed.tags_changed);
        let read = session.read_note("mon-idee.md").unwrap();
        assert_eq!(read.content, "---\npinned: true\n---\n# Mon idée\ntexte");
        assert_eq!(renamed.fingerprint, read.fingerprint);
        assert!(session.read_note("a.md").is_err());
    }

    #[test]
    fn a_renamed_canvas_shows_its_new_file_name_as_title() {
        let session = opened(&[("plan.canvas", "{}")]);
        let renamed = session.rename_note("plan.canvas", "Mon plan").unwrap();
        assert_eq!(renamed.path, "mon-plan.canvas");
        assert_eq!(renamed.title, "mon-plan");
    }

    #[test]
    fn a_rename_refused_says_why_in_french_and_changes_nothing() {
        let session = opened(&[("a.md", "# Alpha"), ("idee.md", "# Idée")]);
        let empty = session.rename_note("a.md", "  ").unwrap_err();
        assert_eq!(empty.message, "le titre est vide");
        let taken = session.rename_note("a.md", "Idée").unwrap_err();
        assert_eq!(taken.message, "une note de ce dossier porte déjà ce titre");
        assert_eq!(session.read_note("a.md").unwrap().content, "# Alpha");
        let missing = session.rename_note("../x.md", "Y").unwrap_err();
        assert!(!missing.message.is_empty());
    }

    #[test]
    fn an_invalid_fingerprint_from_the_interface_is_refused() {
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
