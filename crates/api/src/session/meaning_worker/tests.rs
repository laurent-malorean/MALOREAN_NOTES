//! Le travailleur du sens, avec un faux moteur qu'on tient à la porte de chaque lot.

use std::sync::Arc;
use std::thread;

use application::testing::{FakeMeaningModels, FakePreferences};
use application::{MeaningIndex, MeaningModels, MeaningSearch, MemoryMeaningIndex, Preferences};
use domain::segments::segments;
use domain::{MeaningModel, NotePath};

use super::MeaningWorker;
use crate::MeaningProgressItem;
use crate::session::meaning::MeaningEvents;
use crate::session::meaning_fakes::{BrokenModels, BrokenPreferences, Gate, GatedModels, Recorder};

const MODEL: MeaningModel = MeaningModel::Small;

fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

/// Un index de sens avec `sections` segments, dans une note `name`, sans aucun vecteur.
fn store_with(name: &str, sections: usize) -> Arc<MemoryMeaningIndex> {
    let store = Arc::new(MemoryMeaningIndex::default());
    add_sections(&store, name, sections);
    store
}

fn add_sections(store: &MemoryMeaningIndex, name: &str, sections: usize) {
    let content: String = (0..sections)
        .map(|n| format!("## S{n}\n\ntexte {n}\n\n"))
        .collect();
    store
        .replace_segments(&path(name), &segments("N", &content))
        .unwrap();
}

fn worker_on(models: Arc<dyn MeaningModels>, recorder: &Arc<Recorder>) -> Arc<MeaningWorker> {
    MeaningWorker::new(
        Arc::new(FakePreferences::default()),
        models,
        Some(Arc::clone(recorder) as Arc<dyn MeaningEvents>),
    )
}

fn status(store: &MemoryMeaningIndex) -> (usize, usize) {
    let status = store.status(MODEL).unwrap();
    (status.with_vector, status.segments)
}

fn progress(done: usize, total: usize) -> MeaningProgressItem {
    MeaningProgressItem::Progress {
        done,
        total,
        model: "e5-small".into(),
    }
}

fn finished() -> MeaningProgressItem {
    MeaningProgressItem::Finished {
        model: "e5-small".into(),
    }
}

#[test]
fn a_computation_gives_every_segment_its_vector_and_the_progress_is_told_in_order() {
    let recorder = Arc::new(Recorder::default());
    let worker = worker_on(Arc::new(FakeMeaningModels::with(MODEL)), &recorder);
    let store = store_with("a.md", 20);
    worker.switch(store.clone());
    worker.wait_idle();
    assert_eq!(status(&store), (20, 20));
    // Avant le premier lot, après chaque lot de 16, puis la fin.
    assert_eq!(
        recorder.progress(),
        [
            progress(0, 20),
            progress(16, 20),
            progress(20, 20),
            finished()
        ]
    );
    assert!(!worker.is_computing());
}

#[test]
fn nothing_to_compute_says_nothing() {
    let recorder = Arc::new(Recorder::default());
    let worker = worker_on(Arc::new(FakeMeaningModels::with(MODEL)), &recorder);
    let store = store_with("a.md", 2);
    worker.switch(store.clone());
    worker.wait_idle();
    let told = recorder.progress().len();
    assert_eq!(told, 3);
    worker.request();
    worker.wait_idle();
    assert_eq!(recorder.progress().len(), told);
    // Un espace de travail sans aucun segment non plus.
    worker.switch(Arc::new(MemoryMeaningIndex::default()));
    worker.wait_idle();
    assert_eq!(recorder.progress().len(), told);
}

#[test]
fn a_request_without_a_workspace_or_without_the_model_does_nothing() {
    let recorder = Arc::new(Recorder::default());
    let worker = worker_on(Arc::new(FakeMeaningModels::default()), &recorder);
    worker.request();
    worker.wait_idle();
    let store = store_with("a.md", 2);
    worker.switch(store.clone());
    worker.wait_idle();
    assert_eq!(status(&store), (0, 2));
    assert!(recorder.progress().is_empty());
}

#[test]
fn a_request_during_a_computation_asks_for_another_one_after_it_and_never_two_run_together() {
    let (gate, recorder) = (Gate::closed(), Arc::new(Recorder::default()));
    let worker = worker_on(Arc::new(GatedModels::new(&gate)), &recorder);
    let store = store_with("a.md", 3);
    worker.switch(store.clone());
    gate.wait_for_a_batch();
    assert!(worker.is_computing());
    // Pendant le premier lot : une note de plus, et plusieurs demandes.
    add_sections(&store, "b.md", 2);
    worker.request();
    worker.request();
    worker.switch(store.clone());
    gate.open();
    worker.wait_idle();
    assert_eq!(status(&store), (5, 5));
    assert_eq!(gate.most_inside(), 1);
}

#[test]
fn a_new_workspace_stops_the_old_computation_between_two_batches_and_computes_the_new_one() {
    let (gate, recorder) = (Gate::closed(), Arc::new(Recorder::default()));
    let worker = worker_on(Arc::new(GatedModels::new(&gate)), &recorder);
    let (old, new) = (store_with("a.md", 40), store_with("b.md", 3));
    worker.switch(old.clone());
    gate.wait_for_a_batch();
    worker.switch(new.clone());
    gate.open();
    worker.wait_idle();
    // Le lot en cours est fini et gardé, aucun autre n'est lancé.
    assert_eq!(status(&old), (16, 40));
    assert_eq!(status(&new), (3, 3));
    assert_eq!(recorder.progress().last(), Some(&finished()));
}

#[test]
fn closing_stops_the_computation_between_two_batches_and_refuses_new_requests() {
    let (gate, recorder) = (Gate::closed(), Arc::new(Recorder::default()));
    let worker = worker_on(Arc::new(GatedModels::new(&gate)), &recorder);
    let store = store_with("a.md", 40);
    worker.switch(store.clone());
    gate.wait_for_a_batch();
    let generation = worker.generation.load(std::sync::atomic::Ordering::SeqCst);
    thread::scope(|scope| {
        let closing = scope.spawn(|| worker.shutdown());
        while worker.generation.load(std::sync::atomic::Ordering::SeqCst) == generation {
            thread::yield_now();
        }
        gate.open();
        closing.join().unwrap();
    });
    assert_eq!(status(&store), (16, 40));
    let told = recorder.progress().len();
    worker.request();
    worker.switch(store_with("c.md", 1));
    worker.wait_idle();
    assert_eq!(recorder.progress().len(), told);
    assert!(!worker.state().running);
}

#[test]
fn closing_an_idle_worker_returns_at_once() {
    let recorder = Arc::new(Recorder::default());
    let worker = worker_on(Arc::new(FakeMeaningModels::with(MODEL)), &recorder);
    worker.shutdown();
    assert!(worker.state().closed);
}

#[test]
fn a_failed_computation_says_why_and_leaves_the_worker_ready() {
    let recorder = Arc::new(Recorder::default());
    let worker = worker_on(Arc::new(BrokenModels::failing()), &recorder);
    worker.switch(store_with("a.md", 2));
    worker.wait_idle();
    assert_eq!(
        recorder.progress(),
        [MeaningProgressItem::Failed {
            message: "le calcul du sens a échoué (boum) : supprimez le modèle dans les \
                      réglages puis téléchargez-le de nouveau"
                .into()
        }]
    );
    assert!(!worker.is_computing());
    assert!(!worker.state().running);
}

#[test]
fn unreadable_preferences_are_told_and_nothing_is_computed() {
    let recorder = Arc::new(Recorder::default());
    let worker = MeaningWorker::new(
        Arc::new(BrokenPreferences::default()) as Arc<dyn Preferences>,
        Arc::new(FakeMeaningModels::with(MODEL)),
        Some(Arc::clone(&recorder) as Arc<dyn MeaningEvents>),
    );
    let store = store_with("a.md", 2);
    worker.switch(store.clone());
    worker.wait_idle();
    assert_eq!(status(&store), (0, 2));
    let told = recorder.progress();
    let [MeaningProgressItem::Failed { message }] = told.as_slice() else {
        panic!("{told:?}");
    };
    assert!(message.contains("préférences illisibles"), "{message}");
}

#[test]
fn a_worker_without_listener_computes_all_the_same() {
    let worker = MeaningWorker::new(
        Arc::new(FakePreferences::default()),
        Arc::new(FakeMeaningModels::with(MODEL)),
        None,
    );
    let store = store_with("a.md", 2);
    worker.switch(store.clone());
    worker.wait_idle();
    assert_eq!(status(&store), (2, 2));
}

#[test]
fn a_panic_in_the_computation_does_not_leave_the_worker_stuck() {
    let recorder = Arc::new(Recorder::default());
    let worker = worker_on(Arc::new(BrokenModels::panicking_once()), &recorder);
    let store = store_with("a.md", 2);
    worker.switch(store.clone());
    worker.wait_idle();
    assert_eq!(status(&store), (0, 2));
    assert!(!worker.is_computing());
    worker.request();
    worker.wait_idle();
    assert_eq!(status(&store), (2, 2));
}

#[test]
fn the_worker_has_a_readable_debug_form() {
    let worker = worker_on(
        Arc::new(FakeMeaningModels::default()),
        &Arc::new(Recorder::default()),
    );
    assert_eq!(format!("{worker:?}"), "MeaningWorker");
}
