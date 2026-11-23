//! La recherche mixte : la liste de la recherche par mots et celle de la recherche par le sens,
//! fusionnées par le rang réciproque en un seul classement de notes.

use std::collections::HashMap;

use domain::NoteOrder;
use domain::ranking::fuse;
use domain::search::SearchQuery;
use domain::{ContentType, MeaningModel, NotePath};

use crate::use_cases::{MAX_RESULTS, SearchByMeaning, SearchNotes, SearchResult};
use crate::{AppError, MeaningModels, MeaningSearch, ModelState, NoteIndex};

/// Pourquoi, ou non, le sens a servi à une recherche mixte.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MeaningUse {
    /// La liste du sens a été fusionnée avec celle des mots.
    Used,
    /// Le modèle n'est pas téléchargé : les mots ont répondu seuls.
    ModelMissing(MeaningModel),
    /// Aucun segment n'a encore son vecteur pour ce modèle (calcul pas commencé) : les mots ont
    /// répondu seuls.
    NotComputed(MeaningModel),
    /// Le sens a échoué (modèle illisible, index de sens en panne) ; la cause est lisible. Les
    /// mots ont répondu seuls.
    Failed(String),
}

impl MeaningUse {
    /// Pourquoi les mots ont répondu seuls, en une phrase qui dit quoi faire ; rien quand le sens
    /// a servi.
    #[must_use]
    pub fn reason(&self) -> Option<String> {
        match self {
            Self::Used => None,
            Self::ModelMissing(model) => Some(format!(
                "le modèle « {} » n'est pas téléchargé : téléchargez-le dans les réglages ; \
                 en attendant, seule la recherche par mots répond",
                model.label()
            )),
            Self::NotComputed(model) => Some(format!(
                "le sens des notes n'est pas encore calculé avec le modèle « {} » : patientez \
                 quelques instants ; en attendant, seule la recherche par mots répond",
                model.label()
            )),
            Self::Failed(cause) => Some(format!(
                "la recherche par le sens a échoué ({cause}) ; en attendant, seule la recherche \
                 par mots répond"
            )),
        }
    }
}

/// Le résultat d'une recherche mixte.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MixedResults {
    /// Les notes trouvées, la mieux classée d'abord ; [`MAX_RESULTS`] au plus.
    pub results: Vec<SearchResult>,
    /// Ce qu'il est advenu du sens : l'interface l'explique quand il manque.
    pub meaning: MeaningUse,
}

/// Cherche par les mots et par le sens à la fois. Si le sens n'est pas disponible, la recherche par
/// mots répond seule et le résultat dit pourquoi.
#[derive(Debug)]
pub struct SearchWithMeaning<'a> {
    index: &'a dyn NoteIndex,
    search: &'a dyn MeaningSearch,
    models: &'a dyn MeaningModels,
    model: MeaningModel,
    types: Vec<ContentType>,
}

impl<'a> SearchWithMeaning<'a> {
    /// Le cas d'usage, branché sur l'index de mots, l'index de sens et les modèles ; il cherche
    /// avec `model`, parmi tous les types de contenu.
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

    /// Le même cas d'usage, qui ne cherche que parmi ces types de contenu.
    #[must_use]
    pub fn among(self, types: &[ContentType]) -> Self {
        Self {
            types: types.to_vec(),
            ..self
        }
    }

    /// Les notes trouvées par les mots ou par le sens, classées par fusion. La liste des mots est
    /// prise dans l'ordre « plus récentes d'abord » ; une note trouvée par les deux montre
    /// l'extrait de la recherche par mots.
    ///
    /// # Errors
    ///
    /// [`AppError::EmptyQuestion`] si `text` ne contient aucun mot ;
    /// [`AppError::StorageUnavailable`] si l'index de mots ne répond pas. Une panne du sens n'est
    /// pas une erreur : elle est dite dans [`MixedResults::meaning`].
    pub fn execute(&self, text: &str) -> Result<MixedResults, AppError> {
        let query = SearchQuery::parse(text).ok_or(AppError::EmptyQuestion)?;
        let by_words = SearchNotes::new(self.index)
            .among(&self.types)
            .execute(&query, NoteOrder::Modified)?;
        let (by_meaning, meaning) = self.by_meaning(text)?;
        let order = fuse(&[paths(&by_words), paths(&by_meaning)]);
        let mut results: HashMap<NotePath, SearchResult> = HashMap::new();
        for result in by_words.into_iter().chain(by_meaning) {
            results.entry(result.path.clone()).or_insert(result);
        }
        Ok(MixedResults {
            results: order
                .iter()
                .filter_map(|path| results.remove(path))
                .take(MAX_RESULTS)
                .collect(),
            meaning,
        })
    }

    /// La liste du sens, ou rien avec la raison.
    fn by_meaning(&self, text: &str) -> Result<(Vec<SearchResult>, MeaningUse), AppError> {
        if self.models.state(self.model) == ModelState::NotDownloaded {
            return Ok((Vec::new(), MeaningUse::ModelMissing(self.model)));
        }
        match self.search.status(self.model) {
            Ok(status) if status.with_vector == 0 => {
                return Ok((Vec::new(), MeaningUse::NotComputed(self.model)));
            }
            Ok(_) => {}
            Err(error) => return Ok((Vec::new(), MeaningUse::Failed(error.to_string()))),
        }
        let found = SearchByMeaning::new(self.index, self.search, self.models, self.model)
            .among(&self.types)
            .execute(text, MAX_RESULTS);
        match found {
            Ok(found) => Ok((found, MeaningUse::Used)),
            Err(error @ (AppError::Meaning(_) | AppError::MeaningIndex(_))) => {
                Ok((Vec::new(), MeaningUse::Failed(error.to_string())))
            }
            Err(error) => Err(error),
        }
    }
}

fn paths(results: &[SearchResult]) -> Vec<NotePath> {
    results.iter().map(|r| r.path.clone()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::FakeMeaningModels;
    use crate::use_cases::meaning::fixture::{Fixture, MODEL, path};
    use crate::{FoundSegment, MeaningIndex, MeaningIndexError, MeaningStatus, RelatedNote};
    use domain::MeaningVector;
    use domain::search::ExcerptPart;

    const NOTES: [(&str, &str); 3] = [
        ("tarte.md", "# Tarte\n\n## Dessert\n\npommes sucre beurre"),
        ("cidre.md", "# Cidre\n\npommes fermentées"),
        ("pain.md", "# Pain\n\nfarine levain eau"),
    ];

    fn mixed(fixture: &Fixture, text: &str) -> Result<MixedResults, AppError> {
        SearchWithMeaning::new(&*fixture.words, &*fixture.meaning, &fixture.models, MODEL)
            .execute(text)
    }

    #[test]
    fn each_reason_the_meaning_is_missing_says_what_to_do() {
        assert_eq!(MeaningUse::Used.reason(), None);
        assert_eq!(
            MeaningUse::ModelMissing(MODEL).reason().unwrap(),
            "le modèle « E5 petit » n'est pas téléchargé : téléchargez-le dans les réglages ; \
             en attendant, seule la recherche par mots répond"
        );
        assert_eq!(
            MeaningUse::NotComputed(MeaningModel::Large)
                .reason()
                .unwrap(),
            "le sens des notes n'est pas encore calculé avec le modèle « E5 grand » : patientez \
             quelques instants ; en attendant, seule la recherche par mots répond"
        );
        assert_eq!(
            MeaningUse::Failed("disque plein".into()).reason().unwrap(),
            "la recherche par le sens a échoué (disque plein) ; en attendant, seule la recherche \
             par mots répond"
        );
    }

    fn titles(results: &MixedResults) -> Vec<&str> {
        results.results.iter().map(|r| r.title.as_str()).collect()
    }

    #[test]
    fn both_lists_are_fused_and_the_meaning_is_said_to_be_used() {
        let fixture = Fixture::computed(&NOTES);
        let found = mixed(&fixture, "pommes").unwrap();
        assert_eq!(found.meaning, MeaningUse::Used);
        // Les mots trouvent Tarte et Cidre ; le sens classe aussi Pain, en queue.
        let found_titles = titles(&found);
        assert_eq!(found_titles.len(), 3);
        assert!(found_titles.contains(&"Pain"));
        assert_eq!(found_titles[2], "Pain");
    }

    #[test]
    fn a_note_found_by_both_beats_a_note_found_by_one_and_keeps_the_words_excerpt() {
        let fixture = Fixture::computed(&[
            ("a.md", "# A\n\nlait pommes"),
            ("b.md", "# B\n\nlait lait lait lait lait lait"),
            ("c.md", "# C\n\npommes poires"),
        ]);
        let found = mixed(&fixture, "pommes lait").unwrap();
        assert_eq!(found.meaning, MeaningUse::Used);
        assert_eq!(found.results[0].title, "A");
        let excerpt = &found.results[0].excerpt;
        assert!(
            excerpt
                .parts()
                .iter()
                .any(|p| matches!(p, ExcerptPart::Match(_)))
        );
    }

    #[test]
    fn a_note_found_only_by_meaning_shows_the_segment_excerpt() {
        let fixture = Fixture::computed(&NOTES);
        let found = mixed(&fixture, "pommes").unwrap();
        let pain = found.results.iter().find(|r| r.title == "Pain").unwrap();
        assert_eq!(
            pain.excerpt.parts(),
            [ExcerptPart::Text("farine levain eau".to_owned())]
        );
    }

    #[test]
    fn without_the_model_the_words_answer_alone_and_the_result_says_why() {
        let fixture = Fixture {
            models: FakeMeaningModels::default(),
            ..Fixture::computed(&NOTES)
        };
        let found = mixed(&fixture, "pommes").unwrap();
        assert_eq!(found.meaning, MeaningUse::ModelMissing(MODEL));
        assert_eq!(found.results.len(), 2);
    }

    #[test]
    fn before_any_computation_the_words_answer_alone_and_the_result_says_why() {
        let fixture = Fixture::new(&NOTES);
        let found = mixed(&fixture, "pommes").unwrap();
        assert_eq!(found.meaning, MeaningUse::NotComputed(MODEL));
        assert_eq!(found.results.len(), 2);
    }

    #[test]
    fn a_computation_still_under_way_is_used() {
        let fixture = Fixture::new(&NOTES);
        let waiting = fixture.meaning.without_vector(MODEL, 1).unwrap();
        let embedder = crate::testing::FakeEmbedder::new(MODEL);
        let vector =
            crate::Embedder::embed_segments(&embedder, &[waiting[0].segment.embedding_text()])
                .unwrap();
        fixture
            .meaning
            .put_vectors(MODEL, &[(waiting[0].id, vector[0].clone())])
            .unwrap();
        assert_eq!(mixed(&fixture, "pommes").unwrap().meaning, MeaningUse::Used);
    }

    #[test]
    fn a_failing_meaning_index_is_said_and_the_words_still_answer() {
        #[derive(Debug)]
        struct Broken;
        impl MeaningSearch for Broken {
            fn nearest(
                &self,
                _: MeaningModel,
                _: &MeaningVector,
                _: usize,
            ) -> Result<Vec<FoundSegment>, MeaningIndexError> {
                Err(MeaningIndexError::Unavailable("disque plein".into()))
            }
            fn related_notes(
                &self,
                _: MeaningModel,
                _: &domain::NotePath,
                _: usize,
            ) -> Result<Vec<RelatedNote>, MeaningIndexError> {
                Err(MeaningIndexError::Unavailable("disque plein".into()))
            }
            fn status(&self, _: MeaningModel) -> Result<MeaningStatus, MeaningIndexError> {
                Err(MeaningIndexError::Unavailable("disque plein".into()))
            }
        }
        let fixture = Fixture::computed(&NOTES);
        let found = SearchWithMeaning::new(&*fixture.words, &Broken, &fixture.models, MODEL)
            .execute("pommes")
            .unwrap();
        let MeaningUse::Failed(reason) = &found.meaning else {
            panic!("{:?}", found.meaning)
        };
        assert!(reason.contains("disque plein"), "{reason}");
        assert_eq!(found.results.len(), 2);
    }

    /// L'index dit avoir des vecteurs mais la recherche échoue.
    #[derive(Debug)]
    struct FailsToSearch(crate::MemoryMeaningIndex);

    impl MeaningSearch for FailsToSearch {
        fn nearest(
            &self,
            _: MeaningModel,
            _: &MeaningVector,
            _: usize,
        ) -> Result<Vec<FoundSegment>, MeaningIndexError> {
            Err(MeaningIndexError::Unavailable("base abîmée".into()))
        }
        fn related_notes(
            &self,
            model: MeaningModel,
            note: &domain::NotePath,
            limit: usize,
        ) -> Result<Vec<RelatedNote>, MeaningIndexError> {
            self.0.related_notes(model, note, limit)
        }
        fn status(&self, model: MeaningModel) -> Result<MeaningStatus, MeaningIndexError> {
            self.0.status(model)
        }
    }

    #[test]
    fn a_meaning_search_that_fails_is_said_and_the_words_still_answer() {
        let fixture = Fixture::computed(&NOTES);
        let search = FailsToSearch(crate::MemoryMeaningIndex::default());
        // Un segment avec vecteur pour que l'état dise « calculé ».
        let note = path("a.md");
        search
            .0
            .replace_segments(&note, &domain::segments::segments("A", "x"))
            .unwrap();
        let pending = search.0.without_vector(MODEL, 1).unwrap();
        let vector =
            crate::Embedder::embed_query(&crate::testing::FakeEmbedder::new(MODEL), "x").unwrap();
        search
            .0
            .put_vectors(MODEL, &[(pending[0].id, vector)])
            .unwrap();
        let found = SearchWithMeaning::new(&*fixture.words, &search, &fixture.models, MODEL)
            .execute("pommes")
            .unwrap();
        let MeaningUse::Failed(reason) = &found.meaning else {
            panic!("{:?}", found.meaning)
        };
        assert!(reason.contains("base abîmée"), "{reason}");
        assert_eq!(found.results.len(), 2);
    }

    #[test]
    fn an_empty_question_is_refused() {
        let fixture = Fixture::computed(&NOTES);
        assert_eq!(mixed(&fixture, "  "), Err(AppError::EmptyQuestion));
        assert_eq!(mixed(&fixture, ""), Err(AppError::EmptyQuestion));
    }

    #[test]
    fn the_search_keeps_to_the_types_chosen() {
        let fixture = Fixture::computed(&NOTES);
        let found =
            SearchWithMeaning::new(&*fixture.words, &*fixture.meaning, &fixture.models, MODEL)
                .among(&[ContentType::Entry])
                .execute("pommes")
                .unwrap();
        assert!(found.results.is_empty());
        assert_eq!(found.meaning, MeaningUse::Used);
    }

    #[test]
    fn at_most_a_hundred_notes_are_returned() {
        let owned: Vec<(String, String)> = (0..=MAX_RESULTS + 5)
            .map(|i| (format!("n{i:03}.md"), format!("# N{i}\n\npommes {i}")))
            .collect();
        let refs: Vec<(&str, &str)> = owned
            .iter()
            .map(|(a, b)| (a.as_str(), b.as_str()))
            .collect();
        let fixture = Fixture::computed(&refs);
        assert_eq!(
            mixed(&fixture, "pommes").unwrap().results.len(),
            MAX_RESULTS
        );
    }

    #[test]
    fn meaning_alone_can_answer_when_no_word_matches() {
        let fixture = Fixture::computed(&NOTES);
        let found = mixed(&fixture, "sucre").unwrap();
        assert_eq!(titles(&found)[0], "Tarte");
        assert_eq!(found.meaning, MeaningUse::Used);
    }
}
