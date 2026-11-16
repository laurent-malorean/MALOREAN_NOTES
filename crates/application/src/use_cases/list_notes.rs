//! Lister les notes de la bibliothèque.

use domain::NoteSummary;
use domain::note::sort_by_recent;

use crate::{AppError, NoteStore};

/// Les notes de la bibliothèque, la plus récemment modifiée en premier.
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

    /// Le résumé de chaque note, la plus récemment modifiée en premier.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si la bibliothèque ne peut pas être lue.
    pub fn execute(&self) -> Result<Vec<NoteSummary>, AppError> {
        let notes = self.store.list()?;
        let summaries = notes
            .into_iter()
            .map(|n| NoteSummary::new(n.file_name, &n.content, n.modified))
            .collect();
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
        let notes = ListNotes::new(&store).execute().unwrap();
        let titles: Vec<_> = notes.iter().map(|n| n.title()).collect();
        assert_eq!(titles, ["Sans titre", "Alpha"]);
    }
}
