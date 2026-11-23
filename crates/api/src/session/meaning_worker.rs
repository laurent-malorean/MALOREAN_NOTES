//! Le travailleur du sens : le calcul des vecteurs de sens, en arrière-plan, un seul à la fois
//! (fiche 0046). Une demande qui arrive pendant un calcul en demande un nouveau après lui ; un
//! autre espace de travail, ou la fermeture, l'arrête entre deux lots. Une demande ne bloque
//! jamais celui qui la fait.

use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Duration;

use application::use_cases::{ComputeMeaning, ComputeOutcome};
use application::{AppError, MeaningModels, MeaningStore, ModelState, Preferences};

use super::meaning::MeaningEvents;
use crate::{ApiError, MeaningProgressItem};

/// Combien de temps la fermeture attend la fin du lot en cours.
const SHUTDOWN_WAIT: Duration = Duration::from_secs(10);

#[derive(Default)]
struct State {
    /// L'index de sens de l'espace de travail ouvert, s'il y en a un.
    store: Option<Arc<dyn MeaningStore>>,
    /// Un calcul tourne (ou va tourner) sur son fil.
    running: bool,
    /// Une demande est arrivée pendant le calcul : il en faut un autre après lui.
    again: bool,
    /// L'application ferme : plus aucune demande n'est prise.
    closed: bool,
}

/// Le calcul des vecteurs de sens de l'espace de travail ouvert, avec le modèle choisi.
pub(super) struct MeaningWorker {
    preferences: Arc<dyn Preferences>,
    models: Arc<dyn MeaningModels>,
    events: Option<Arc<dyn MeaningEvents>>,
    state: Mutex<State>,
    /// Signalé quand plus aucun calcul ne tourne.
    idle: Condvar,
    /// Change à chaque arrêt demandé : un calcul qui voit un autre numéro que le sien s'arrête.
    generation: AtomicU64,
    /// Des segments sont en train de recevoir leur vecteur.
    computing: AtomicBool,
}

impl std::fmt::Debug for MeaningWorker {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("MeaningWorker")
    }
}

/// Si le calcul panique, remet quand même le travailleur au repos : il ne reste pas bloqué.
struct Rest<'a>(&'a MeaningWorker);

impl Drop for Rest<'_> {
    fn drop(&mut self) {
        if thread::panicking() {
            self.0.computing.store(false, Ordering::SeqCst);
            self.0.state().running = false;
            self.0.idle.notify_all();
        }
    }
}

impl MeaningWorker {
    pub(super) fn new(
        preferences: Arc<dyn Preferences>,
        models: Arc<dyn MeaningModels>,
        events: Option<Arc<dyn MeaningEvents>>,
    ) -> Arc<Self> {
        Arc::new(Self {
            preferences,
            models,
            events,
            state: Mutex::default(),
            idle: Condvar::new(),
            generation: AtomicU64::new(0),
            computing: AtomicBool::new(false),
        })
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Un calcul de vecteurs est en cours.
    pub(super) fn is_computing(&self) -> bool {
        self.computing.load(Ordering::SeqCst)
    }

    /// Un autre espace de travail est ouvert, d'index de sens `store` : le calcul de l'ancien
    /// s'arrête entre deux lots, et celui du nouveau est demandé.
    pub(super) fn switch(self: &Arc<Self>, store: Arc<dyn MeaningStore>) {
        self.state().store = Some(store);
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.request();
    }

    /// Demande un calcul des vecteurs qui manquent : tout de suite, ou après celui qui tourne.
    pub(super) fn request(self: &Arc<Self>) {
        {
            let mut state = self.state();
            if state.closed || state.store.is_none() {
                return;
            }
            if state.running {
                state.again = true;
                return;
            }
            state.running = true;
        }
        let worker = Arc::clone(self);
        let spawned = thread::Builder::new()
            .name("meaning".to_owned())
            .spawn(move || worker.work());
        if let Err(error) = spawned {
            tracing::warn!(%error, "le calcul du sens n'a pas pu démarrer");
            let mut state = self.state();
            state.running = false;
            self.idle.notify_all();
        }
    }

    /// Arrête le calcul entre deux lots et n'en prend plus aucun ; rend la main quand il est
    /// arrêté, ou après [`SHUTDOWN_WAIT`].
    pub(super) fn shutdown(&self) {
        self.state().closed = true;
        self.generation.fetch_add(1, Ordering::SeqCst);
        let state = self.state();
        drop(
            self.idle
                .wait_timeout_while(state, SHUTDOWN_WAIT, |state| state.running)
                .unwrap_or_else(PoisonError::into_inner),
        );
    }

    /// Attend qu'aucun calcul ne tourne ni ne soit demandé.
    pub(super) fn wait_idle(&self) {
        let state = self.state();
        drop(
            self.idle
                .wait_while(state, |state| state.running)
                .unwrap_or_else(PoisonError::into_inner),
        );
    }

    fn work(&self) {
        let _rest = Rest(self);
        loop {
            self.compute_once();
            let mut state = self.state();
            if state.closed || !state.again {
                state.running = false;
                self.idle.notify_all();
                return;
            }
            state.again = false;
        }
    }

    /// Un calcul, avec le modèle choisi, sur l'index de sens ouvert, s'il y a de quoi calculer.
    fn compute_once(&self) {
        let (store, generation) = {
            let state = self.state();
            (state.store.clone(), self.generation.load(Ordering::SeqCst))
        };
        let Some(store) = store else {
            return;
        };
        let model = match self.preferences.meaning_model() {
            Ok(model) => model,
            Err(error) => {
                self.announce(MeaningProgressItem::Failed {
                    message: ApiError::from(AppError::from(error)).message,
                });
                return;
            }
        };
        if self.models.state(model) == ModelState::NotDownloaded {
            return;
        }
        let mut worked = false;
        let outcome =
            ComputeMeaning::new(&*store, &*store, &*self.models).execute(model, &mut |progress| {
                if self.generation.load(Ordering::SeqCst) != generation {
                    return ControlFlow::Break(());
                }
                if progress.done >= progress.total {
                    // Rien à calculer ; si on a calculé, c'est fini, et le dernier lot est dit.
                    if !worked {
                        return ControlFlow::Break(());
                    }
                } else {
                    worked = true;
                    self.computing.store(true, Ordering::SeqCst);
                }
                self.announce(MeaningProgressItem::Progress {
                    done: progress.done,
                    total: progress.total,
                    model: model.name().to_owned(),
                });
                ControlFlow::Continue(())
            });
        self.computing.store(false, Ordering::SeqCst);
        match outcome {
            Ok(ComputeOutcome::Finished) => self.announce(MeaningProgressItem::Finished {
                model: model.name().to_owned(),
            }),
            Ok(_) => {}
            Err(error) => self.announce(MeaningProgressItem::Failed {
                message: ApiError::from(error).message,
            }),
        }
    }

    fn announce(&self, progress: MeaningProgressItem) {
        if let Some(events) = &self.events {
            events.meaning_progress(progress);
        }
    }
}

#[cfg(test)]
mod tests;
