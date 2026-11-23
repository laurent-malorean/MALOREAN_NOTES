//! Calculer les vecteurs de sens des segments qui n'en ont pas encore, pour un modèle.

use std::ops::ControlFlow;

use domain::{MeaningModel, MeaningVector};

use crate::{
    AppError, MeaningError, MeaningIndex, MeaningModels, MeaningSearch, ModelState, SegmentId,
};

/// Combien de segments le moteur de sens calcule d'un coup (fiche 0042).
pub const BATCH_SIZE: usize = 16;

/// Où en est le calcul : segments qui ont leur vecteur, sur segments à calculer en tout.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ComputeProgress {
    /// Les segments qui ont leur vecteur.
    pub done: usize,
    /// Les segments gardés par l'index de sens.
    pub total: usize,
}

/// Ce que l'appelant répond à chaque avancement : continuer, ou arrêter le calcul.
pub type ComputeListener<'a> = &'a mut dyn FnMut(ComputeProgress) -> ControlFlow<()>;

/// Comment le calcul s'est terminé (sans erreur).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ComputeOutcome {
    /// Tous les segments ont leur vecteur.
    Finished,
    /// L'appelant a arrêté le calcul entre deux lots ; tout ce qui est calculé est gardé.
    Stopped,
    /// Le modèle n'est pas téléchargé : rien n'a été calculé.
    ModelNotDownloaded,
}

/// Calcule les vecteurs de sens manquants d'un modèle, par lots de [`BATCH_SIZE`] segments, les
/// plus anciennement gardés d'abord. Synchrone : l'appelant le lance où il veut (un fil
/// d'arrière-plan) et peut l'arrêter à chaque avancement.
#[derive(Debug)]
pub struct ComputeMeaning<'a> {
    index: &'a dyn MeaningIndex,
    search: &'a dyn MeaningSearch,
    models: &'a dyn MeaningModels,
}

impl<'a> ComputeMeaning<'a> {
    /// Le cas d'usage, branché sur l'index de sens (écriture et lecture) et les modèles.
    #[must_use]
    pub fn new(
        index: &'a dyn MeaningIndex,
        search: &'a dyn MeaningSearch,
        models: &'a dyn MeaningModels,
    ) -> Self {
        Self {
            index,
            search,
            models,
        }
    }

    /// Calcule jusqu'à ce qu'il n'y ait plus rien à calculer. `progress` reçoit l'avancement avant
    /// le premier lot puis après chacun, et répond `Break` pour arrêter.
    ///
    /// # Errors
    ///
    /// [`AppError::Meaning`] si le modèle ne se charge pas ou si le calcul échoue ;
    /// [`AppError::MeaningIndex`] si l'index de sens ne répond pas. Les lots déjà rangés restent.
    pub fn execute(
        &self,
        model: MeaningModel,
        progress: ComputeListener<'_>,
    ) -> Result<ComputeOutcome, AppError> {
        if self.models.state(model) == ModelState::NotDownloaded {
            return Ok(ComputeOutcome::ModelNotDownloaded);
        }
        let embedder = self.models.open(model)?;
        if self.report(model, progress)?.is_break() {
            return Ok(ComputeOutcome::Stopped);
        }
        loop {
            let waiting = self.index.without_vector(model, BATCH_SIZE)?;
            if waiting.is_empty() {
                return Ok(ComputeOutcome::Finished);
            }
            let texts: Vec<String> = waiting
                .iter()
                .map(|pending| pending.segment.embedding_text())
                .collect();
            let vectors = embedder.embed_segments(&texts)?;
            if vectors.len() != waiting.len() {
                return Err(MeaningError::ComputationFailed(format!(
                    "{} vecteurs reçus pour {} segments",
                    vectors.len(),
                    waiting.len()
                ))
                .into());
            }
            let given: Vec<(SegmentId, MeaningVector)> = waiting
                .iter()
                .map(|pending| pending.id)
                .zip(vectors)
                .collect();
            self.index.put_vectors(model, &given)?;
            if self.report(model, progress)?.is_break() {
                return Ok(ComputeOutcome::Stopped);
            }
        }
    }

    fn report(
        &self,
        model: MeaningModel,
        progress: ComputeListener<'_>,
    ) -> Result<ControlFlow<()>, AppError> {
        let status = self.search.status(model)?;
        Ok(progress(ComputeProgress {
            done: status.with_vector,
            total: status.segments,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{FakeEmbedder, FakeMeaningModels};
    use crate::use_cases::meaning::fixture::{Fixture, MODEL};
    use crate::{Embedder, MeaningIndexError};
    use std::sync::{Arc, Mutex};

    fn notes(count: usize) -> Vec<(String, String)> {
        (0..count)
            .map(|i| (format!("n{i:02}.md"), format!("# N{i}\n\ntexte {i}")))
            .collect()
    }

    fn fixture(count: usize) -> Fixture {
        let owned = notes(count);
        let refs: Vec<(&str, &str)> = owned
            .iter()
            .map(|(a, b)| (a.as_str(), b.as_str()))
            .collect();
        Fixture::new(&refs)
    }

    fn compute(
        fixture: &Fixture,
        listener: impl FnMut(ComputeProgress) -> ControlFlow<()>,
    ) -> Result<ComputeOutcome, AppError> {
        let mut listener = listener;
        ComputeMeaning::new(&*fixture.meaning, &*fixture.meaning, &fixture.models)
            .execute(MODEL, &mut listener)
    }

    fn with_vector(fixture: &Fixture) -> usize {
        fixture.meaning.status(MODEL).unwrap().with_vector
    }

    #[test]
    fn every_segment_gets_its_vector_in_batches_of_sixteen() {
        let fixture = fixture(40);
        let mut seen = Vec::new();
        let outcome = compute(&fixture, |p| {
            seen.push((p.done, p.total));
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Ok(ComputeOutcome::Finished));
        assert_eq!(seen, [(0, 40), (16, 40), (32, 40), (40, 40)]);
        assert_eq!(with_vector(&fixture), 40);
        assert_eq!(BATCH_SIZE, 16);
    }

    #[test]
    fn exactly_one_batch_is_one_step_and_nothing_to_do_is_no_step_after_the_first_report() {
        let fixture = fixture(16);
        let mut seen = Vec::new();
        compute(&fixture, |p| {
            seen.push(p.done);
            ControlFlow::Continue(())
        })
        .unwrap();
        assert_eq!(seen, [0, 16]);
        let mut again = Vec::new();
        let outcome = compute(&fixture, |p| {
            again.push((p.done, p.total));
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Ok(ComputeOutcome::Finished));
        assert_eq!(again, [(16, 16)]);
        let empty = Fixture::new(&[]);
        assert_eq!(
            compute(&empty, |_| ControlFlow::Continue(())),
            Ok(ComputeOutcome::Finished)
        );
    }

    #[test]
    fn the_vectors_are_those_of_the_full_heading_and_text() {
        let fixture = Fixture::new(&[("a.md", "# Tarte\n\n## Dessert\n\npommes")]);
        compute(&fixture, |_| ControlFlow::Continue(())).unwrap();
        let embedder = FakeEmbedder::new(MODEL);
        let expected = embedder
            .embed_segments(&["Tarte > Dessert\n\npommes".to_owned()])
            .unwrap();
        let found = fixture.meaning.nearest(MODEL, &expected[0], 1).unwrap();
        assert!((found[0].score - 1.0).abs() < 1e-5, "{}", found[0].score);
    }

    #[test]
    fn the_caller_can_stop_before_the_first_batch() {
        let fixture = fixture(40);
        let outcome = compute(&fixture, |_| ControlFlow::Break(()));
        assert_eq!(outcome, Ok(ComputeOutcome::Stopped));
        assert_eq!(with_vector(&fixture), 0);
    }

    #[test]
    fn the_caller_can_stop_between_two_batches_and_nothing_is_lost() {
        let fixture = fixture(40);
        let mut steps = 0;
        let outcome = compute(&fixture, |_| {
            steps += 1;
            if steps == 2 {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        });
        assert_eq!(outcome, Ok(ComputeOutcome::Stopped));
        assert_eq!(with_vector(&fixture), 16);
        // Reprise : le reste seulement.
        let mut again = Vec::new();
        let outcome = compute(&fixture, |p| {
            again.push(p.done);
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Ok(ComputeOutcome::Finished));
        assert_eq!(again, [16, 32, 40]);
    }

    #[test]
    fn a_model_that_is_not_downloaded_does_nothing_and_says_so() {
        let fixture = Fixture {
            models: FakeMeaningModels::default(),
            ..fixture(5)
        };
        let mut called = false;
        let outcome = compute(&fixture, |_| {
            called = true;
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Ok(ComputeOutcome::ModelNotDownloaded));
        assert!(!called);
        assert_eq!(with_vector(&fixture), 0);
    }

    /// Des modèles dont le moteur échoue au deuxième lot, ou rend un vecteur de moins.
    #[derive(Debug)]
    struct Flaky {
        calls: Mutex<usize>,
        fail_at: Option<usize>,
        short: bool,
    }

    impl Embedder for Flaky {
        fn model(&self) -> domain::MeaningModel {
            MODEL
        }
        fn embed_segments(
            &self,
            segments: &[String],
        ) -> Result<Vec<domain::MeaningVector>, MeaningError> {
            let mut calls = self.calls.lock().unwrap();
            *calls += 1;
            if Some(*calls) == self.fail_at {
                return Err(MeaningError::ComputationFailed("mémoire pleine".into()));
            }
            let mut vectors = FakeEmbedder::new(MODEL).embed_segments(segments)?;
            if self.short {
                vectors.pop();
            }
            Ok(vectors)
        }
        fn embed_query(&self, query: &str) -> Result<domain::MeaningVector, MeaningError> {
            FakeEmbedder::new(MODEL).embed_query(query)
        }
    }

    #[derive(Debug)]
    struct FlakyModels(Arc<Flaky>);

    impl MeaningModels for FlakyModels {
        fn state(&self, _: domain::MeaningModel) -> ModelState {
            ModelState::Downloaded
        }
        fn download(
            &self,
            _: domain::MeaningModel,
            _: crate::ProgressListener<'_>,
        ) -> Result<(), MeaningError> {
            Ok(())
        }
        fn remove(&self, _: domain::MeaningModel) -> Result<(), MeaningError> {
            Ok(())
        }
        fn open(&self, _: domain::MeaningModel) -> Result<Arc<dyn Embedder>, MeaningError> {
            Ok(self.0.clone())
        }
    }

    fn run_with(fixture: &Fixture, embedder: Flaky) -> Result<ComputeOutcome, AppError> {
        let models = FlakyModels(Arc::new(embedder));
        ComputeMeaning::new(&*fixture.meaning, &*fixture.meaning, &models)
            .execute(MODEL, &mut |_| ControlFlow::Continue(()))
    }

    #[test]
    fn a_computation_error_stops_and_keeps_the_batches_already_stored() {
        let fixture = fixture(40);
        let outcome = run_with(
            &fixture,
            Flaky {
                calls: Mutex::new(0),
                fail_at: Some(2),
                short: false,
            },
        );
        assert_eq!(
            outcome,
            Err(AppError::Meaning(MeaningError::ComputationFailed(
                "mémoire pleine".into()
            )))
        );
        assert_eq!(with_vector(&fixture), 16);
    }

    #[test]
    fn fewer_vectors_than_segments_is_an_error_not_an_endless_loop() {
        let fixture = fixture(5);
        let outcome = run_with(
            &fixture,
            Flaky {
                calls: Mutex::new(0),
                fail_at: None,
                short: true,
            },
        );
        assert_eq!(
            outcome,
            Err(AppError::Meaning(MeaningError::ComputationFailed(
                "4 vecteurs reçus pour 5 segments".into()
            )))
        );
        assert_eq!(with_vector(&fixture), 0);
    }

    #[test]
    fn an_unavailable_index_is_reported() {
        let error = AppError::from(MeaningIndexError::Unavailable("x".into()));
        assert!(matches!(error, AppError::MeaningIndex(_)));
    }
}
