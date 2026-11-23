//! Les notes proches d'une note : celles dont les segments ressemblent le plus aux siens.

use std::collections::HashMap;

use domain::{MeaningModel, NotePath, NoteSummary};

use crate::{AppError, MeaningSearch, NoteIndex};

/// Les voisines d'une note par le sens, avec leur résumé de note.
#[derive(Debug)]
pub struct RelatedNotes<'a> {
    index: &'a dyn NoteIndex,
    search: &'a dyn MeaningSearch,
    model: MeaningModel,
}

impl<'a> RelatedNotes<'a> {
    /// Le cas d'usage, branché sur l'index de mots (le résumé des notes) et l'index de sens ; il
    /// compare avec les vecteurs de `model`.
    #[must_use]
    pub fn new(
        index: &'a dyn NoteIndex,
        search: &'a dyn MeaningSearch,
        model: MeaningModel,
    ) -> Self {
        Self {
            index,
            search,
            model,
        }
    }

    /// Les `limit` notes les plus proches de `note` (elle-même exclue), la plus proche d'abord.
    /// Vide si `note` n'a pas de vecteurs.
    ///
    /// # Errors
    ///
    /// [`AppError::MeaningIndex`] ou [`AppError::StorageUnavailable`] si un index ne répond pas.
    pub fn execute(&self, note: &NotePath, limit: usize) -> Result<Vec<NoteSummary>, AppError> {
        let related = self.search.related_notes(self.model, note, limit)?;
        if related.is_empty() {
            return Ok(Vec::new());
        }
        let mut notes: HashMap<NotePath, NoteSummary> = self
            .index
            .all_notes()?
            .into_iter()
            .map(|summary| (summary.path().clone(), summary))
            .collect();
        Ok(related
            .into_iter()
            .filter_map(|related| notes.remove(&related.note))
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::meaning::fixture::{Fixture, MODEL, path};

    fn titles(found: &[NoteSummary]) -> Vec<&str> {
        found.iter().map(NoteSummary::title).collect()
    }

    fn related<'a>(fixture: &'a Fixture) -> RelatedNotes<'a> {
        RelatedNotes::new(&*fixture.words, &*fixture.meaning, MODEL)
    }

    const NOTES: [(&str, &str); 4] = [
        ("a.md", "# A\n\nmot1 mot2 mot3"),
        ("b.md", "# B\n\nmot1 mot2 autre"),
        ("T/c.md", "# C\n\nmot1 truc bidule"),
        ("d.md", "# D\n\nrien en commun"),
    ];

    #[test]
    fn the_closest_notes_come_first_without_the_note_itself() {
        let fixture = Fixture::computed(&NOTES);
        let found = related(&fixture).execute(&path("a.md"), 10).unwrap();
        assert_eq!(titles(&found), ["B", "C", "D"]);
        assert_eq!(found[1].path(), &path("T/c.md"));
    }

    #[test]
    fn the_list_is_cut_at_the_limit() {
        let fixture = Fixture::computed(&NOTES);
        assert_eq!(
            related(&fixture).execute(&path("a.md"), 2).unwrap().len(),
            2
        );
        assert_eq!(
            related(&fixture).execute(&path("a.md"), 3).unwrap().len(),
            3
        );
        assert!(
            related(&fixture)
                .execute(&path("a.md"), 0)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn a_note_without_vectors_has_no_related_notes() {
        let fixture = Fixture::new(&NOTES);
        assert!(
            related(&fixture)
                .execute(&path("a.md"), 10)
                .unwrap()
                .is_empty()
        );
        let computed = Fixture::computed(&NOTES);
        assert!(
            related(&computed)
                .execute(&path("inconnue.md"), 10)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn a_note_that_left_the_word_index_is_left_out() {
        let fixture = Fixture::computed(&NOTES);
        fixture.words.remove(&[path("b.md")]).unwrap();
        let found = related(&fixture).execute(&path("a.md"), 10).unwrap();
        assert_eq!(titles(&found), ["C", "D"]);
    }
}
