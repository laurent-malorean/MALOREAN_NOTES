//! Retrouver des notes par ce qu'elles disent plutôt que par leurs mots.

use std::collections::HashMap;

use domain::ranking::best_note_scores;
use domain::search::Excerpt;
use domain::{ContentType, MeaningModel, NotePath, NoteSummary};

use crate::use_cases::SearchResult;
use crate::{AppError, FoundSegment, MeaningModels, MeaningSearch, NoteIndex};

/// Combien de segments on demande à l'index de sens par note voulue : plusieurs segments d'une
/// même note peuvent se suivre en tête, et une note ne compte qu'une fois.
pub const SEGMENTS_PER_NOTE: usize = 10;

/// Les notes dont un segment ressemble le plus à la question, une note comptant par son meilleur
/// segment, montré en extrait (titre de sa section et début de son texte).
#[derive(Debug)]
pub struct SearchByMeaning<'a> {
    index: &'a dyn NoteIndex,
    search: &'a dyn MeaningSearch,
    models: &'a dyn MeaningModels,
    model: MeaningModel,
    types: Vec<ContentType>,
}

impl<'a> SearchByMeaning<'a> {
    /// Le cas d'usage, branché sur l'index de mots (le résumé des notes), l'index de sens et les
    /// modèles ; il cherche avec `model`, parmi tous les types de contenu.
    #[must_use]
    pub fn new(
        index: &'a dyn NoteIndex,
        search: &'a dyn MeaningSearch,
        models: &'a dyn MeaningModels,
        model: MeaningModel,
    ) -> Self {
        Self {
            index,
            search,
            models,
            model,
            types: ContentType::ALL.to_vec(),
        }
    }

    /// Le même cas d'usage, qui ne garde que les notes de ces types de contenu.
    #[must_use]
    pub fn among(self, types: &[ContentType]) -> Self {
        Self {
            types: types.to_vec(),
            ..self
        }
    }

    /// Les `limit` notes les mieux classées, la plus proche d'abord. Rien d'indexé encore (ou rien
    /// de calculé) : une liste vide.
    ///
    /// # Errors
    ///
    /// [`AppError::EmptyQuestion`] si la question est vide ; [`AppError::Meaning`] si le modèle
    /// n'est pas téléchargé ou ne calcule pas ; [`AppError::MeaningIndex`] ou
    /// [`AppError::StorageUnavailable`] si un index ne répond pas.
    pub fn execute(&self, question: &str, limit: usize) -> Result<Vec<SearchResult>, AppError> {
        if question.trim().is_empty() {
            return Err(AppError::EmptyQuestion);
        }
        let embedder = self.models.open(self.model)?;
        let vector = embedder.embed_query(question)?;
        let found =
            self.search
                .nearest(self.model, &vector, limit.saturating_mul(SEGMENTS_PER_NOTE))?;
        if found.is_empty() {
            return Ok(Vec::new());
        }
        let ranked = best_note_scores(found.iter().map(|f| (f.note.clone(), f.score)));
        let mut best: HashMap<&NotePath, &FoundSegment> = HashMap::new();
        for segment in &found {
            best.entry(&segment.note).or_insert(segment);
        }
        let notes: HashMap<NotePath, NoteSummary> = self
            .index
            .all_notes()?
            .into_iter()
            .map(|note| (note.path().clone(), note))
            .collect();
        Ok(ranked
            .iter()
            .filter_map(|(path, _)| {
                let note = notes
                    .get(path)
                    .filter(|n| self.types.contains(&n.content_type()))?;
                let segment = &best[path].segment;
                let excerpt = Excerpt::of_segment(note.title(), &segment.heading(), segment.text());
                let container_title = note
                    .container()
                    .and_then(|c| notes.get(c))
                    .map(|c| c.title().to_owned());
                let mut result = SearchResult::of(note, excerpt, container_title);
                // Une carte mentale est trouvée par un de ses nœuds : c'est lui qu'on ouvrira.
                result.node = segment.node().map(str::to_owned);
                Some(result)
            })
            .take(limit)
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::NoteStore;
    use crate::testing::FakeMeaningModels;
    use crate::use_cases::MAX_RESULTS;
    use crate::use_cases::meaning::fixture::{Fixture, MODEL, path};
    use domain::search::ExcerptPart;

    const NOTES: [(&str, &str); 4] = [
        (
            "tarte.md",
            "# Tarte\n\n## Dessert\n\npommes sucre beurre pommes",
        ),
        ("pain.md", "# Pain\n\nfarine levain eau"),
        ("T/soupe.md", "# Soupe\n\ncarottes poireaux eau"),
        ("vide.md", "# Vide"),
    ];

    fn titles(found: &[SearchResult]) -> Vec<String> {
        found.iter().map(|r| r.title.clone()).collect()
    }

    fn search<'a>(fixture: &'a Fixture) -> SearchByMeaning<'a> {
        SearchByMeaning::new(&*fixture.words, &*fixture.meaning, &fixture.models, MODEL)
    }

    #[test]
    fn the_notes_closest_in_meaning_come_first_with_their_summary() {
        let fixture = Fixture::computed(&NOTES);
        let found = search(&fixture).execute("pommes beurre", 10).unwrap();
        assert_eq!(found[0].title, "Tarte");
        assert_eq!(found[0].path, path("tarte.md"));
        assert_eq!(found[0].content_type, ContentType::Note);
        assert_eq!(found[0].container, None);
        assert_eq!(found[0].container_title, None);
        let modified = fixture.files.read(&path("tarte.md")).unwrap().modified;
        assert_eq!(found[0].modified, modified);
    }

    #[test]
    fn the_excerpt_is_the_section_title_then_the_start_of_the_best_segment() {
        let fixture = Fixture::computed(&NOTES);
        let found = search(&fixture).execute("pommes", 10).unwrap();
        assert_eq!(
            found[0].excerpt.parts(),
            [ExcerptPart::Text(
                "Dessert — pommes sucre beurre pommes".to_owned()
            )]
        );
        let found = search(&fixture).execute("farine", 10).unwrap();
        assert_eq!(
            found[0].excerpt.parts(),
            [ExcerptPart::Text("farine levain eau".to_owned())]
        );
    }

    #[test]
    fn a_note_counts_once_by_its_best_segment() {
        let fixture = Fixture::computed(&[
            (
                "a.md",
                "# A\n\n## Un\n\ntarte\n\n## Deux\n\ntarte tarte\n\n## Trois\n\nrien",
            ),
            ("b.md", "# B\n\ntarte lait"),
        ]);
        let found = search(&fixture).execute("tarte", 10).unwrap();
        assert_eq!(titles(&found), ["A", "B"]);
        // Le meilleur segment de A est « Deux ».
        assert_eq!(
            found[0].excerpt.parts(),
            [ExcerptPart::Text("Deux — tarte tarte".to_owned())]
        );
    }

    #[test]
    fn a_mind_map_is_found_by_its_best_node_which_is_the_one_to_open() {
        let fixture = Fixture::computed(&[
            (
                "carte.md",
                "---\ntype: carte-mentale\n---\n# Carte\n\n- Pain\n  - Levain\n    > tarte tarte\n- Eau\n",
            ),
            ("b.md", "# B\n\nlait"),
        ]);
        let found = search(&fixture).execute("tarte", 10).unwrap();
        assert_eq!(found[0].title, "Carte");
        assert_eq!(found[0].content_type, ContentType::MindMap);
        assert_eq!(found[0].node.as_deref(), Some("0.0"));
        assert_eq!(
            found[0].excerpt.parts(),
            [ExcerptPart::Text("Levain — tarte tarte".to_owned())]
        );
        assert_eq!(search(&fixture).execute("lait", 10).unwrap()[0].node, None);
    }

    #[test]
    fn the_results_are_cut_at_the_limit_after_counting_notes_not_segments() {
        let fixture = Fixture::computed(&[
            ("a.md", &format!("# A\n\n{}", "## S\n\ntarte\n\n".repeat(5))),
            ("b.md", "# B\n\ntarte lait"),
            ("c.md", "# C\n\ntarte lait lait"),
        ]);
        assert_eq!(search(&fixture).execute("tarte", 2).unwrap().len(), 2);
        assert_eq!(search(&fixture).execute("tarte", 3).unwrap().len(), 3);
        assert_eq!(search(&fixture).execute("tarte", 100).unwrap().len(), 3);
        assert!(search(&fixture).execute("tarte", 0).unwrap().is_empty());
    }

    #[test]
    fn enough_segments_are_asked_for_when_a_note_has_many_close_ones() {
        // Une note de plus de 10 segments proches ne doit pas cacher les autres notes.
        let many = format!(
            "# A\n\n{}",
            "## S\n\ntarte tarte tarte\n\n".repeat(SEGMENTS_PER_NOTE + 2)
        );
        let fixture =
            Fixture::computed(&[("a.md", &many), ("b.md", "# B\n\ntarte lait lait lait")]);
        assert_eq!(search(&fixture).execute("tarte", 2).unwrap().len(), 2);
    }

    #[test]
    fn the_search_keeps_to_the_types_chosen() {
        let fixture = Fixture::computed(&NOTES);
        let among = |types: &[ContentType]| {
            search(&fixture)
                .among(types)
                .execute("pommes", 10)
                .unwrap()
                .len()
        };
        assert_eq!(among(&[ContentType::Note]), 3);
        assert_eq!(among(&[ContentType::Entry]), 0);
        assert_eq!(among(&[]), 0);
    }

    #[test]
    fn an_empty_question_is_refused_before_anything_else() {
        let fixture = Fixture::computed(&NOTES);
        for question in ["", "   ", "\n\t"] {
            assert_eq!(
                search(&fixture).execute(question, 10),
                Err(AppError::EmptyQuestion)
            );
        }
        let without_model = Fixture {
            models: FakeMeaningModels::default(),
            ..Fixture::new(&NOTES)
        };
        assert_eq!(
            search(&without_model).execute("", 10),
            Err(AppError::EmptyQuestion)
        );
    }

    #[test]
    fn a_missing_model_is_a_typed_error() {
        let fixture = Fixture {
            models: FakeMeaningModels::default(),
            ..Fixture::computed(&NOTES)
        };
        assert_eq!(
            search(&fixture).execute("pommes", 10),
            Err(AppError::Meaning(crate::MeaningError::ModelMissing(MODEL)))
        );
    }

    #[test]
    fn nothing_computed_yet_gives_an_empty_list() {
        let fixture = Fixture::new(&NOTES);
        assert!(search(&fixture).execute("pommes", 10).unwrap().is_empty());
        let empty = Fixture::new(&[]);
        assert!(search(&empty).execute("pommes", 10).unwrap().is_empty());
    }

    #[test]
    fn a_note_that_left_the_word_index_is_left_out() {
        let fixture = Fixture::computed(&NOTES);
        fixture.words.remove(&[path("tarte.md")]).unwrap();
        let found = search(&fixture).execute("pommes", 10).unwrap();
        assert!(found.iter().all(|r| r.title != "Tarte"));
        assert!(MAX_RESULTS >= found.len());
    }
}
