//! Retrouver des notes de tout l'espace de travail par les mots qu'elles contiennent.

use std::collections::HashMap;

use domain::note::compare;
use domain::search::{Excerpt, SearchQuery, search};
use domain::{ContentType, Modified, NoteOrder, NotePath, NoteSummary};

use crate::{AppError, NoteIndex};

/// Au-delà, les notes trouvées ne sont pas montrées : la recherche doit être précisée.
pub const MAX_RESULTS: usize = 100;

/// Une note trouvée : son chemin, son titre affiché, son type de contenu, son conteneur, sa
/// date et un extrait.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchResult {
    /// Le dossier et le nom de fichier de la note.
    pub path: NotePath,
    /// Le titre affiché.
    pub title: String,
    /// Son type de contenu.
    pub content_type: ContentType,
    /// L'élément auquel elle appartient (le cahier de recherche d'une entrée) ; aucun pour
    /// une note.
    pub container: Option<NotePath>,
    /// Le titre affiché de son conteneur, s'il en a un.
    pub container_title: Option<String>,
    /// Le chemin du nœud d'une carte mentale qu'elle désigne (`1.0.2`) ; aucun pour le reste.
    pub node: Option<String>,
    /// La date de dernière modification.
    pub modified: Modified,
    /// Le passage autour du premier mot trouvé.
    pub excerpt: Excerpt,
}

impl SearchResult {
    /// Le résultat pour `note`, avec son extrait et le titre de son conteneur s'il en a un.
    pub(crate) fn of(
        note: &NoteSummary,
        excerpt: Excerpt,
        container_title: Option<String>,
    ) -> Self {
        Self {
            excerpt,
            path: note.path().clone(),
            title: note.title().to_owned(),
            content_type: note.content_type(),
            container_title,
            container: note.container().cloned(),
            node: note.node().map(str::to_owned),
            modified: note.modified(),
        }
    }
}

/// Les notes de tout l'espace de travail qui contiennent tous les mots cherchés, trouvées par
/// l'index sans relire les fichiers.
#[derive(Debug)]
pub struct SearchNotes<'a> {
    index: &'a dyn NoteIndex,
    types: Vec<ContentType>,
}

impl<'a> SearchNotes<'a> {
    /// Le cas d'usage, branché sur l'index de l'espace de travail ouvert ; il cherche parmi tous
    /// les types de contenu.
    #[must_use]
    pub fn new(index: &'a dyn NoteIndex) -> Self {
        Self {
            index,
            types: ContentType::ALL.to_vec(),
        }
    }

    /// Le même cas d'usage, qui ne cherche que parmi ces types de contenu.
    #[must_use]
    pub fn among(self, types: &[ContentType]) -> Self {
        Self {
            types: types.to_vec(),
            ..self
        }
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
        let mut found = self.index.search(query, &self.types)?;
        found.sort_by(|(a, _), (b, _)| compare(a, b, order));
        found.truncate(MAX_RESULTS);
        let titles: HashMap<NotePath, String> =
            if found.iter().any(|(n, _)| n.container().is_some()) {
                self.index
                    .all_notes()?
                    .into_iter()
                    .map(|note| (note.path().clone(), note.title().to_owned()))
                    .collect()
            } else {
                HashMap::new()
            };
        // L'extrait n'est tiré que des notes montrées : l'index a déjà vérifié chaque mot.
        Ok(found
            .into_iter()
            .filter_map(|(note, content)| {
                let container_title = note.container().and_then(|c| titles.get(c).cloned());
                Some(SearchResult::of(
                    &note,
                    search(query, &content)?,
                    container_title,
                ))
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
    fn a_result_carries_its_type_and_container() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "---\ntype: kanban\n---\n# A\npain")]);
        let found = SearchNotes::new(&indexed(&store))
            .execute(&SearchQuery::parse("pain").unwrap(), NoteOrder::Modified)
            .unwrap();
        assert_eq!(found[0].content_type, ContentType::Note);
        assert_eq!(found[0].container, None);
        assert_eq!(found[0].container_title, None);
    }

    #[test]
    fn an_entry_is_found_with_its_notebook_and_its_title() {
        let notebook = "---\ntype: cahier-de-recherche\n---\n# Levures\n## 2026\n### Novembre\n\
                        #### Lundi 16\n- 09:42 - du pain\n- 10:00 - du levain";
        let store = InMemoryNoteStore::with_notes(&[("labo.md", notebook)]);
        let found = SearchNotes::new(&indexed(&store))
            .among(&[ContentType::Entry])
            .execute(&SearchQuery::parse("pain").unwrap(), NoteOrder::Modified)
            .unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "16 novembre 2026 à 09:42");
        assert_eq!(found[0].content_type, ContentType::Entry);
        assert_eq!(found[0].container, Some(found[0].path.clone()));
        assert_eq!(found[0].container_title.as_deref(), Some("Levures"));
    }

    #[test]
    fn the_search_keeps_to_the_types_chosen() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "pain")]);
        let index = indexed(&store);
        let query = SearchQuery::parse("pain").unwrap();
        let among = |types: &[ContentType]| {
            SearchNotes::new(&index)
                .among(types)
                .execute(&query, NoteOrder::Modified)
                .unwrap()
                .len()
        };
        assert_eq!(among(&[ContentType::Note]), 1);
        assert_eq!(among(&[]), 0);
    }

    #[test]
    fn nothing_is_found_when_no_note_has_every_word() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "pain")]);
        assert!(found(&store, "pain lait").is_empty());
    }
}
