//! Lister les notes de la bibliothèque.

use domain::note::sort_pinned_first;
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
}
