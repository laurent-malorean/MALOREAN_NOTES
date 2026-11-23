//! Les modèles de sens et l'index de sens : où en est tout cela, choisir, télécharger, supprimer,
//! reconstruire.

use domain::MeaningModel;

use crate::{
    AppError, MeaningIndex, MeaningModels, MeaningSearch, ModelState, NoteIndex, Preferences,
    ProgressListener, note_segments,
};

/// Ce qu'on sait d'un modèle de sens proposé.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelOverview {
    /// Le modèle.
    pub model: MeaningModel,
    /// Téléchargé ou non.
    pub state: ModelState,
    /// Son poids à télécharger, en octets.
    pub size: u64,
}

/// L'état de la recherche par le sens, pour l'écran des réglages.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MeaningOverview {
    /// Le modèle choisi.
    pub chosen: MeaningModel,
    /// Chaque modèle proposé, dans l'ordre de [`MeaningModel::ALL`].
    pub models: Vec<ModelOverview>,
    /// Les segments gardés par l'index de sens de l'espace de travail ouvert.
    pub segments: usize,
    /// Parmi eux, ceux qui ont leur vecteur pour le modèle choisi.
    pub with_vector: usize,
    /// Les notes qui ont au moins un segment.
    pub notes: usize,
}

/// Lit l'état de la recherche par le sens : modèle choisi, état et poids de chaque modèle,
/// avancement de l'index de sens pour le modèle choisi.
#[derive(Debug)]
pub struct ReadMeaningStatus<'a> {
    preferences: &'a dyn Preferences,
    models: &'a dyn MeaningModels,
    search: &'a dyn MeaningSearch,
}

impl<'a> ReadMeaningStatus<'a> {
    /// Le cas d'usage, branché sur les préférences, les modèles et l'index de sens ouvert.
    #[must_use]
    pub fn new(
        preferences: &'a dyn Preferences,
        models: &'a dyn MeaningModels,
        search: &'a dyn MeaningSearch,
    ) -> Self {
        Self {
            preferences,
            models,
            search,
        }
    }

    /// L'état, tel qu'il est maintenant.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si les préférences ne se lisent pas ;
    /// [`AppError::MeaningIndex`] si l'index de sens ne répond pas.
    pub fn execute(&self) -> Result<MeaningOverview, AppError> {
        let chosen = self.preferences.meaning_model()?;
        let status = self.search.status(chosen)?;
        Ok(MeaningOverview {
            chosen,
            models: MeaningModel::ALL
                .into_iter()
                .map(|model| ModelOverview {
                    model,
                    state: self.models.state(model),
                    size: model.total_size(),
                })
                .collect(),
            segments: status.segments,
            with_vector: status.with_vector,
            notes: status.notes,
        })
    }
}

/// Choisit le modèle de sens de toute l'application. Les vecteurs des autres modèles restent
/// gardés ; le calcul du nouveau se lance à part (`ComputeMeaning`).
#[derive(Debug)]
pub struct ChooseModel<'a> {
    preferences: &'a dyn Preferences,
}

impl<'a> ChooseModel<'a> {
    /// Le cas d'usage, branché sur les préférences.
    #[must_use]
    pub fn new(preferences: &'a dyn Preferences) -> Self {
        Self { preferences }
    }

    /// `model` devient le modèle choisi.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si les préférences ne s'écrivent pas.
    pub fn execute(&self, model: MeaningModel) -> Result<(), AppError> {
        Ok(self.preferences.save_meaning_model(model)?)
    }
}

/// Télécharge un modèle de sens, avec son avancement.
#[derive(Debug)]
pub struct DownloadModel<'a> {
    models: &'a dyn MeaningModels,
}

impl<'a> DownloadModel<'a> {
    /// Le cas d'usage, branché sur les modèles.
    #[must_use]
    pub fn new(models: &'a dyn MeaningModels) -> Self {
        Self { models }
    }

    /// Télécharge `model` ; `progress` reçoit l'avancement et répond `Break` pour interrompre.
    ///
    /// # Errors
    ///
    /// [`AppError::Meaning`] : téléchargement échoué, interrompu ou fichier refusé ; rien de
    /// partiel n'est gardé.
    pub fn execute(
        &self,
        model: MeaningModel,
        progress: ProgressListener<'_>,
    ) -> Result<(), AppError> {
        Ok(self.models.download(model, progress)?)
    }
}

/// Supprime un modèle de sens du Mac. Le modèle choisi peut l'être aussi : la recherche par le
/// sens se grise alors jusqu'à un nouveau téléchargement ; ses vecteurs restent dans l'index.
#[derive(Debug)]
pub struct RemoveModel<'a> {
    models: &'a dyn MeaningModels,
}

impl<'a> RemoveModel<'a> {
    /// Le cas d'usage, branché sur les modèles.
    #[must_use]
    pub fn new(models: &'a dyn MeaningModels) -> Self {
        Self { models }
    }

    /// Supprime `model` ; un modèle absent n'est pas une erreur.
    ///
    /// # Errors
    ///
    /// [`AppError::Meaning`] si le disque refuse.
    pub fn execute(&self, model: MeaningModel) -> Result<(), AppError> {
        Ok(self.models.remove(model)?)
    }
}

/// « Reconstruire l'index de sens » : refait les segments de toutes les notes depuis l'index de
/// mots et efface les vecteurs du modèle choisi, que le calcul refera ensuite. Les vecteurs des
/// autres modèles, pour les segments qui n'ont pas changé, restent.
#[derive(Debug)]
pub struct RebuildMeaning<'a> {
    words: &'a dyn NoteIndex,
    meaning: &'a dyn MeaningIndex,
    preferences: &'a dyn Preferences,
}

impl<'a> RebuildMeaning<'a> {
    /// Le cas d'usage, branché sur l'index de mots, l'index de sens et les préférences.
    #[must_use]
    pub fn new(
        words: &'a dyn NoteIndex,
        meaning: &'a dyn MeaningIndex,
        preferences: &'a dyn Preferences,
    ) -> Self {
        Self {
            words,
            meaning,
            preferences,
        }
    }

    /// Efface les vecteurs du modèle choisi, puis range les segments de chaque note de l'index
    /// de mots.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'index de mots ou les préférences ne répondent pas ;
    /// [`AppError::MeaningIndex`] si l'index de sens ne répond pas.
    pub fn execute(&self) -> Result<(), AppError> {
        self.meaning
            .clear_vectors(self.preferences.meaning_model()?)?;
        for note in self.words.all_notes()? {
            let Some(content) = self.words.content(note.path())? else {
                continue;
            };
            self.meaning
                .replace_segments(note.path(), &note_segments(note.path(), &content))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::MeaningError;
    use crate::testing::{FakeMeaningModels, FakePreferences};
    use crate::use_cases::ComputeMeaning;
    use crate::use_cases::meaning::fixture::{Fixture, MODEL, path};
    use std::ops::ControlFlow;

    const LARGE: MeaningModel = MeaningModel::Large;

    #[test]
    fn the_status_shows_the_chosen_model_every_model_and_the_index_progress() {
        let fixture = Fixture::new(&[
            ("a.md", "# A\n\n## Un\n\nx\n\n## Deux\n\ny"),
            ("b.md", "# B\n\nz"),
        ]);
        let preferences = FakePreferences::default();
        let status = ReadMeaningStatus::new(&preferences, &fixture.models, &*fixture.meaning);
        let overview = status.execute().unwrap();
        assert_eq!(overview.chosen, MeaningModel::DEFAULT);
        assert_eq!(
            overview.models,
            [
                ModelOverview {
                    model: MeaningModel::Small,
                    state: ModelState::Downloaded,
                    size: MeaningModel::Small.total_size()
                },
                ModelOverview {
                    model: LARGE,
                    state: ModelState::NotDownloaded,
                    size: LARGE.total_size()
                }
            ]
        );
        assert_eq!(
            (overview.segments, overview.with_vector, overview.notes),
            (3, 0, 2)
        );
        ComputeMeaning::new(&*fixture.meaning, &*fixture.meaning, &fixture.models)
            .execute(MODEL, &mut |_| ControlFlow::Continue(()))
            .unwrap();
        assert_eq!(status.execute().unwrap().with_vector, 3);
        // Le modèle choisi décide quels vecteurs sont comptés.
        ChooseModel::new(&preferences).execute(LARGE).unwrap();
        let overview = status.execute().unwrap();
        assert_eq!(overview.chosen, LARGE);
        assert_eq!((overview.segments, overview.with_vector), (3, 0));
    }

    #[test]
    fn choosing_a_model_is_kept_for_the_whole_application() {
        let preferences = FakePreferences::default();
        ChooseModel::new(&preferences).execute(LARGE).unwrap();
        assert_eq!(preferences.meaning_model().unwrap(), LARGE);
        ChooseModel::new(&preferences).execute(MODEL).unwrap();
        assert_eq!(preferences.meaning_model().unwrap(), MODEL);
    }

    #[test]
    fn downloading_reports_the_progress_and_can_be_interrupted() {
        let models = FakeMeaningModels::default();
        let mut steps = 0;
        let interrupted = DownloadModel::new(&models).execute(MODEL, &mut |_| {
            steps += 1;
            ControlFlow::Break(())
        });
        assert_eq!(
            interrupted,
            Err(AppError::Meaning(MeaningError::DownloadInterrupted(MODEL)))
        );
        assert_eq!(steps, 1);
        assert_eq!(models.state(MODEL), ModelState::NotDownloaded);
        let mut last = None;
        DownloadModel::new(&models)
            .execute(MODEL, &mut |p| {
                last = Some((p.done, p.total));
                ControlFlow::Continue(())
            })
            .unwrap();
        assert_eq!(last, Some((MODEL.total_size(), MODEL.total_size())));
        assert_eq!(models.state(MODEL), ModelState::Downloaded);
    }

    #[test]
    fn any_model_can_be_removed_even_the_chosen_one_and_an_absent_one() {
        let models = FakeMeaningModels::with(MODEL);
        RemoveModel::new(&models).execute(LARGE).unwrap();
        assert_eq!(models.state(MODEL), ModelState::Downloaded);
        RemoveModel::new(&models).execute(MODEL).unwrap();
        assert_eq!(models.state(MODEL), ModelState::NotDownloaded);
    }

    #[test]
    fn rebuilding_redoes_the_segments_and_erases_the_vectors_of_the_chosen_model_only() {
        let fixture = Fixture::computed(&[("a.md", "# A\n\ntexte"), ("T/b.md", "# B\n\nautre")]);
        // Le grand modèle a lui aussi ses vecteurs.
        let large = FakeMeaningModels::with(LARGE);
        ComputeMeaning::new(&*fixture.meaning, &*fixture.meaning, &large)
            .execute(LARGE, &mut |_| ControlFlow::Continue(()))
            .unwrap();
        // Les segments gardés ne sont plus ceux des notes (index de sens abîmé).
        fixture
            .meaning
            .replace_segments(
                &path("a.md"),
                &domain::segments::segments("Vieux", "périmé"),
            )
            .unwrap();
        let preferences = FakePreferences::default();
        RebuildMeaning::new(&*fixture.words, &*fixture.meaning, &preferences)
            .execute()
            .unwrap();
        for note in ["a.md", "T/b.md"] {
            let content = fixture.words.content(&path(note)).unwrap().unwrap();
            assert_eq!(
                fixture.meaning.segments_of(&path(note)),
                note_segments(&path(note), &content)
            );
        }
        let small = fixture.meaning.status(MODEL).unwrap();
        assert_eq!((small.segments, small.with_vector), (2, 0));
        // Le grand modèle garde les vecteurs des segments qui n'ont pas changé.
        assert_eq!(fixture.meaning.status(LARGE).unwrap().with_vector, 1);
        // Le calcul repart.
        ComputeMeaning::new(&*fixture.meaning, &*fixture.meaning, &fixture.models)
            .execute(MODEL, &mut |_| ControlFlow::Continue(()))
            .unwrap();
        assert_eq!(fixture.meaning.status(MODEL).unwrap().with_vector, 2);
    }

    #[test]
    fn rebuilding_follows_the_chosen_model() {
        let fixture = Fixture::computed(&[("a.md", "# A\n\ntexte")]);
        let preferences = FakePreferences::default();
        preferences.save_meaning_model(LARGE).unwrap();
        RebuildMeaning::new(&*fixture.words, &*fixture.meaning, &preferences)
            .execute()
            .unwrap();
        assert_eq!(fixture.meaning.status(MODEL).unwrap().with_vector, 1);
    }

    #[test]
    fn rebuilding_skips_a_note_whose_content_the_index_no_longer_has() {
        let fixture = Fixture::new(&[("a.md", "# A\n\ntexte")]);
        let words = Vanishing(&fixture.words);
        let preferences = FakePreferences::default();
        RebuildMeaning::new(&words, &*fixture.meaning, &preferences)
            .execute()
            .unwrap();
        assert_eq!(fixture.meaning.notes().len(), 1);
    }

    /// Un index de mots qui connaît la note mais n'a plus son texte.
    #[derive(Debug)]
    struct Vanishing<'a>(&'a crate::MemoryIndex);

    impl NoteIndex for Vanishing<'_> {
        fn stamps(&self) -> Result<Vec<crate::NoteStamp>, crate::StoreError> {
            self.0.stamps()
        }
        fn put(&self, notes: &[crate::IndexedNote]) -> Result<(), crate::StoreError> {
            self.0.put(notes)
        }
        fn remove(&self, notes: &[domain::NotePath]) -> Result<(), crate::StoreError> {
            self.0.remove(notes)
        }
        fn clear(&self) -> Result<(), crate::StoreError> {
            self.0.clear()
        }
        fn content(&self, _: &domain::NotePath) -> Result<Option<String>, crate::StoreError> {
            Ok(None)
        }
        fn notes_in(
            &self,
            folder: &domain::Folder,
        ) -> Result<Vec<domain::NoteSummary>, crate::StoreError> {
            self.0.notes_in(folder)
        }
        fn all_notes(&self) -> Result<Vec<domain::NoteSummary>, crate::StoreError> {
            self.0.all_notes()
        }
        fn tagged(&self, tag: &str) -> Result<Vec<domain::NoteSummary>, crate::StoreError> {
            self.0.tagged(tag)
        }
        fn search(
            &self,
            query: &domain::search::SearchQuery,
            types: &[domain::ContentType],
        ) -> Result<Vec<(domain::NoteSummary, String)>, crate::StoreError> {
            self.0.search(query, types)
        }
    }
}
