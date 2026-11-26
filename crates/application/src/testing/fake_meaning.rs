//! Faux moteur de sens et faux modèles de sens, en mémoire (voir `meaning_contract`).

use std::ops::ControlFlow;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use domain::{MeaningModel, MeaningVector, ModelFileInfo};

use crate::{
    DownloadProgress, Embedder, MeaningError, MeaningModels, ModelState, ProgressListener, Uptime,
};

/// Moteur de sens qui compte les mots : un vecteur de la taille du modèle, où chaque mot (sans
/// majuscules) ajoute 1 à la case que désigne la somme de ses lettres. Comme E5, il met « query : »
/// devant une question et « passage : » devant un segment : la même phrase n'a donc pas le même
/// vecteur dans les deux rôles.
#[derive(Debug, Clone, Copy)]
pub struct FakeEmbedder {
    model: MeaningModel,
}

impl FakeEmbedder {
    /// Un moteur qui se donne pour `model`.
    #[must_use]
    pub fn new(model: MeaningModel) -> Self {
        Self { model }
    }

    fn embed(&self, role: &str, text: &str) -> Result<MeaningVector, MeaningError> {
        let dimensions = self.model.dimensions();
        let mut values = vec![0.0_f32; dimensions];
        let prefixed = format!("{role} {text}");
        for word in prefixed
            .split(|c: char| !c.is_alphanumeric())
            .filter(|word| !word.is_empty())
        {
            let slot = word
                .to_lowercase()
                .chars()
                .map(|c| c as usize)
                .sum::<usize>()
                % dimensions;
            values[slot] += 1.0;
        }
        MeaningVector::new(values).map_err(|e| MeaningError::ComputationFailed(e.to_string()))
    }
}

impl Embedder for FakeEmbedder {
    fn model(&self) -> MeaningModel {
        self.model
    }

    fn embed_segments(&self, segments: &[String]) -> Result<Vec<MeaningVector>, MeaningError> {
        segments
            .iter()
            .map(|segment| self.embed("passage", segment))
            .collect()
    }

    fn embed_query(&self, query: &str) -> Result<MeaningVector, MeaningError> {
        self.embed("query", query)
    }
}

/// Modèles de sens en mémoire : un modèle est « téléchargé » quand on l'a demandé ; le
/// téléchargement annonce l'avancement fichier par fichier, comme le vrai.
#[derive(Debug, Default)]
pub struct FakeMeaningModels {
    downloaded: Mutex<Vec<MeaningModel>>,
}

impl FakeMeaningModels {
    /// Des modèles dont `model` est déjà téléchargé.
    #[must_use]
    pub fn with(model: MeaningModel) -> Self {
        Self {
            downloaded: Mutex::new(vec![model]),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Vec<MeaningModel>> {
        self.downloaded
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }
}

impl MeaningModels for FakeMeaningModels {
    fn state(&self, model: MeaningModel) -> ModelState {
        if self.lock().contains(&model) {
            ModelState::Downloaded
        } else {
            ModelState::NotDownloaded
        }
    }

    fn download(
        &self,
        model: MeaningModel,
        progress: ProgressListener<'_>,
    ) -> Result<(), MeaningError> {
        if self.state(model) == ModelState::Downloaded {
            return Ok(());
        }
        let total = model.total_size();
        let mut done = 0;
        for file in model.files().iter().map(ModelFileInfo::size) {
            done += file;
            if progress(DownloadProgress { done, total }) == ControlFlow::Break(()) {
                return Err(MeaningError::DownloadInterrupted(model));
            }
        }
        self.lock().push(model);
        Ok(())
    }

    fn remove(&self, model: MeaningModel) -> Result<(), MeaningError> {
        self.lock().retain(|downloaded| *downloaded != model);
        Ok(())
    }

    fn open(&self, model: MeaningModel) -> Result<Arc<dyn Embedder>, MeaningError> {
        match self.state(model) {
            ModelState::Downloaded => Ok(Arc::new(FakeEmbedder::new(model))),
            ModelState::NotDownloaded => Err(MeaningError::ModelMissing(model)),
        }
    }
}

/// Minuteur qui n'avance que sur ordre : les tests font passer le temps sans attendre.
#[derive(Debug, Default)]
pub struct FakeUptime {
    elapsed: Mutex<Duration>,
}

impl FakeUptime {
    /// Fait passer `time`.
    pub fn advance(&self, time: Duration) {
        *self.elapsed.lock().unwrap_or_else(PoisonError::into_inner) += time;
    }
}

impl Uptime for FakeUptime {
    fn elapsed(&self) -> Duration {
        *self.elapsed.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::meaning_contract::{
        embedder_meaning_contract, embedder_shape_contract, meaning_models_contract,
    };

    #[test]
    fn the_fake_embedder_keeps_the_contracts() {
        for model in MeaningModel::ALL {
            let embedder = FakeEmbedder::new(model);
            assert_eq!(embedder.model(), model);
            embedder_shape_contract(&embedder);
            embedder_meaning_contract(&embedder);
        }
    }

    #[test]
    fn each_word_adds_one_to_the_slot_of_its_letters_with_the_role_in_front() {
        let embedder = FakeEmbedder::new(MeaningModel::Small);
        let half = std::f32::consts::FRAC_1_SQRT_2;
        let query = embedder.embed_query("A").unwrap();
        // « query » : 566 % 384 = 182 ; « a » : 97.
        assert_eq!(query.values().len(), 384);
        assert!((query.values()[182] - half).abs() < 1e-6);
        assert!((query.values()[97] - half).abs() < 1e-6);
        let segment = &embedder.embed_segments(&["A!".to_owned()]).unwrap()[0];
        // « passage » : 740 % 384 = 356.
        assert!((segment.values()[356] - half).abs() < 1e-6);
        assert!((segment.values()[97] - half).abs() < 1e-6);
        assert_eq!(segment.values().iter().filter(|v| **v != 0.0).count(), 2);
    }

    #[test]
    fn the_fake_uptime_only_moves_when_told_to() {
        let uptime = FakeUptime::default();
        assert_eq!(uptime.elapsed(), Duration::ZERO);
        uptime.advance(Duration::from_secs(90));
        uptime.advance(Duration::from_millis(500));
        assert_eq!(uptime.elapsed(), Duration::from_millis(90_500));
    }

    #[test]
    fn the_fake_models_keep_the_contract() {
        for model in MeaningModel::ALL {
            meaning_models_contract(&FakeMeaningModels::default(), model);
        }
    }

    #[test]
    fn the_fake_download_reports_one_step_per_file() {
        let models = FakeMeaningModels::default();
        let mut seen = vec![];
        models
            .download(MeaningModel::Small, &mut |step| {
                seen.push((step.done, step.total));
                ControlFlow::Continue(())
            })
            .unwrap();
        assert_eq!(
            seen,
            [
                (655, 487_724_985),
                (17_083_385, 487_724_985),
                (487_724_985, 487_724_985)
            ]
        );
    }

    #[test]
    fn a_model_made_ready_is_downloaded_and_the_other_is_not() {
        let models = FakeMeaningModels::with(MeaningModel::Large);
        assert_eq!(models.state(MeaningModel::Large), ModelState::Downloaded);
        assert_eq!(models.state(MeaningModel::Small), ModelState::NotDownloaded);
        models.remove(MeaningModel::Small).unwrap();
        assert_eq!(models.state(MeaningModel::Large), ModelState::Downloaded);
        assert_eq!(
            models.open(MeaningModel::Large).unwrap().model(),
            MeaningModel::Large
        );
    }
}
