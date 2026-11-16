//! Retrouver des notes de toute la bibliothèque par les mots qu'elles contiennent.

use domain::search::{Excerpt, SearchQuery, search};
use domain::title::displayed_title;
use domain::{Folder, Modified, NotePath};

use crate::{AppError, NoteStore};

/// Au-delà, les notes trouvées ne sont pas montrées : la recherche doit être précisée.
pub const MAX_RESULTS: usize = 100;

/// Une note trouvée : son chemin, son titre affiché, sa date et un extrait.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchResult {
    /// Le dossier et le nom de fichier de la note.
    pub path: NotePath,
    /// Le titre affiché.
    pub title: String,
    /// La date de dernière modification.
    pub modified: Modified,
    /// Le passage autour du premier mot trouvé.
    pub excerpt: Excerpt,
}

/// Les notes de toute la bibliothèque qui contiennent tous les mots cherchés.
///
/// Aujourd'hui, chaque recherche relit toutes les notes ; un index pourra prendre
/// le relais sans que l'appelant change.
#[derive(Debug)]
pub struct SearchNotes<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> SearchNotes<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Les notes trouvées, la plus récemment modifiée en premier, [`MAX_RESULTS`] au plus.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si la bibliothèque ne peut pas être lue.
    pub fn execute(&self, query: &SearchQuery) -> Result<Vec<SearchResult>, AppError> {
        let mut found = Vec::new();
        let folders = std::iter::once(Folder::root()).chain(self.store.folders()?);
        for folder in folders {
            for note in self.store.list(&folder)? {
                if let Some(excerpt) = search(query, &note.content) {
                    found.push(SearchResult {
                        title: displayed_title(&note.content),
                        path: note.path,
                        modified: note.modified,
                        excerpt,
                    });
                }
            }
        }
        // Tri stable : à date égale, l'ordre des dossiers est gardé.
        found.sort_by_key(|result| std::cmp::Reverse(result.modified));
        found.truncate(MAX_RESULTS);
        Ok(found)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;

    fn found(store: &InMemoryNoteStore, query: &str) -> Vec<String> {
        SearchNotes::new(store)
            .execute(&SearchQuery::parse(query).unwrap())
            .unwrap()
            .into_iter()
            .map(|r| format!("{} | {}", r.path.to_path(), r.title))
            .collect()
    }

    #[test]
    fn notes_of_every_folder_are_searched_most_recent_first() {
        let store = InMemoryNoteStore::with_notes(&[
            ("a.md", "# Courses\npain"),
            ("Travail/b.md", "# Réunion\nacheter du pain"),
            ("Travail/Archives/c.md", "# Vieux\npain rassis"),
            ("d.md", "# Autre\nlait"),
        ]);
        assert_eq!(
            found(&store, "PAIN"),
            [
                "Travail/Archives/c.md | Vieux",
                "Travail/b.md | Réunion",
                "a.md | Courses"
            ]
        );
    }

    #[test]
    fn at_most_a_hundred_notes_are_returned() {
        let notes: Vec<(String, &str)> = (0..=MAX_RESULTS)
            .map(|i| (format!("n{i}.md"), "pain"))
            .collect();
        let refs: Vec<(&str, &str)> = notes.iter().map(|(n, c)| (n.as_str(), *c)).collect();
        let store = InMemoryNoteStore::with_notes(&refs);
        assert_eq!(found(&store, "pain").len(), MAX_RESULTS);
    }

    #[test]
    fn nothing_is_found_when_no_note_has_every_word() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "pain")]);
        assert!(found(&store, "pain lait").is_empty());
    }
}
