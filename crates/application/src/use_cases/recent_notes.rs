//! Les notes récentes : l'interface sait lesquelles ; la bibliothèque dit ce qu'elles sont devenues.

use domain::NoteSummary;

use super::ListAllNotes;
use crate::{AppError, NoteStore};

/// Le résumé des notes récentes, telles qu'elles sont maintenant dans la bibliothèque.
#[derive(Debug)]
pub struct ListRecentNotes<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ListRecentNotes<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le résumé de chaque note de `paths`, dans cet ordre ; celles qui n'existent plus
    /// (corbeille, suppression) sont omises.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si la bibliothèque ne peut pas être lue.
    pub fn execute(&self, paths: &[String]) -> Result<Vec<NoteSummary>, AppError> {
        let mut notes = ListAllNotes::new(self.store).execute()?;
        Ok(paths
            .iter()
            .filter_map(|path| {
                let found = notes
                    .iter()
                    .position(|note| note.path().to_path() == *path)?;
                Some(notes.swap_remove(found))
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;

    #[test]
    fn recent_notes_come_in_the_given_order_without_the_missing_ones() {
        let store = InMemoryNoteStore::with_notes(&[
            ("a.md", "# Alpha"),
            ("Travail/b.md", "# Bêta"),
            ("Travail/Archives/c.md", "# Gamma"),
        ]);
        let paths = [
            "a.md",
            "disparue.md",
            "Travail/Archives/c.md",
            "Travail/b.md",
        ]
        .map(String::from);
        let notes = ListRecentNotes::new(&store).execute(&paths).unwrap();
        let titles: Vec<_> = notes.iter().map(NoteSummary::title).collect();
        assert_eq!(titles, ["Alpha", "Gamma", "Bêta"]);
        assert!(
            ListRecentNotes::new(&store)
                .execute(&[])
                .unwrap()
                .is_empty()
        );
    }
}
