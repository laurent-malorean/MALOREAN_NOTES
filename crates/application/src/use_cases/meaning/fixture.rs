//! Un espace de travail en mémoire pour les tests de la recherche par le sens : notes, index de
//! mots et index de sens tenus ensemble, modèle « téléchargé » ou non.

use std::ops::ControlFlow;
use std::sync::Arc;

use domain::{MeaningModel, NotePath};

use crate::testing::{FakeMeaningModels, InMemoryNoteStore};
use crate::use_cases::{ComputeMeaning, ComputeOutcome, RefreshIndex};
use crate::{MemoryIndex, MemoryMeaningIndex, SegmentingIndex};

pub(super) const MODEL: MeaningModel = MeaningModel::Small;

pub(super) struct Fixture {
    pub(super) files: Arc<InMemoryNoteStore>,
    pub(super) words: Arc<MemoryIndex>,
    pub(super) meaning: Arc<MemoryMeaningIndex>,
    pub(super) models: FakeMeaningModels,
}

pub(super) fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

impl Fixture {
    /// Les notes données, segmentées, sans aucun vecteur ; le petit modèle est téléchargé.
    pub(super) fn new(notes: &[(&str, &str)]) -> Self {
        let files = Arc::new(InMemoryNoteStore::with_notes(notes));
        let words = Arc::new(MemoryIndex::default());
        let meaning = Arc::new(MemoryMeaningIndex::default());
        let index = Arc::new(SegmentingIndex::new(words.clone(), meaning.clone()));
        RefreshIndex::new(&*files, &*index).execute().unwrap();
        Self {
            files,
            words,
            meaning,
            models: FakeMeaningModels::with(MODEL),
        }
    }

    /// Les mêmes, avec tous les vecteurs du petit modèle calculés.
    pub(super) fn computed(notes: &[(&str, &str)]) -> Self {
        let fixture = Self::new(notes);
        let outcome = ComputeMeaning::new(&*fixture.meaning, &*fixture.meaning, &fixture.models)
            .execute(MODEL, &mut |_| ControlFlow::Continue(()))
            .unwrap();
        assert_eq!(outcome, ComputeOutcome::Finished);
        fixture
    }
}
