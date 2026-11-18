//! Retrouver des notes de tout l'espace de travail par les mots qu'elles contiennent.

use domain::note::compare;
use domain::search::{Excerpt, SearchQuery, search};
use domain::{Modified, NoteOrder, NotePath};

use crate::{AppError, NoteIndex};

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

/// Les notes de tout l'espace de travail qui contiennent tous les mots cherchés, trouvées par
/// l'index sans relire les fichiers.
#[derive(Debug)]
pub struct SearchNotes<'a> {
    index: &'a dyn NoteIndex,
}

impl<'a> SearchNotes<'a> {
    /// Le cas d'usage, branché sur l'index de l'espace de travail ouvert.
    #[must_use]
    pub fn new(index: &'a dyn NoteIndex) -> Self {
        Self { index }
    }

    /// Les notes trouvées dans l'ordre du tri de la liste, les épinglées d'abord ;
    /// [`MAX_RESULTS`] au plus.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'index ne répond pas.
    pub fn execute(
        &self,
        query: &SearchQuery,
        order: NoteOrder,
    ) -> Result<Vec<SearchResult>, AppError> {
        let mut found = self.index.search(query)?;
        found.sort_by(|(a, _), (b, _)| compare(a, b, order));
        found.truncate(MAX_RESULTS);
        // L'extrait n'est tiré que des notes montrées : l'index a déjà vérifié chaque mot.
        Ok(found
            .into_iter()
            .filter_map(|(note, content)| {
                Some(SearchResult {
                    excerpt: search(query, &content)?,
                    path: note.path().clone(),
                    title: note.title().to_owned(),
                    modified: note.modified(),
                })
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{InMemoryNoteStore, indexed};

    fn found(store: &InMemoryNoteStore, query: &str) -> Vec<String> {
        found_in_order(store, query, NoteOrder::Modified)
    }

    fn found_in_order(store: &InMemoryNoteStore, query: &str, order: NoteOrder) -> Vec<String> {
        SearchNotes::new(&indexed(store))
            .execute(&SearchQuery::parse(query).unwrap(), order)
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
    fn found_notes_follow_the_chosen_order_pinned_first() {
        let store = InMemoryNoteStore::with_notes(&[
            ("b.md", "# Bêta\npain"),
            ("a.md", "# alpha\npain"),
            ("z.md", "---\npinned: true\n---\n# Zèbre\npain"),
        ]);
        assert_eq!(
            found_in_order(&store, "pain", NoteOrder::Title),
            ["z.md | Zèbre", "a.md | alpha", "b.md | Bêta"]
        );
    }

    #[test]
    fn the_hundred_notes_returned_are_the_first_in_order() {
        let notes: Vec<(String, String)> = (0..=MAX_RESULTS)
            .map(|i| (format!("n{i}.md"), format!("# {i:03}\npain")))
            .collect();
        let refs: Vec<(&str, &str)> = notes
            .iter()
            .map(|(n, c)| (n.as_str(), c.as_str()))
            .collect();
        let store = InMemoryNoteStore::with_notes(&refs);
        let found = found_in_order(&store, "pain", NoteOrder::Title);
        assert_eq!(found[0], "n0.md | 000");
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
