//! Lister les notes de la bibliothèque.

use domain::note::{sort_by_recent, sort_pinned_first};
use domain::{Folder, NoteSummary};

use crate::{AppError, NoteStore};

/// Les notes d'un dossier : les épinglées d'abord, la plus récemment modifiée en premier.
#[derive(Debug)]
pub struct ListNotes<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ListNotes<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le résumé de chaque note du dossier : les épinglées d'abord, puis les autres ;
    /// dans chaque groupe, la plus récemment modifiée en premier.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si le dossier ne peut pas être lu.
    pub fn execute(&self, folder: &Folder) -> Result<Vec<NoteSummary>, AppError> {
        let notes = self.store.list(folder)?;
        let summaries = notes
            .into_iter()
            .map(|n| NoteSummary::new(n.path, &n.content, n.modified))
            .collect();
        Ok(sort_pinned_first(summaries))
    }
}

/// Les notes de toute la bibliothèque, pour l'ouverture rapide.
#[derive(Debug)]
pub struct ListAllNotes<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ListAllNotes<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le résumé de chaque note de chaque dossier, la plus récemment modifiée en premier.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si la bibliothèque ne peut pas être lue.
    pub fn execute(&self) -> Result<Vec<NoteSummary>, AppError> {
        let mut summaries = Vec::new();
        for folder in std::iter::once(Folder::root()).chain(self.store.folders()?) {
            summaries.extend(
                self.store
                    .list(&folder)?
                    .into_iter()
                    .map(|n| NoteSummary::new(n.path, &n.content, n.modified)),
            );
        }
        Ok(sort_by_recent(summaries))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;

    #[test]
    fn notes_are_listed_by_title_most_recent_first() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "# Alpha"), ("b.md", "texte")]);
        let notes = ListNotes::new(&store).execute(&Folder::root()).unwrap();
        let titles: Vec<_> = notes.iter().map(|n| n.title()).collect();
        assert_eq!(titles, ["Sans titre", "Alpha"]);
    }

    #[test]
    fn pinned_notes_are_listed_first() {
        let store = InMemoryNoteStore::with_notes(&[
            ("a.md", "---\npinned: true\n---\n# Alpha"),
            ("b.md", "# Bêta"),
        ]);
        let notes = ListNotes::new(&store).execute(&Folder::root()).unwrap();
        let titles: Vec<_> = notes.iter().map(|n| n.title()).collect();
        assert_eq!(titles, ["Alpha", "Bêta"]);
    }

    #[test]
    fn every_note_of_every_folder_is_listed_most_recent_first() {
        let store = InMemoryNoteStore::with_notes(&[
            ("a.md", "---\npinned: true\n---\n# Alpha"),
            ("Travail/b.md", "# Bêta"),
            ("Travail/Archives/c.md", "# Gamma"),
        ]);
        let notes = ListAllNotes::new(&store).execute().unwrap();
        let paths: Vec<_> = notes.iter().map(|n| n.path().to_path()).collect();
        assert_eq!(paths, ["Travail/Archives/c.md", "Travail/b.md", "a.md"]);
    }
}
