use std::ops::ControlFlow;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, PoisonError, Weak};
use std::thread;
use std::time::Duration;

use application::testing::{FakeEmbedder, FakeMeaningModels, FakeUptime};
use application::{Embedder, MeaningError, MeaningModels, ModelState, ProgressListener, Uptime};
use domain::MeaningModel;

use super::*;
use crate::SystemUptime;

const SMALL: MeaningModel = MeaningModel::Small;
const LARGE: MeaningModel = MeaningModel::Large;
const MINUTE: Duration = Duration::from_secs(60);

/// Des modèles qui comptent les chargements, retiennent ce qu'ils ont chargé (pour savoir si
/// c'est libéré), échouent à la demande et prennent leur temps à charger.
#[derive(Debug, Default)]
struct CountingModels {
    inner: FakeMeaningModels,
    loads: AtomicUsize,
    failures_left: AtomicUsize,
    load_time: Duration,
    loaded: Mutex<Vec<Weak<dyn Embedder>>>,
    /// Pour chaque chargement : le modèle précédent existait-il encore à ce moment ?
    previous_alive: Mutex<Vec<bool>>,
}

impl CountingModels {
    fn with(models: &[MeaningModel]) -> Self {
        let counting = Self::default();
        for model in models {
            counting
                .inner
                .download(*model, &mut |_| ControlFlow::Continue(()))
                .unwrap();
        }
        counting
    }

    fn loads(&self) -> usize {
        self.loads.load(Ordering::SeqCst)
    }

    /// Le dernier moteur chargé existe-t-il encore quelque part ?
    fn last_is_alive(&self) -> bool {
        let loaded = self.loaded.lock().unwrap_or_else(PoisonError::into_inner);
        loaded.last().is_some_and(|weak| weak.upgrade().is_some())
    }
}

impl MeaningModels for CountingModels {
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
        thread::sleep(self.load_time);
        if self.state(model) == ModelState::NotDownloaded {
            return Err(MeaningError::ModelMissing(model));
        }
        let failing = self
            .failures_left
            .try_update(Ordering::SeqCst, Ordering::SeqCst, |left| {
                left.checked_sub(1)
            });
        if failing.is_ok() {
            return Err(MeaningError::ComputationFailed(
                "fichiers abîmés".to_owned(),
            ));
        }
        let previous = self.last_is_alive();
        self.previous_alive
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(previous);
        self.loads.fetch_add(1, Ordering::SeqCst);
        let embedder: Arc<dyn Embedder> = Arc::new(FakeEmbedder::new(model));
        self.loaded
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(Arc::downgrade(&embedder));
        Ok(embedder)
    }
}

struct Fixture {
    models: Arc<CountingModels>,
    uptime: Arc<FakeUptime>,
    kept: KeptModels,
}

fn fixture(models: CountingModels) -> Fixture {
    let models = Arc::new(models);
    let uptime = Arc::new(FakeUptime::default());
    let kept = KeptModels::new(models.clone(), uptime.clone());
    Fixture {
        models,
        uptime,
        kept,
    }
}

fn same(a: &Arc<dyn Embedder>, b: &Arc<dyn Embedder>) -> bool {
    Arc::ptr_eq(a, b)
}

#[test]
fn the_model_is_kept_for_five_minutes() {
    assert_eq!(KEEP_DURATION, Duration::from_secs(300));
}

#[test]
fn the_second_search_reuses_the_model_already_loaded() {
    let f = fixture(CountingModels::with(&[SMALL]));
    let first = f.kept.open(SMALL).unwrap();
    f.uptime.advance(MINUTE);
    let second = f.kept.open(SMALL).unwrap();
    assert!(same(&first, &second));
    assert_eq!(f.models.loads(), 1);
    assert_eq!(second.model(), SMALL);
}

#[test]
fn the_model_is_loaded_again_once_five_minutes_have_passed_without_use() {
    let f = fixture(CountingModels::with(&[SMALL]));
    drop(f.kept.open(SMALL).unwrap());
    f.uptime.advance(KEEP_DURATION - Duration::from_millis(1));
    drop(f.kept.open(SMALL).unwrap());
    assert_eq!(f.models.loads(), 1, "à 4 min 59,999 s : encore gardé");
    f.uptime.advance(KEEP_DURATION);
    drop(f.kept.open(SMALL).unwrap());
    assert_eq!(f.models.loads(), 2, "à 5 min pile : rechargé");
}

#[test]
fn each_use_prolongs_the_five_minutes() {
    let f = fixture(CountingModels::with(&[SMALL]));
    drop(f.kept.open(SMALL).unwrap());
    for _ in 0..4 {
        f.uptime.advance(4 * MINUTE);
        drop(f.kept.open(SMALL).unwrap());
    }
    assert_eq!(
        f.models.loads(),
        1,
        "16 minutes en tout, jamais 5 sans usage"
    );
}

#[test]
fn a_failed_load_is_not_kept_and_the_next_search_tries_again() {
    let models = CountingModels::with(&[SMALL]);
    models.failures_left.store(1, Ordering::SeqCst);
    let f = fixture(models);
    assert_eq!(
        f.kept.open(SMALL).err(),
        Some(MeaningError::ComputationFailed(
            "fichiers abîmés".to_owned()
        ))
    );
    assert!(!f.models.last_is_alive());
    let retried = f.kept.open(SMALL).unwrap();
    assert_eq!(retried.model(), SMALL);
    assert_eq!(f.models.loads(), 1);
}

#[test]
fn a_model_not_downloaded_gives_the_same_error_as_before() {
    let f = fixture(CountingModels::with(&[]));
    assert_eq!(
        f.kept.open(SMALL).err(),
        Some(MeaningError::ModelMissing(SMALL))
    );
    assert_eq!(f.models.loads(), 0);
}

#[test]
fn another_model_replaces_the_one_kept_and_frees_it() {
    let f = fixture(CountingModels::with(&[SMALL, LARGE]));
    drop(f.kept.open(SMALL).unwrap());
    assert!(f.models.last_is_alive());
    let large = f.kept.open(LARGE).unwrap();
    assert_eq!(large.model(), LARGE);
    assert_eq!(
        *f.models.previous_alive.lock().unwrap(),
        [false, false],
        "l'ancien est libéré avant le chargement du nouveau"
    );
    let loaded = f.models.loaded.lock().unwrap();
    assert!(loaded[0].upgrade().is_none(), "le petit modèle est libéré");
    assert!(loaded[1].upgrade().is_some());
    drop(loaded);
    drop(large);
    drop(f.kept.open(SMALL).unwrap());
    assert_eq!(f.models.loads(), 3);
}

#[test]
fn removing_the_model_kept_frees_it_and_removing_another_keeps_it() {
    let f = fixture(CountingModels::with(&[SMALL, LARGE]));
    drop(f.kept.open(SMALL).unwrap());
    f.kept.remove(LARGE).unwrap();
    assert!(f.models.last_is_alive());
    assert_eq!(f.kept.state(LARGE), ModelState::NotDownloaded);
    f.kept.remove(SMALL).unwrap();
    assert!(!f.models.last_is_alive());
    assert_eq!(
        f.kept.open(SMALL).err(),
        Some(MeaningError::ModelMissing(SMALL))
    );
}

#[test]
fn download_and_state_go_to_the_models_of_the_disk() {
    let f = fixture(CountingModels::with(&[]));
    assert_eq!(f.kept.state(SMALL), ModelState::NotDownloaded);
    let mut steps = 0;
    f.kept
        .download(SMALL, &mut |_| {
            steps += 1;
            ControlFlow::Continue(())
        })
        .unwrap();
    assert_eq!(steps, 3);
    assert_eq!(f.kept.state(SMALL), ModelState::Downloaded);
}

#[test]
fn a_model_still_in_use_is_never_freed_and_its_time_starts_again() {
    let f = fixture(CountingModels::with(&[SMALL]));
    let in_use = f.kept.open(SMALL).unwrap();
    f.uptime.advance(10 * MINUTE);
    let again = f.kept.open(SMALL).unwrap();
    assert!(same(&in_use, &again));
    assert_eq!(f.models.loads(), 1);
    drop((in_use, again));
    f.uptime.advance(KEEP_DURATION - Duration::from_millis(1));
    drop(f.kept.open(SMALL).unwrap());
    assert_eq!(f.models.loads(), 1);
    f.uptime.advance(KEEP_DURATION);
    drop(f.kept.open(SMALL).unwrap());
    assert_eq!(f.models.loads(), 2);
}

#[test]
fn two_searches_at_once_load_the_model_only_once() {
    let mut models = CountingModels::with(&[SMALL]);
    models.load_time = Duration::from_millis(100);
    let f = fixture(models);
    let kept = Arc::new(f.kept);
    let searches: Vec<_> = (0..8)
        .map(|_| {
            let kept = kept.clone();
            thread::spawn(move || kept.open(SMALL).unwrap())
        })
        .collect();
    let embedders: Vec<_> = searches.into_iter().map(|s| s.join().unwrap()).collect();
    assert_eq!(f.models.loads(), 1);
    assert!(embedders.iter().all(|e| same(e, &embedders[0])));
}

/// Le minuteur réel, sur un délai court.
fn real_kept(models: &Arc<CountingModels>, duration: Duration) -> KeptModels {
    KeptModels::with_duration(models.clone(), Arc::new(SystemUptime::default()), duration)
}

/// Attend (au plus 10 s) que `condition` soit vraie.
fn wait_until(condition: impl Fn() -> bool) -> bool {
    let clock = SystemUptime::default();
    while clock.elapsed() < Duration::from_secs(10) {
        if condition() {
            return true;
        }
        thread::sleep(Duration::from_millis(5));
    }
    condition()
}

#[test]
fn the_model_is_freed_by_itself_after_the_delay_without_any_new_search() {
    let models = Arc::new(CountingModels::with(&[SMALL]));
    let kept = real_kept(&models, Duration::from_millis(60));
    drop(kept.open(SMALL).unwrap());
    assert!(models.last_is_alive());
    assert!(
        wait_until(|| !models.last_is_alive()),
        "plus aucune référence au modèle"
    );
    drop(kept.open(SMALL).unwrap());
    assert_eq!(models.loads(), 2);
}

#[test]
fn the_purge_waits_while_the_model_is_in_use_then_frees_it() {
    let models = Arc::new(CountingModels::with(&[SMALL]));
    let kept = real_kept(&models, Duration::from_millis(60));
    let in_use = kept.open(SMALL).unwrap();
    thread::sleep(Duration::from_millis(250));
    assert!(models.last_is_alive());
    drop(in_use);
    assert!(wait_until(|| !models.last_is_alive()));
}

#[test]
fn dropping_the_kept_models_frees_the_model_and_stops_the_purge() {
    let models = Arc::new(CountingModels::with(&[SMALL]));
    let kept = KeptModels::new(models.clone(), Arc::new(SystemUptime::default()));
    drop(kept.open(SMALL).unwrap());
    let clock = SystemUptime::default();
    drop(kept);
    assert!(clock.elapsed() < Duration::from_secs(5), "le fil s'arrête");
    assert!(!models.last_is_alive());
}

#[test]
fn the_system_uptime_never_goes_back() {
    let uptime = SystemUptime::default();
    let first = uptime.elapsed();
    thread::sleep(Duration::from_millis(5));
    let second = uptime.elapsed();
    assert!(second >= first + Duration::from_millis(5));
}
