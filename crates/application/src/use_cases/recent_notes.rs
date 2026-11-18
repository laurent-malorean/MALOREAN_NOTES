//! Les notes récentes : l'interface sait lesquelles ; l'espace de travail dit ce qu'elles sont devenues.

use domain::NoteSummary;

use super::ListAllNotes;
use crate::{AppError, NoteIndex};

/// Le résumé des notes récentes, telles qu'elles sont maintenant dans l'espace de travail.
#[derive(Debug)]
pub struct ListRecentNotes<'a> {
    index: &'a dyn NoteIndex,
}

impl<'a> ListRecentNotes<'a> {
    /// Le cas d'usage, branché sur l'index de l'espace de travail ouvert.
    #[must_use]
    pub fn new(index: &'a dyn NoteIndex) -> Self {
        Self { index }
    }

    /// Le résumé de chaque note de `paths`, dans cet ordre ; celles qui n'existent plus
    /// (corbeille, suppression) sont omises.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'index ne répond pas.
    pub fn execute(&self, paths: &[String]) -> Result<Vec<NoteSummary>, AppError> {
        let mut notes = ListAllNotes::new(self.index).execute()?;
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
    use crate::testing::{InMemoryNoteStore, indexed};

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
        let notes = ListRecentNotes::new(&indexed(&store))
            .execute(&paths)
            .unwrap();
        let titles: Vec<_> = notes.iter().map(NoteSummary::title).collect();
        assert_eq!(titles, ["Alpha", "Gamma", "Bêta"]);
        assert!(
            ListRecentNotes::new(&indexed(&store))
                .execute(&[])
                .unwrap()
                .is_empty()
        );
    }
}
