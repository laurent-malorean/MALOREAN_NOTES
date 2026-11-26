//! Le modèle de sens gardé en mémoire (fiche 0088) : charger un modèle coûte de 15 à 49 secondes
//! et près de 1 Go ; on le garde donc chargé 5 minutes après son dernier usage, puis on le libère
//! tout seul, sans attendre une nouvelle recherche. Un seul modèle est gardé à la fois.

use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use application::{Embedder, MeaningError, MeaningModels, ModelState, ProgressListener, Uptime};
use domain::MeaningModel;

/// Le temps pendant lequel un modèle chargé reste en mémoire après son dernier usage.
pub const KEEP_DURATION: Duration = Duration::from_secs(300);

/// Le modèle chargé, avec le moment de son dernier usage.
#[derive(Debug)]
struct Kept {
    model: MeaningModel,
    embedder: Arc<dyn Embedder>,
    last_use: Duration,
}

#[derive(Debug, Default)]
struct State {
    kept: Option<Kept>,
    closing: bool,
}

#[derive(Debug)]
struct Shared {
    inner: Arc<dyn MeaningModels>,
    uptime: Arc<dyn Uptime>,
    duration: Duration,
    state: Mutex<State>,
    changed: Condvar,
}

impl Shared {
    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Libère le modèle gardé s'il n'a pas servi depuis `duration`. Un modèle encore en main
    /// (un calcul en cours) n'est jamais libéré : son temps repart d'ici.
    fn expire(&self, state: &mut State) {
        let now = self.uptime.elapsed();
        let Some(kept) = state.kept.as_mut() else {
            return;
        };
        if now.saturating_sub(kept.last_use) < self.duration {
            return;
        }
        if Arc::strong_count(&kept.embedder) > 1 {
            kept.last_use = now;
        } else {
            state.kept = None;
        }
    }

    /// Le fil de purge : dort jusqu'à l'échéance du modèle gardé, puis le libère.
    fn purge(&self) {
        let mut state = self.lock();
        while !state.closing {
            self.expire(&mut state);
            state = match &state.kept {
                None => self
                    .changed
                    .wait(state)
                    .unwrap_or_else(PoisonError::into_inner),
                Some(kept) => {
                    let idle = self.uptime.elapsed().saturating_sub(kept.last_use);
                    let remaining = self.duration.saturating_sub(idle);
                    self.changed
                        .wait_timeout(state, remaining)
                        .unwrap_or_else(PoisonError::into_inner)
                        .0
                }
            };
        }
    }
}

/// Les modèles de sens du disque, avec le dernier modèle ouvert gardé chargé : la première
/// recherche après une pause paie le chargement, les suivantes (et le calcul du sens des notes)
/// réutilisent le modèle chargé ; 5 minutes sans usage et il est libéré, la mémoire redescend.
/// Deux ouvertures en même temps ne chargent qu'une fois ; un chargement raté n'est pas gardé ;
/// ouvrir un autre modèle, ou supprimer celui qui est gardé, le libère aussitôt.
#[derive(Debug)]
pub struct KeptModels {
    shared: Arc<Shared>,
    purger: Option<JoinHandle<()>>,
}

impl KeptModels {
    /// Garde `inner` pendant [`KEEP_DURATION`], le temps lu sur `uptime`.
    #[must_use]
    pub fn new(inner: Arc<dyn MeaningModels>, uptime: Arc<dyn Uptime>) -> Self {
        Self::with_duration(inner, uptime, KEEP_DURATION)
    }

    /// Comme [`Self::new`], pour un autre délai (les tests).
    #[must_use]
    pub fn with_duration(
        inner: Arc<dyn MeaningModels>,
        uptime: Arc<dyn Uptime>,
        duration: Duration,
    ) -> Self {
        let shared = Arc::new(Shared {
            inner,
            uptime,
            duration,
            state: Mutex::new(State::default()),
            changed: Condvar::new(),
        });
        let worker = shared.clone();
        // Sans fil de purge, le modèle n'est libéré qu'à l'ouverture suivante : c'est moins bien,
        // pas faux.
        let purger = thread::Builder::new()
            .name("modele-de-sens-garde".to_owned())
            .spawn(move || worker.purge())
            .ok();
        Self { shared, purger }
    }
}

impl Drop for KeptModels {
    fn drop(&mut self) {
        {
            let mut state = self.shared.lock();
            state.closing = true;
            state.kept = None;
        }
        self.shared.changed.notify_all();
        if let Some(purger) = self.purger.take()
            && purger.join().is_err()
        {
            tracing::warn!("le fil de purge du modèle de sens s'est arrêté sur une erreur");
        }
    }
}

impl MeaningModels for KeptModels {
    fn state(&self, model: MeaningModel) -> ModelState {
        self.shared.inner.state(model)
    }

    fn download(
        &self,
        model: MeaningModel,
        progress: ProgressListener<'_>,
    ) -> Result<(), MeaningError> {
        self.shared.inner.download(model, progress)
    }

    fn remove(&self, model: MeaningModel) -> Result<(), MeaningError> {
        {
            let mut state = self.shared.lock();
            if state.kept.as_ref().is_some_and(|kept| kept.model == model) {
                state.kept = None;
            }
        }
        self.shared.inner.remove(model)
    }

    /// Le modèle gardé s'il l'est encore, sinon le modèle chargé depuis le disque (le verrou est
    /// tenu pendant le chargement : une seconde ouverture attend et reçoit le même modèle).
    fn open(&self, model: MeaningModel) -> Result<Arc<dyn Embedder>, MeaningError> {
        let shared = &self.shared;
        let mut state = shared.lock();
        shared.expire(&mut state);
        let now = shared.uptime.elapsed();
        if let Some(kept) = state.kept.as_mut().filter(|kept| kept.model == model) {
            kept.last_use = now;
            return Ok(kept.embedder.clone());
        }
        state.kept = None;
        let embedder = shared.inner.open(model)?;
        state.kept = Some(Kept {
            model,
            embedder: embedder.clone(),
            last_use: now,
        });
        drop(state);
        shared.changed.notify_all();
        Ok(embedder)
    }
}

#[cfg(test)]
#[path = "kept_models_tests.rs"]
mod tests;
