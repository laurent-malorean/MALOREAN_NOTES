//! Doublures des tests de la recherche par le sens : des événements enregistrés, un moteur qu'on
//! tient à la porte d'un lot, des modèles et des préférences qui échouent.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, PoisonError};

use application::testing::{FakeEmbedder, FakeMeaningModels, FakePreferences};
use application::{
    Embedder, MeaningError, MeaningModels, ModelState, Preferences, ProgressListener, StoreError,
    Workspaces,
};
use domain::external_servers::ServerName;
use domain::{MeaningModel, MeaningVector};

use super::MeaningEvents;
use crate::{MeaningProgressItem, ModelDownloadItem};

/// Garde les événements reçus, dans l'ordre.
#[derive(Debug, Default)]
pub(super) struct Recorder {
    progress: Mutex<Vec<MeaningProgressItem>>,
    downloads: Mutex<Vec<ModelDownloadItem>>,
}

impl Recorder {
    pub(super) fn progress(&self) -> Vec<MeaningProgressItem> {
        self.progress
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    pub(super) fn downloads(&self) -> Vec<ModelDownloadItem> {
        self.downloads
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

impl MeaningEvents for Recorder {
    fn meaning_progress(&self, progress: MeaningProgressItem) {
        self.progress
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(progress);
    }

    fn model_download(&self, progress: ModelDownloadItem) {
        self.downloads
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(progress);
    }
}

#[derive(Debug, Default)]
struct GateState {
    open: bool,
    inside: usize,
    most_inside: usize,
}

/// La porte d'un lot de calcul : tant qu'elle est fermée, le lot attend dedans.
#[derive(Debug, Default)]
pub(super) struct Gate {
    state: Mutex<GateState>,
    changed: Condvar,
}

impl Gate {
    pub(super) fn closed() -> Arc<Self> {
        Arc::default()
    }

    pub(super) fn pass(&self) {
        let mut state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        state.inside += 1;
        state.most_inside = state.most_inside.max(state.inside);
        self.changed.notify_all();
        state = self
            .changed
            .wait_while(state, |state| !state.open)
            .unwrap_or_else(PoisonError::into_inner);
        state.inside -= 1;
    }

    /// Attend qu'un lot soit arrivé devant la porte.
    pub(super) fn wait_for_a_batch(&self) {
        let state = self.state.lock().unwrap_or_else(PoisonError::into_inner);
        drop(
            self.changed
                .wait_while(state, |state| state.inside == 0)
                .unwrap_or_else(PoisonError::into_inner),
        );
    }

    /// Ouvre la porte pour tous les lots, ceux qui attendent et ceux qui viendront.
    pub(super) fn open(&self) {
        self.state
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .open = true;
        self.changed.notify_all();
    }

    /// Le plus de lots qui aient jamais été dedans en même temps.
    pub(super) fn most_inside(&self) -> usize {
        self.state
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .most_inside
    }
}

/// Un moteur de sens qui passe par la porte avant chaque lot.
#[derive(Debug)]
struct GatedEmbedder {
    inner: FakeEmbedder,
    gate: Arc<Gate>,
}

impl Embedder for GatedEmbedder {
    fn model(&self) -> MeaningModel {
        self.inner.model()
    }

    fn embed_segments(&self, segments: &[String]) -> Result<Vec<MeaningVector>, MeaningError> {
        self.gate.pass();
        self.inner.embed_segments(segments)
    }

    fn embed_query(&self, query: &str) -> Result<MeaningVector, MeaningError> {
        self.inner.embed_query(query)
    }
}

/// Des modèles dont le petit est téléchargé, et dont les lots passent par la porte.
#[derive(Debug)]
pub(super) struct GatedModels {
    inner: FakeMeaningModels,
    gate: Arc<Gate>,
}

impl GatedModels {
    pub(super) fn new(gate: &Arc<Gate>) -> Self {
        Self {
            inner: FakeMeaningModels::with(MeaningModel::Small),
            gate: Arc::clone(gate),
        }
    }
}

impl MeaningModels for GatedModels {
    fn state(&self, model: MeaningModel) -> ModelState {
        self.inner.state(model)
    }

    fn download(
        &self,
        model: MeaningModel,
        progress: ProgressListener<'_>,
    ) -> Result<(), MeaningError> {
        self.inner.download(model, progress)
    }

    fn remove(&self, model: MeaningModel) -> Result<(), MeaningError> {
        self.inner.remove(model)
    }

    fn open(&self, model: MeaningModel) -> Result<Arc<dyn Embedder>, MeaningError> {
        Ok(Arc::new(GatedEmbedder {
            inner: FakeEmbedder::new(model),
            gate: Arc::clone(&self.gate),
        }))
    }
}

/// Un moteur qui échoue, ou qui panique la première fois.
#[derive(Debug)]
struct BrokenEmbedder {
    model: MeaningModel,
    panics_once: Arc<AtomicBool>,
}

impl Embedder for BrokenEmbedder {
    fn model(&self) -> MeaningModel {
        self.model
    }

    fn embed_segments(&self, segments: &[String]) -> Result<Vec<MeaningVector>, MeaningError> {
        if self.panics_once.swap(false, Ordering::SeqCst) {
            panic!("moteur de sens en panne");
        }
        FakeEmbedder::new(self.model).embed_segments(segments)
    }

    fn embed_query(&self, query: &str) -> Result<MeaningVector, MeaningError> {
        FakeEmbedder::new(self.model).embed_query(query)
    }
}

/// Des modèles dont le petit est téléchargé, mais dont le moteur ne s'ouvre pas
/// (`failing`), ou panique au premier lot.
#[derive(Debug)]
pub(super) struct BrokenModels {
    inner: FakeMeaningModels,
    failing: bool,
    panics_once: Arc<AtomicBool>,
}

impl BrokenModels {
    pub(super) fn failing() -> Self {
        Self {
            inner: FakeMeaningModels::with(MeaningModel::Small),
            failing: true,
            panics_once: Arc::default(),
        }
    }

    pub(super) fn panicking_once() -> Self {
        Self {
            inner: FakeMeaningModels::with(MeaningModel::Small),
            failing: false,
            panics_once: Arc::new(AtomicBool::new(true)),
        }
    }
}

impl MeaningModels for BrokenModels {
    fn state(&self, model: MeaningModel) -> ModelState {
        self.inner.state(model)
    }

    fn download(
        &self,
        _model: MeaningModel,
        _progress: ProgressListener<'_>,
    ) -> Result<(), MeaningError> {
        Ok(())
    }

    fn remove(&self, model: MeaningModel) -> Result<(), MeaningError> {
        self.inner.remove(model)
    }

    fn open(&self, model: MeaningModel) -> Result<Arc<dyn Embedder>, MeaningError> {
        if self.failing {
            return Err(MeaningError::ComputationFailed("boum".to_owned()));
        }
        Ok(Arc::new(BrokenEmbedder {
            model,
            panics_once: Arc::clone(&self.panics_once),
        }))
    }
}

/// Des préférences dont le modèle de sens ne se lit pas.
#[derive(Debug, Default)]
pub(super) struct BrokenPreferences(FakePreferences);

impl Preferences for BrokenPreferences {
    fn workspaces(&self) -> Result<Workspaces, StoreError> {
        self.0.workspaces()
    }

    fn save_workspaces(&self, workspaces: &Workspaces) -> Result<(), StoreError> {
        self.0.save_workspaces(workspaces)
    }

    fn meaning_model(&self) -> Result<MeaningModel, StoreError> {
        Err(StoreError::Unavailable("préférences illisibles".to_owned()))
    }

    fn save_meaning_model(&self, _model: MeaningModel) -> Result<(), StoreError> {
        Err(StoreError::Unavailable("préférences illisibles".to_owned()))
    }

    fn voice_language(&self) -> Result<Option<String>, StoreError> {
        self.0.voice_language()
    }

    fn save_voice_language(&self, language: Option<&str>) -> Result<(), StoreError> {
        self.0.save_voice_language(language)
    }

    fn allowed_servers(&self) -> Result<Vec<ServerName>, StoreError> {
        self.0.allowed_servers()
    }

    fn save_allowed_servers(&self, servers: &[ServerName]) -> Result<(), StoreError> {
        self.0.save_allowed_servers(servers)
    }
}

/// Un téléchargement qui garde le modèle une fois les fichiers reçus, et laisse la main au test
/// à chaque avancement (pour l'annuler, par exemple).
pub(super) struct SlowDownload {
    inner: FakeMeaningModels,
    on_progress: Box<dyn Fn() + Send + Sync>,
}

impl std::fmt::Debug for SlowDownload {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("SlowDownload")
    }
}

impl SlowDownload {
    pub(super) fn new(on_progress: impl Fn() + Send + Sync + 'static) -> Self {
        Self {
            inner: FakeMeaningModels::default(),
            on_progress: Box::new(on_progress),
        }
    }
}

impl MeaningModels for SlowDownload {
    fn state(&self, model: MeaningModel) -> ModelState {
        self.inner.state(model)
    }

    fn download(
        &self,
        model: MeaningModel,
        progress: ProgressListener<'_>,
    ) -> Result<(), MeaningError> {
        let on_progress = &self.on_progress;
        self.inner.download(model, &mut |done| {
            on_progress();
            progress(done)
        })
    }

    fn remove(&self, model: MeaningModel) -> Result<(), MeaningError> {
        self.inner.remove(model)
    }

    fn open(&self, model: MeaningModel) -> Result<Arc<dyn Embedder>, MeaningError> {
        self.inner.open(model)
    }
}
