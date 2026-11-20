//! Les liens entre notes de l'espace de travail ouvert, vus depuis l'interface.

use application::use_cases::NoteLinks;
use domain::NotePath;

use super::Session;
use crate::{ApiError, LinkingNoteItem};

impl Session {
    /// Le chemin de la note qu'un lien `[[title]]` désigne, ou rien si aucune note ne porte
    /// ce titre.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; espace de travail illisible, aucun
    /// espace de travail ouvert.
    pub fn resolve_link(&self, title: &str) -> Result<Option<String>, ApiError> {
        let store = self.store()?;
        Ok(NoteLinks::new(&*store)
            .resolve(title)?
            .map(|path| path.to_path()))
    }

    /// Les liens entrants de la note reçue de l'interface, la plus récente en premier.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, note absente,
    /// espace de travail illisible, aucun espace de travail ouvert.
    pub fn list_backlinks(&self, path: &str) -> Result<Vec<LinkingNoteItem>, ApiError> {
        let store = self.store()?;
        let notes = NoteLinks::new(&*store).backlinks(&NotePath::parse(path)?)?;
        Ok(notes
            .into_iter()
            .map(|note| LinkingNoteItem {
                folder: note.path.folder().to_path(),
                path: note.path.to_path(),
                title: note.title,
            })
            .collect())
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
    fn a_link_leads_to_the_path_of_the_note_with_that_title() {
        let session = opened(&[("Cuisine/crepes.md", "# Crêpes")]);
        assert_eq!(
            session.resolve_link("crepes").unwrap().as_deref(),
            Some("Cuisine/crepes.md")
        );
        assert_eq!(session.resolve_link("Galettes").unwrap(), None);
    }

    #[test]
    fn backlinks_come_with_their_title_and_folder() {
        let session = opened(&[
            ("courses.md", "# Courses"),
            ("Travail/lundi.md", "# Lundi\nvoir [[Courses]]"),
        ]);
        assert_eq!(
            session.list_backlinks("courses.md").unwrap(),
            [LinkingNoteItem {
                path: "Travail/lundi.md".into(),
                title: "Lundi".into(),
                folder: "Travail".into(),
            }]
        );
    }

    #[test]
    fn invalid_paths_and_closed_workspaces_are_refused() {
        let session = opened(&[]);
        assert!(session.list_backlinks("../secret.md").is_err());
        let closed = Session::new(
            Arc::new(FakeOpener::new(Arc::new(
                InMemoryNoteStore::with_notes(&[]),
            ))),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        assert!(closed.resolve_link("x").is_err());
        assert!(closed.list_backlinks("a.md").is_err());
    }
}
