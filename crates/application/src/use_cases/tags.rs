//! Les étiquettes de la bibliothèque, et les notes qui portent l'une d'elles.

use domain::NoteSummary;
use domain::note::sort_pinned_first;
use domain::tag::tag_counts;

use super::ListAllNotes;
use crate::{AppError, NoteStore};

/// Les notes de toute la bibliothèque qui portent une étiquette : le filtre par étiquette.
#[derive(Debug)]
pub struct ListTaggedNotes<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ListTaggedNotes<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le résumé de chaque note qui porte l'étiquette `tag`, telle qu'écrite : les épinglées
    /// d'abord, puis les autres ; dans chaque groupe, la plus récemment modifiée en premier.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si la bibliothèque ne peut pas être lue.
    pub fn execute(&self, tag: &str) -> Result<Vec<NoteSummary>, AppError> {
        let notes = ListAllNotes::new(self.store).execute()?;
        Ok(sort_pinned_first(
            notes
                .into_iter()
                .filter(|note| note.tags().iter().any(|t| t == tag))
                .collect(),
        ))
    }
}

/// La liste des étiquettes : chaque étiquette de la bibliothèque et son nombre de notes.
#[derive(Debug)]
pub struct ListTags<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ListTags<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Chaque étiquette avec son nombre de notes, par ordre alphabétique.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si la bibliothèque ne peut pas être lue.
    pub fn execute(&self) -> Result<Vec<(String, usize)>, AppError> {
        let notes = ListAllNotes::new(self.store).execute()?;
        Ok(tag_counts(notes.iter().map(NoteSummary::tags)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;

    fn library() -> InMemoryNoteStore {
        InMemoryNoteStore::with_notes(&[
            ("a.md", "---\ntags: [perso]\n---\n# Alpha"),
            (
                "Travail/b.md",
                "---\ntags: [perso, travail]\npinned: true\n---\n# Bêta",
            ),
            ("Travail/Archives/c.md", "---\ntags: [perso]\n---\n# Gamma"),
            ("d.md", "# Delta"),
        ])
    }

    #[test]
    fn notes_of_every_folder_carrying_the_tag_are_listed_pinned_first() {
        let store = library();
        let notes = ListTaggedNotes::new(&store).execute("perso").unwrap();
        let paths: Vec<_> = notes.iter().map(|n| n.path().to_path()).collect();
        assert_eq!(paths, ["Travail/b.md", "Travail/Archives/c.md", "a.md"]);
        assert!(
            ListTaggedNotes::new(&store)
                .execute("Perso")
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn every_tag_comes_with_its_number_of_notes() {
        let store = library();
        assert_eq!(
            ListTags::new(&store).execute().unwrap(),
            [("perso".to_owned(), 3), ("travail".to_owned(), 1)]
        );
    }
}
