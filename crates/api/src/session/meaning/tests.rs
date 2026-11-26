//! La recherche par le sens vue par la session : modèles, état, recherche, notes proches, et
//! calcul en arrière-plan déclenché par ce qui change.

use std::sync::Arc;
use std::thread;

use application::testing::{
    FakeMeaningModels, FakeOpener, FakePreferences, FakeWatcher, FixedClock, InMemoryNoteStore,
};
use application::{
    MeaningModels, MemoryMeaningIndexes, NoMeaningModels, NoteStore, WorkspaceChange,
    WorkspaceWatcher,
};
use domain::{MeaningModel, NotePath};

use crate::session::Session;
use crate::session::meaning_fakes::{Gate, Recorder, SlowDownload};
use crate::{MeaningProgressItem, MeaningUseItem, ModelDownloadItem, NoteOrderItem};

const NOTES: [(&str, &str); 3] = [
    ("tarte.md", "# Tarte\n\n## Dessert\n\npommes sucre beurre"),
    ("cidre.md", "# Cidre\n\npommes fermentées"),
    ("pain.md", "# Pain\n\nfarine levain eau"),
];

fn session_with(
    models: Arc<dyn MeaningModels>,
    store: Arc<InMemoryNoteStore>,
    recorder: &Arc<Recorder>,
) -> Session {
    Session::new(
        Arc::new(FakeOpener::new(store)),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    )
    .with_indexes(Arc::new(MemoryMeaningIndexes))
    .with_meaning_models(models)
    .with_meaning_events(Arc::clone(recorder) as Arc<dyn crate::MeaningEvents>)
}

/// Une session sur ces notes, le petit modèle téléchargé, le calcul fini.
fn computed() -> (Session, Arc<Recorder>) {
    let recorder = Arc::new(Recorder::default());
    let session = session_with(
        Arc::new(FakeMeaningModels::with(MeaningModel::Small)),
        Arc::new(InMemoryNoteStore::with_notes(&NOTES)),
        &recorder,
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session.wait_for_meaning();
    (session, recorder)
}

fn progress(done: usize, total: usize) -> MeaningProgressItem {
    MeaningProgressItem::Progress {
        done,
        total,
        model: "e5-small".into(),
    }
}

#[test]
fn opening_a_workspace_computes_its_vectors_and_the_overview_tells_it() {
    let (session, recorder) = computed();
    let overview = session.meaning_overview().unwrap();
    assert_eq!(overview.chosen, "e5-small");
    assert_eq!(
        (overview.segments, overview.with_vector, overview.notes),
        (3, 3, 3)
    );
    assert_eq!(overview.notes_without_text, 0);
    assert!(!overview.computing);
    assert_eq!(
        recorder.progress(),
        [
            progress(0, 3),
            progress(3, 3),
            MeaningProgressItem::Finished {
                model: "e5-small".into()
            }
        ]
    );
    let models: Vec<_> = overview
        .models
        .iter()
        .map(|m| (m.model.as_str(), m.label.as_str(), m.downloaded, m.size))
        .collect();
    assert_eq!(
        models,
        [
            (
                "e5-small",
                "E5 petit",
                true,
                MeaningModel::Small.total_size()
            ),
            (
                "e5-large",
                "E5 grand",
                false,
                MeaningModel::Large.total_size()
            ),
        ]
    );
}

#[test]
fn the_overview_counts_the_indexed_notes_that_have_no_text() {
    let recorder = Arc::new(Recorder::default());
    let session = session_with(
        Arc::new(FakeMeaningModels::with(MeaningModel::Small)),
        Arc::new(InMemoryNoteStore::with_notes(&[
            ("tarte.md", "# Tarte\n\npommes sucre beurre"),
            ("titre.md", "# Titre seul"),
            ("vide.md", ""),
        ])),
        &recorder,
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session.wait_for_meaning();
    let overview = session.meaning_overview().unwrap();
    assert_eq!((overview.notes, overview.notes_without_text), (1, 2));
}

#[test]
fn the_overview_needs_no_workspace_and_counts_nothing_without_one() {
    let recorder = Arc::new(Recorder::default());
    let session = session_with(
        Arc::new(FakeMeaningModels::with(MeaningModel::Large)),
        Arc::new(InMemoryNoteStore::default()),
        &recorder,
    );
    let overview = session.meaning_overview().unwrap();
    assert_eq!(
        (overview.segments, overview.with_vector, overview.notes),
        (0, 0, 0)
    );
    assert_eq!(overview.notes_without_text, 0);
    assert!(overview.models[1].downloaded);
    assert!(!overview.models[0].downloaded);
}

#[test]
fn the_overview_says_a_computation_is_running() {
    let (gate, recorder) = (Gate::closed(), Arc::new(Recorder::default()));
    let session = session_with(
        Arc::new(crate::session::meaning_fakes::GatedModels::new(&gate)),
        Arc::new(InMemoryNoteStore::with_notes(&NOTES)),
        &recorder,
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    gate.wait_for_a_batch();
    assert!(session.meaning_overview().unwrap().computing);
    gate.open();
    session.wait_for_meaning();
    assert!(!session.meaning_overview().unwrap().computing);
}

#[test]
fn choosing_a_model_by_its_name_computes_its_vectors() {
    let recorder = Arc::new(Recorder::default());
    let models = FakeMeaningModels::with(MeaningModel::Small);
    models
        .download(MeaningModel::Large, &mut |_| {
            std::ops::ControlFlow::Continue(())
        })
        .unwrap();
    let session = session_with(
        Arc::new(models),
        Arc::new(InMemoryNoteStore::with_notes(&NOTES)),
        &recorder,
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session.wait_for_meaning();
    assert_eq!(session.meaning_overview().unwrap().with_vector, 3);
    session.choose_meaning_model("e5-large").unwrap();
    let overview = session.meaning_overview().unwrap();
    assert_eq!(overview.chosen, "e5-large");
    session.wait_for_meaning();
    let overview = session.meaning_overview().unwrap();
    assert_eq!((overview.segments, overview.with_vector), (3, 3));
    assert_eq!(
        recorder.progress().last(),
        Some(&MeaningProgressItem::Finished {
            model: "e5-large".into()
        })
    );
}

#[test]
fn an_unknown_model_name_is_refused_with_the_names_that_exist() {
    let (session, _) = computed();
    let message =
        "modèle de sens inconnu : « e5-medium » ; ceux qui existent : « e5-small », « e5-large »";
    assert_eq!(
        session
            .choose_meaning_model("e5-medium")
            .unwrap_err()
            .message,
        message
    );
    assert_eq!(
        session
            .download_meaning_model("e5-medium")
            .unwrap_err()
            .message,
        message
    );
    assert_eq!(
        session
            .remove_meaning_model("e5-medium")
            .unwrap_err()
            .message,
        message
    );
    assert_eq!(session.meaning_overview().unwrap().chosen, "e5-small");
}

#[test]
fn a_download_tells_each_file_then_its_end_and_the_vectors_follow() {
    let recorder = Arc::new(Recorder::default());
    let session = session_with(
        Arc::new(FakeMeaningModels::default()),
        Arc::new(InMemoryNoteStore::with_notes(&NOTES)),
        &recorder,
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session.wait_for_meaning();
    assert_eq!(session.meaning_overview().unwrap().with_vector, 0);
    assert!(recorder.progress().is_empty());
    session.download_meaning_model("e5-small").unwrap();
    let total = MeaningModel::Small.total_size();
    let mut done = 0;
    let mut expected: Vec<ModelDownloadItem> = MeaningModel::Small
        .files()
        .iter()
        .map(|file| {
            done += file.size();
            ModelDownloadItem::Progress {
                model: "e5-small".into(),
                done,
                total,
            }
        })
        .collect();
    expected.push(ModelDownloadItem::Finished {
        model: "e5-small".into(),
    });
    assert_eq!(recorder.downloads(), expected);
    session.wait_for_meaning();
    let overview = session.meaning_overview().unwrap();
    assert!(overview.models[0].downloaded);
    assert_eq!((overview.segments, overview.with_vector), (3, 3));
    assert!(!overview.models[0].downloading);
}

#[test]
fn a_failed_download_is_told_with_its_readable_message_and_returned() {
    let recorder = Arc::new(Recorder::default());
    let session = session_with(
        Arc::new(NoMeaningModels),
        Arc::new(InMemoryNoteStore::default()),
        &recorder,
    );
    let error = session.download_meaning_model("e5-small").unwrap_err();
    assert!(
        error
            .message
            .contains("cette session n'a pas de dossier des modèles"),
        "{}",
        error.message
    );
    assert_eq!(
        recorder.downloads(),
        [ModelDownloadItem::Failed {
            model: "e5-small".into(),
            message: error.message
        }]
    );
    // Le téléchargement raté a libéré la place.
    assert!(session.download_meaning_model("e5-small").is_err());
}

#[test]
fn only_one_download_runs_at_a_time_and_it_can_be_cancelled() {
    let (gate, recorder) = (Gate::closed(), Arc::new(Recorder::default()));
    let waiting = Arc::clone(&gate);
    let session = Arc::new(session_with(
        Arc::new(SlowDownload::new(move || waiting.pass())),
        Arc::new(InMemoryNoteStore::default()),
        &recorder,
    ));
    let downloading = {
        let session = Arc::clone(&session);
        thread::spawn(move || session.download_meaning_model("e5-small"))
    };
    gate.wait_for_a_batch();
    let overview = session.meaning_overview().unwrap();
    assert!(overview.models[0].downloading);
    assert!(!overview.models[1].downloading);
    assert_eq!(
        session
            .download_meaning_model("e5-large")
            .unwrap_err()
            .message,
        "le téléchargement du modèle « E5 petit » est déjà en cours : attendez qu'il se termine, ou annulez-le"
    );
    assert_eq!(
        session
            .remove_meaning_model("e5-small")
            .unwrap_err()
            .message,
        "le modèle « E5 petit » est en cours de téléchargement : annulez le téléchargement avant de le supprimer"
    );
    session.remove_meaning_model("e5-large").unwrap();
    session.cancel_model_download();
    gate.open();
    let error = downloading.join().unwrap().unwrap_err();
    assert_eq!(
        error.message,
        "le téléchargement du modèle « E5 petit » a été interrompu : relancez-le quand vous voulez"
    );
    let told = recorder.downloads();
    assert_eq!(
        told.last(),
        Some(&ModelDownloadItem::Failed {
            model: "e5-small".into(),
            message: error.message
        })
    );
    assert_eq!(told.len(), 2);
    assert!(!session.meaning_overview().unwrap().models[0].downloaded);
    // La place est libre, et sans téléchargement en cours, annuler ne fait rien.
    session.cancel_model_download();
    session.download_meaning_model("e5-small").unwrap();
    assert!(session.meaning_overview().unwrap().models[0].downloaded);
}

#[test]
fn a_model_is_removed_and_the_search_then_falls_back_to_words() {
    let (session, _) = computed();
    session.remove_meaning_model("e5-small").unwrap();
    session.remove_meaning_model("e5-small").unwrap();
    let overview = session.meaning_overview().unwrap();
    assert!(!overview.models[0].downloaded);
    // Les vecteurs restent dans l'index.
    assert_eq!(overview.with_vector, 3);
    let found = session.search_notes_with_meaning("pommes").unwrap();
    assert!(matches!(found.meaning, MeaningUseItem::ModelMissing { .. }));
}

#[test]
fn rebuilding_needs_a_workspace_and_computes_the_vectors_again() {
    let recorder = Arc::new(Recorder::default());
    let no_workspace = session_with(
        Arc::new(FakeMeaningModels::with(MeaningModel::Small)),
        Arc::new(InMemoryNoteStore::default()),
        &recorder,
    );
    assert_eq!(
        no_workspace.rebuild_meaning().unwrap_err().message,
        "aucun espace de travail n'est ouvert"
    );
    let (session, recorder) = computed();
    let before = recorder.progress().len();
    session.rebuild_meaning().unwrap();
    session.wait_for_meaning();
    let told = recorder.progress();
    assert_eq!(told[before], progress(0, 3));
    assert_eq!(session.meaning_overview().unwrap().with_vector, 3);
}

#[test]
fn rebuilding_without_the_chosen_model_says_to_download_it_and_changes_nothing() {
    let recorder = Arc::new(Recorder::default());
    let session = session_with(
        Arc::new(FakeMeaningModels::default()),
        Arc::new(InMemoryNoteStore::with_notes(&NOTES)),
        &recorder,
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session.wait_for_meaning();
    assert_eq!(
        session.rebuild_meaning().unwrap_err().message,
        "le modèle « E5 petit » n'est pas téléchargé : téléchargez-le dans les réglages"
    );
    session.wait_for_meaning();
    assert_eq!(session.meaning_overview().unwrap().with_vector, 0);
    assert!(recorder.progress().is_empty());
}

#[test]
fn a_search_by_words_and_meaning_gives_the_results_and_why_the_meaning_is_missing() {
    let (session, _) = computed();
    let found = session
        .search_notes_with_meaning("dessert aux pommes")
        .unwrap();
    assert_eq!(found.meaning, MeaningUseItem::Used);
    assert_eq!(found.results[0].path, "tarte.md");
    assert_eq!(found.results[0].title, "Tarte");
    assert_eq!(found.results[0].folder, "");
    session.choose_meaning_model("e5-large").unwrap();
    session.wait_for_meaning();
    let found = session.search_notes_with_meaning("pommes").unwrap();
    let MeaningUseItem::ModelMissing { model, message } = found.meaning else {
        panic!("{found:?}");
    };
    assert_eq!(model, "e5-large");
    assert!(
        message.contains("téléchargez-le dans les réglages"),
        "{message}"
    );
    assert_eq!(found.results.len(), 2);
}

#[test]
fn a_search_by_meaning_alone_gives_the_closest_notes_without_the_words() {
    let (session, _) = computed();
    let found = session
        .search_notes_by_meaning("dessert aux pommes")
        .unwrap();
    assert_eq!(found.meaning, MeaningUseItem::Used);
    assert_eq!(found.results[0].path, "tarte.md");
    // Le sens classe aussi les notes sans le mot cherché.
    assert_eq!(found.results.len(), 3);
    session.choose_meaning_model("e5-large").unwrap();
    session.wait_for_meaning();
    let found = session.search_notes_by_meaning("pommes").unwrap();
    assert!(matches!(found.meaning, MeaningUseItem::ModelMissing { .. }));
    assert!(found.results.is_empty());
}

#[test]
fn a_blank_question_or_no_workspace_is_an_error_that_says_what_to_do() {
    let (session, _) = computed();
    assert_eq!(
        session.search_notes_with_meaning("  ").unwrap_err().message,
        "la question est vide : écrivez ce que vous cherchez"
    );
    let recorder = Arc::new(Recorder::default());
    let closed = session_with(
        Arc::new(NoMeaningModels),
        Arc::new(InMemoryNoteStore::default()),
        &recorder,
    );
    assert_eq!(
        closed
            .search_notes_with_meaning("pommes")
            .unwrap_err()
            .message,
        "aucun espace de travail n'est ouvert"
    );
    assert_eq!(
        closed
            .search_notes_by_meaning("pommes")
            .unwrap_err()
            .message,
        "aucun espace de travail n'est ouvert"
    );
    assert_eq!(
        session.search_notes_by_meaning(" ").unwrap_err().message,
        "la question est vide : écrivez ce que vous cherchez"
    );
    assert_eq!(
        closed.related_notes("a.md").unwrap_err().message,
        "aucun espace de travail n'est ouvert"
    );
}

#[test]
fn the_notes_close_to_a_note_come_as_list_items_without_the_note_itself() {
    let (session, _) = computed();
    let related = session.related_notes("tarte.md").unwrap();
    assert_eq!(related[0].path, "cidre.md");
    assert_eq!(related[0].title, "Cidre");
    assert!(related.iter().all(|note| note.path != "tarte.md"));
    assert!(related.len() <= 10);
    assert_eq!(
        session.related_notes("../x.md").unwrap_err().message,
        "nom de note invalide : « ../x.md »"
    );
}

#[test]
fn at_most_ten_close_notes_are_given() {
    let recorder = Arc::new(Recorder::default());
    let owned: Vec<(String, String)> = (0..14)
        .map(|n| (format!("n{n:02}.md"), format!("# N{n}\n\ntarte pommes")))
        .collect();
    let notes: Vec<(&str, &str)> = owned
        .iter()
        .map(|(p, c)| (p.as_str(), c.as_str()))
        .collect();
    let session = session_with(
        Arc::new(FakeMeaningModels::with(MeaningModel::Small)),
        Arc::new(InMemoryNoteStore::with_notes(&notes)),
        &recorder,
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session.wait_for_meaning();
    assert_eq!(session.related_notes("n00.md").unwrap().len(), 10);
}

#[test]
fn saving_a_note_computes_the_vector_of_its_new_segment() {
    let (session, recorder) = computed();
    let note = session.read_note("pain.md").unwrap();
    session
        .save_note(
            "pain.md",
            "# Pain\n\nfarine levain eau\n\n## Cuisson\n\nfour chaud",
            &note.fingerprint,
        )
        .unwrap();
    session.wait_for_meaning();
    let overview = session.meaning_overview().unwrap();
    assert_eq!((overview.segments, overview.with_vector), (4, 4));
    assert!(recorder.progress().contains(&progress(3, 4)));
}

#[test]
fn a_change_seen_by_the_watching_computes_the_vector_of_the_new_note() {
    let recorder = Arc::new(Recorder::default());
    let (store, watcher) = (
        Arc::new(InMemoryNoteStore::with_notes(&NOTES)),
        Arc::new(FakeWatcher::default()),
    );
    let session = session_with(
        Arc::new(FakeMeaningModels::with(MeaningModel::Small)),
        Arc::clone(&store),
        &recorder,
    )
    .with_watcher(Arc::clone(&watcher) as Arc<dyn WorkspaceWatcher>);
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session.watch_workspace(|_| {}).unwrap();
    session.wait_for_meaning();
    let added = NotePath::parse("soupe.md").unwrap();
    store.write(&added, "# Soupe\n\npoireaux").unwrap();
    watcher.announce(WorkspaceChange { notes: vec![added] });
    session.wait_for_meaning();
    let overview = session.meaning_overview().unwrap();
    assert_eq!((overview.segments, overview.with_vector), (4, 4));
    assert_eq!(
        session.list_notes("", NoteOrderItem::Title).unwrap().len(),
        4
    );
}

#[test]
fn once_the_meaning_is_stopped_nothing_is_computed_any_more() {
    let (session, recorder) = computed();
    session.stop_meaning();
    let told = recorder.progress().len();
    let note = session.read_note("pain.md").unwrap();
    session
        .save_note("pain.md", "# Pain\n\nautre texte", &note.fingerprint)
        .unwrap();
    session.wait_for_meaning();
    assert_eq!(recorder.progress().len(), told);
}

#[test]
fn the_events_given_before_the_models_are_kept() {
    let recorder = Arc::new(Recorder::default());
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(
            &NOTES,
        )))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    )
    .with_indexes(Arc::new(MemoryMeaningIndexes))
    .with_meaning_events(Arc::clone(&recorder) as Arc<dyn crate::MeaningEvents>)
    .with_meaning_models(Arc::new(FakeMeaningModels::with(MeaningModel::Small)));
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session.wait_for_meaning();
    assert_eq!(recorder.progress().len(), 3);
}

#[test]
fn a_session_without_meaning_models_searches_by_words_alone() {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(
            &NOTES,
        )))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session.wait_for_meaning();
    let found = session.search_notes_with_meaning("pommes").unwrap();
    assert!(matches!(found.meaning, MeaningUseItem::ModelMissing { .. }));
    assert_eq!(found.results.len(), 2);
    let overview = session.meaning_overview().unwrap();
    assert_eq!((overview.segments, overview.with_vector), (0, 0));
    assert!(overview.models.iter().all(|model| !model.downloaded));
}
