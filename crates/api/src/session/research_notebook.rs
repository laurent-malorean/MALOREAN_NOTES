//! Les cahiers de recherche de l'espace de travail ouvert, vus depuis l'interface et depuis
//! Claude : en créer un, y ajouter une entrée, lister ses entrées (fiche 0041).

use application::use_cases::{AddEntry, CreateResearchNotebook, ListEntries};
use domain::{Folder, NotePath};

use super::Session;
use crate::{ApiError, EntryItem, SavedNote};

impl Session {
    /// Crée dans `folder` un cahier de recherche titré `title` ; rend son chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; dossier invalide, stockage
    /// indisponible, aucun espace de travail ouvert.
    pub fn create_research_notebook(
        &self,
        folder: &str,
        title: &str,
    ) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let created =
            CreateResearchNotebook::new(&*store).execute(&Folder::parse(folder)?, title)?;
        Ok(SavedNote {
            path: created.to_path(),
        })
    }

    /// Ajoute à la fin du cahier `path` l'entrée `text`, à l'heure qu'il est. Rend l'entrée ajoutée.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; note qui n'est pas un cahier,
    /// entrée vide, chemin invalide, stockage indisponible, aucun
    /// espace de travail ouvert.
    pub fn add_entry(&self, path: &str, text: &str) -> Result<EntryItem, ApiError> {
        let store = self.store()?;
        let entry = AddEntry::new(&*store, &*self.clock).execute(&NotePath::parse(path)?, text)?;
        Ok(entry.into())
    }

    /// Les entrées du cahier `path`, de la plus ancienne à la plus récente.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; note qui n'est pas un cahier,
    /// chemin invalide, stockage indisponible, aucun espace de travail ouvert.
    pub fn list_entries(&self, path: &str) -> Result<Vec<EntryItem>, ApiError> {
        let store = self.store()?;
        Ok(ListEntries::new(&*store)
            .execute(&NotePath::parse(path)?)?
            .into_iter()
            .map(EntryItem::from)
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
    fn a_notebook_is_created_then_receives_entries_listed_oldest_first() {
        let session = session(&[("Labo/note.md", "# Note")]);
        assert!(session.create_research_notebook("", "Levures").is_err());
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        let created = session.create_research_notebook("Labo", "Levures").unwrap();
        assert_eq!(created.path, "Labo/levures.md");
        let added = session.add_entry(&created.path, "un\ndeux").unwrap();
        assert_eq!(
            added,
            EntryItem {
                anchor: "2026-11-16-18h30".into(),
                label: "16 novembre 2026 à 18:30".into(),
                text: "un\ndeux".into(),
                line: 11,
                number: 1,
            }
        );
        let second = session.add_entry(&created.path, "trois").unwrap();
        assert_eq!(second.anchor, "2026-11-16-18h30-2");
        assert_eq!(second.number, 2);
        assert_eq!(
            session.list_entries(&created.path).unwrap(),
            [added, second]
        );
    }

    #[test]
    fn an_entry_is_refused_with_a_readable_message() {
        let session = session(&[("note.md", "# Note")]);
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        let refused = |result: Result<EntryItem, ApiError>| result.unwrap_err().message;
        assert_eq!(
            refused(session.add_entry("note.md", "texte")),
            "cette note n'est pas un cahier de recherche"
        );
        assert_eq!(
            session.list_entries("note.md").unwrap_err().message,
            "cette note n'est pas un cahier de recherche"
        );
        assert!(session.add_entry("../x.md", "texte").is_err());
        assert!(session.list_entries("../x.md").is_err());
        assert!(session.create_research_notebook("../x", "T").is_err());
    }
}
