//! La recherche par le sens vue depuis l'interface (fiches 0042 et 0046) : les modèles de sens,
//! l'état de l'index de sens, la recherche par les mots et le sens, les notes proches ; le calcul
//! des vecteurs de sens se fait en arrière-plan (`MeaningWorker`).

use std::fmt::Debug;
use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, PoisonError};

use application::use_cases::{
    ChooseModel, DownloadModel, MixedResults, ReadIndexStatus, ReadMeaningStatus, RebuildMeaning,
    RelatedNotes, RemoveModel, SearchWithMeaning,
};
use application::{
    AppError, MeaningError, MeaningModels, MeaningStore, MemoryMeaningIndex, ModelState,
};
use domain::{MeaningModel, NotePath};

use super::meaning_worker::MeaningWorker;
use super::{Session, list_item, search_result_item};
use crate::{
    ApiError, MeaningOverviewItem, MeaningSearchItem, MeaningUseItem, ModelDownloadItem,
    NoteListItem,
};

/// Combien de notes proches d'une note la commande rend.
const RELATED_NOTES_LIMIT: usize = 10;

/// L'interface, vue par la recherche par le sens : elle apprend où en sont le calcul des vecteurs
/// de sens et le téléchargement d'un modèle par des événements.
pub trait MeaningEvents: Send + Sync + Debug {
    /// Où en est le calcul des vecteurs de sens (événement `meaning-progress`).
    fn meaning_progress(&self, progress: crate::MeaningProgressItem);

    /// Où en est le téléchargement d'un modèle (événement `model-download`).
    fn model_download(&self, progress: ModelDownloadItem);
}

/// Le téléchargement en cours : son modèle, et le drapeau qui l'annule.
#[derive(Debug)]
pub(super) struct DownloadInProgress {
    model: MeaningModel,
    cancelled: Arc<AtomicBool>,
}

/// Le nom d'un modèle reçu de l'interface, ou ce qu'il faut lui dire.
fn parse_model(name: &str) -> Result<MeaningModel, ApiError> {
    MeaningModel::from_name(name).ok_or_else(|| ApiError::unknown_meaning_model(name))
}

/// Libère le téléchargement en cours quand il se termine, de quelque façon que ce soit.
struct DownloadSlot<'a>(&'a Session);

impl Drop for DownloadSlot<'_> {
    fn drop(&mut self) {
        *self
            .0
            .download
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = None;
    }
}

impl Session {
    /// La même session, dont les modèles de sens sont gérés par `models`. Sans eux, aucun modèle
    /// n'est téléchargé : la recherche se fait par les mots seuls. À donner avant d'ouvrir un
    /// espace de travail.
    #[must_use]
    pub fn with_meaning_models(mut self, models: Arc<dyn MeaningModels>) -> Self {
        self.meaning_models = models;
        self.rebuild_worker();
        self
    }

    /// La même session, qui dit à `events` où en sont le calcul des vecteurs de sens et le
    /// téléchargement d'un modèle. À donner avant d'ouvrir un espace de travail.
    #[must_use]
    pub fn with_meaning_events(mut self, events: Arc<dyn MeaningEvents>) -> Self {
        self.meaning_events = Some(events);
        self.rebuild_worker();
        self
    }

    fn rebuild_worker(&mut self) {
        self.worker = MeaningWorker::new(
            Arc::clone(&self.preferences),
            Arc::clone(&self.meaning_models),
            self.meaning_events.clone(),
        );
    }

    /// Arrête le calcul des vecteurs de sens entre deux lots, et n'en lance plus : à la fermeture
    /// de l'application. Rend la main quand il est arrêté (10 secondes au plus).
    pub fn stop_meaning(&self) {
        self.worker.shutdown();
    }

    /// Attend la fin du calcul des vecteurs de sens en cours et de ceux qu'on a demandés pendant
    /// qu'il tournait.
    pub fn wait_for_meaning(&self) {
        self.worker.wait_idle();
    }

    /// L'index de sens de l'espace de travail ouvert ; un index vide si aucun n'est ouvert.
    fn meaning_store(&self) -> Arc<dyn MeaningStore> {
        self.workspace
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .as_ref()
            .map_or_else(
                || Arc::new(MemoryMeaningIndex::default()) as Arc<dyn MeaningStore>,
                |state| Arc::clone(&state.meaning),
            )
    }

    fn downloading(&self) -> Option<MeaningModel> {
        self.download
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .as_ref()
            .map(|download| download.model)
    }

    /// Le modèle de sens choisi, l'état et le poids de chaque modèle, où en est l'index de sens de
    /// l'espace de travail ouvert, et si un calcul est en cours.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; préférences ou index de sens
    /// illisibles.
    pub fn meaning_overview(&self) -> Result<MeaningOverviewItem, ApiError> {
        let store = self.meaning_store();
        let overview =
            ReadMeaningStatus::new(&*self.preferences, &*self.meaning_models, &*store).execute()?;
        Ok(MeaningOverviewItem::of(
            &overview,
            self.downloading(),
            self.worker.is_computing(),
            self.notes_without_text(overview.notes)?,
        ))
    }

    /// Les notes que l'index de mots connaît moins celles de l'index de sens (`with_segments`) :
    /// celles-là n'ont aucun segment. Les notes pas encore indexées ne comptent pas ; 0 sans
    /// espace de travail ouvert.
    fn notes_without_text(&self, with_segments: usize) -> Result<usize, ApiError> {
        let Ok(opened) = self.opened() else {
            return Ok(0);
        };
        let indexed = ReadIndexStatus::new(&*opened.store, &*opened.index).indexed_notes()?;
        Ok(indexed.saturating_sub(with_segments))
    }

    /// Choisit le modèle de sens (par son nom) ; le calcul de ses vecteurs, s'il est téléchargé,
    /// se lance en arrière-plan.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; modèle inconnu, préférences
    /// illisibles.
    pub fn choose_meaning_model(&self, model: &str) -> Result<(), ApiError> {
        ChooseModel::new(&*self.preferences).execute(parse_model(model)?)?;
        self.worker.request();
        Ok(())
    }

    /// Télécharge un modèle de sens (par son nom) et rend la main à la fin ; `meaning_events`
    /// reçoit l'avancement, puis la fin ou l'échec. Un seul téléchargement à la fois. Le calcul des
    /// vecteurs se lance ensuite en arrière-plan.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; modèle inconnu, un téléchargement
    /// déjà en cours, réseau ou disque en échec, fichier refusé, téléchargement annulé.
    pub fn download_meaning_model(&self, model: &str) -> Result<(), ApiError> {
        let model = parse_model(model)?;
        let cancelled = self.begin_download(model)?;
        let _slot = DownloadSlot(self);
        let result = DownloadModel::new(&*self.meaning_models).execute(model, &mut |progress| {
            self.announce_download(ModelDownloadItem::Progress {
                model: model.name().to_owned(),
                done: progress.done,
                total: progress.total,
            });
            if cancelled.load(Ordering::SeqCst) {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        });
        match result {
            Ok(()) => {
                self.announce_download(ModelDownloadItem::Finished {
                    model: model.name().to_owned(),
                });
                self.worker.request();
                Ok(())
            }
            Err(error) => {
                let error = ApiError::from(error);
                self.announce_download(ModelDownloadItem::Failed {
                    model: model.name().to_owned(),
                    message: error.message.clone(),
                });
                Err(error)
            }
        }
    }

    /// Prend la place du téléchargement ; rend le drapeau qui l'annule.
    fn begin_download(&self, model: MeaningModel) -> Result<Arc<AtomicBool>, ApiError> {
        let mut download = self.download.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(running) = download.as_ref() {
            return Err(ApiError::download_running(running.model));
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        *download = Some(DownloadInProgress {
            model,
            cancelled: Arc::clone(&cancelled),
        });
        Ok(cancelled)
    }

    fn announce_download(&self, progress: ModelDownloadItem) {
        if let Some(events) = &self.meaning_events {
            events.model_download(progress);
        }
    }

    /// Annule le téléchargement en cours, s'il y en a un : rien de partiel n'est gardé.
    pub fn cancel_model_download(&self) {
        if let Some(download) = self
            .download
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .as_ref()
        {
            download.cancelled.store(true, Ordering::SeqCst);
        }
    }

    /// Supprime un modèle de sens du Mac (par son nom) ; un modèle absent n'est pas une erreur.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; modèle inconnu, modèle en cours de
    /// téléchargement, disque qui refuse.
    pub fn remove_meaning_model(&self, model: &str) -> Result<(), ApiError> {
        let model = parse_model(model)?;
        if self.downloading() == Some(model) {
            return Err(ApiError::removing_while_downloading(model));
        }
        Ok(RemoveModel::new(&*self.meaning_models).execute(model)?)
    }

    /// Reconstruit l'index de sens de l'espace de travail ouvert : les segments de toutes les
    /// notes sont refaits, les vecteurs du modèle choisi effacés puis recalculés en arrière-plan.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; aucun espace de travail ouvert, modèle choisi
    /// non téléchargé (le message dit de le télécharger), index illisible.
    pub fn rebuild_meaning(&self) -> Result<(), ApiError> {
        let opened = self.opened()?;
        let model = self.preferences.meaning_model().map_err(AppError::from)?;
        if self.meaning_models.state(model) == ModelState::NotDownloaded {
            return Err(AppError::from(MeaningError::ModelMissing(model)).into());
        }
        RebuildMeaning::new(&*opened.index, &*opened.meaning, &*self.preferences).execute()?;
        self.worker.request();
        Ok(())
    }

    /// Cherche `text` par les mots et par le sens, avec le modèle choisi. Si le sens manque, les
    /// mots répondent seuls et le résultat dit pourquoi.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; question vide, aucun espace de travail
    /// ouvert, index illisible.
    pub fn search_notes_with_meaning(&self, text: &str) -> Result<MeaningSearchItem, ApiError> {
        let opened = self.opened()?;
        let model = self.preferences.meaning_model().map_err(AppError::from)?;
        let found = SearchWithMeaning::new(
            &*opened.index,
            &*opened.meaning,
            &*self.meaning_models,
            model,
        )
        .execute(text)?;
        Ok(search_item(found))
    }

    /// Les notes de l'espace de travail dont le sens est le plus proche de `text`, sans mêler les
    /// mots : la colonne « idées » de la fenêtre de recherche. Si le sens manque, aucune note et
    /// la raison, typée (modèle absent, calcul pas commencé, échec).
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; question vide, aucun espace de travail
    /// ouvert, index illisible.
    pub fn search_notes_by_meaning(&self, text: &str) -> Result<MeaningSearchItem, ApiError> {
        let opened = self.opened()?;
        let model = self.preferences.meaning_model().map_err(AppError::from)?;
        let found = SearchWithMeaning::new(
            &*opened.index,
            &*opened.meaning,
            &*self.meaning_models,
            model,
        )
        .execute_by_meaning(text)?;
        Ok(search_item(found))
    }

    /// Les notes dont le sens est le plus proche de la note `path` ([`RELATED_NOTES_LIMIT`] au
    /// plus), la plus proche d'abord ; aucune tant que le sens de `path` n'est pas calculé.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, aucun espace de
    /// travail ouvert, index illisible.
    pub fn related_notes(&self, path: &str) -> Result<Vec<NoteListItem>, ApiError> {
        let note = NotePath::parse(path)?;
        let opened = self.opened()?;
        let model = self.preferences.meaning_model().map_err(AppError::from)?;
        let related = RelatedNotes::new(&*opened.index, &*opened.meaning, model)
            .execute(&note, RELATED_NOTES_LIMIT)?;
        Ok(related.iter().map(list_item).collect())
    }
}

/// Le résultat d'une recherche, tel que l'interface le reçoit.
fn search_item(found: MixedResults) -> MeaningSearchItem {
    MeaningSearchItem {
        results: found.results.into_iter().map(search_result_item).collect(),
        meaning: MeaningUseItem::from(&found.meaning),
    }
}

#[cfg(test)]
mod tests;
