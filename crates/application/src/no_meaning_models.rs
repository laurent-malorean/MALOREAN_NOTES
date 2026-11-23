//! Les modèles de sens d'une session qui n'en a pas : la recherche par mots seule.

use std::sync::Arc;

use domain::MeaningModel;

use crate::{Embedder, MeaningError, MeaningModels, ModelState, ProgressListener};

/// Aucun modèle de sens n'est téléchargé, et aucun ne peut l'être : la session n'a pas de dossier
/// des modèles. Tout le reste de l'application marche comme sans modèle téléchargé.
#[derive(Debug, Default)]
pub struct NoMeaningModels;

impl MeaningModels for NoMeaningModels {
    fn state(&self, _model: MeaningModel) -> ModelState {
        ModelState::NotDownloaded
    }

    fn download(
        &self,
        model: MeaningModel,
        _progress: ProgressListener<'_>,
    ) -> Result<(), MeaningError> {
        Err(MeaningError::DownloadFailed {
            model,
            reason: "cette session n'a pas de dossier des modèles".to_owned(),
        })
    }

    fn remove(&self, _model: MeaningModel) -> Result<(), MeaningError> {
        Ok(())
    }

    fn open(&self, model: MeaningModel) -> Result<Arc<dyn Embedder>, MeaningError> {
        Err(MeaningError::ModelMissing(model))
    }
}

#[cfg(test)]
mod tests {
    use std::ops::ControlFlow;

    use super::*;

    #[test]
    fn no_model_is_ever_there() {
        for model in MeaningModel::ALL {
            assert_eq!(NoMeaningModels.state(model), ModelState::NotDownloaded);
            assert_eq!(
                NoMeaningModels.open(model).unwrap_err(),
                MeaningError::ModelMissing(model)
            );
            assert_eq!(NoMeaningModels.remove(model), Ok(()));
        }
    }

    #[test]
    fn no_model_can_be_downloaded_and_the_reason_is_readable() {
        let error = NoMeaningModels
            .download(MeaningModel::Small, &mut |_| ControlFlow::Continue(()))
            .unwrap_err();
        assert_eq!(
            error,
            MeaningError::DownloadFailed {
                model: MeaningModel::Small,
                reason: "cette session n'a pas de dossier des modèles".to_owned()
            }
        );
        assert!(error.to_string().contains("E5 petit"));
    }
}
