//! Les commandes de la recherche par le sens, appelées comme le fait l'interface (nom, arguments
//! JSON), sur de faux modèles et un faux moteur de sens ; et les événements qu'elles envoient.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::{Arc, Mutex};

use api::Session;
use api::commands::invoke_handler;
use api::commands::meaning::{MEANING_PROGRESS_EVENT, MODEL_DOWNLOAD_EVENT, TauriMeaningEvents};
use application::testing::{
    FakeMeaningModels, FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore,
};
use application::{MeaningModels, MemoryMeaningIndexes};
use domain::MeaningModel;
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const NOTES: [(&str, &str); 3] = [
    ("tarte.md", "# Tarte\n\n## Dessert\n\npommes sucre beurre"),
    ("cidre.md", "# Cidre\n\npommes fermentées"),
    ("pain.md", "# Pain\n\nfarine levain eau"),
];

/// Une fenêtre simulée sur un espace de travail ouvert (le calcul fini), avec ces modèles ; les
/// événements du sens passent par Tauri.
fn window(models: Arc<dyn MeaningModels>) -> (WebviewWindow<MockRuntime>, Arc<Session>) {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(
            &NOTES,
        )))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    )
    .with_indexes(Arc::new(MemoryMeaningIndexes))
    .with_meaning_models(models);
    let app = mock_builder()
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    let session =
        Arc::new(session.with_meaning_events(Arc::new(TauriMeaningEvents(app.handle().clone()))));
    app.manage(Arc::clone(&session));
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    (window, session)
}

fn call(window: &WebviewWindow<MockRuntime>, command: &str, args: Value) -> Result<Value, Value> {
    let request = InvokeRequest {
        cmd: command.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "tauri://localhost".parse().unwrap(),
        body: InvokeBody::Json(args),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };
    get_ipc_response(window, request).map(|body| body.deserialize::<Value>().unwrap())
}

fn error_message(result: Result<Value, Value>) -> String {
    result.unwrap_err()["message"]
        .as_str()
        .unwrap_or_default()
        .to_owned()
}

/// Garde, dans l'ordre, les événements `meaning-progress` et `model-download` reçus.
fn listening(window: &WebviewWindow<MockRuntime>) -> Arc<Mutex<Vec<(String, Value)>>> {
    let received = Arc::new(Mutex::new(Vec::new()));
    for name in [MEANING_PROGRESS_EVENT, MODEL_DOWNLOAD_EVENT] {
        let kept = Arc::clone(&received);
        window.listen_any(name, move |event| {
            kept.lock().unwrap().push((
                name.to_owned(),
                serde_json::from_str(event.payload()).unwrap(),
            ));
        });
    }
    received
}

fn small() -> Arc<dyn MeaningModels> {
    Arc::new(FakeMeaningModels::with(MeaningModel::Small))
}

fn open(window: &WebviewWindow<MockRuntime>, session: &Session) {
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session.wait_for_meaning();
    assert_eq!(call(window, "rebuild_meaning", json!({})), Ok(Value::Null));
    session.wait_for_meaning();
}

#[test]
fn the_events_have_the_names_the_interface_listens_to() {
    assert_eq!(MEANING_PROGRESS_EVENT, "meaning-progress");
    assert_eq!(MODEL_DOWNLOAD_EVENT, "model-download");
}

#[test]
fn the_overview_is_asked_by_name_and_answered_in_camel_case() {
    let (window, session) = window(small());
    assert_eq!(
        call(&window, "meaning_overview", json!({})).unwrap(),
        json!({
            "chosen": "e5-small",
            "models": [
                { "model": "e5-small", "label": "E5 petit", "downloaded": true,
                  "downloading": false, "size": MeaningModel::Small.total_size() },
                { "model": "e5-large", "label": "E5 grand", "downloaded": false,
                  "downloading": false, "size": MeaningModel::Large.total_size() },
            ],
            "segments": 0, "withVector": 0, "notes": 0, "notesWithoutText": 0,
            "computing": false,
        })
    );
    open(&window, &session);
    let overview = call(&window, "meaning_overview", json!({})).unwrap();
    assert_eq!(overview["segments"], 3);
    assert_eq!(overview["withVector"], 3);
    assert_eq!(overview["notes"], 3);
    assert_eq!(overview["notesWithoutText"], 0);
}

#[test]
fn the_model_is_chosen_by_its_name_and_an_unknown_name_is_refused() {
    let (window, _session) = window(small());
    assert_eq!(
        call(
            &window,
            "choose_meaning_model",
            json!({ "model": "e5-large" })
        ),
        Ok(Value::Null)
    );
    assert_eq!(
        call(&window, "meaning_overview", json!({})).unwrap()["chosen"],
        "e5-large"
    );
    assert_eq!(
        error_message(call(
            &window,
            "choose_meaning_model",
            json!({ "model": "gros" })
        )),
        "modèle de sens inconnu : « gros » ; ceux qui existent : « e5-small », « e5-large »"
    );
    assert!(call(&window, "choose_meaning_model", json!({})).is_err());
}

#[test]
fn a_download_tells_the_interface_its_progress_then_the_computation_follows_in_order() {
    let (window, session) = window(Arc::new(FakeMeaningModels::default()));
    session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
    session.wait_for_meaning();
    let received = listening(&window);
    assert_eq!(
        call(
            &window,
            "download_meaning_model",
            json!({ "model": "e5-small" })
        ),
        Ok(Value::Null)
    );
    session.wait_for_meaning();
    let received = received.lock().unwrap().clone();
    let names: Vec<&str> = received.iter().map(|(name, _)| name.as_str()).collect();
    assert_eq!(
        names,
        [
            "model-download",
            "model-download",
            "model-download",
            "model-download",
            "meaning-progress",
            "meaning-progress",
            "meaning-progress",
        ]
    );
    let total = MeaningModel::Small.total_size();
    assert_eq!(received[0].1["kind"], "progress");
    assert_eq!(received[0].1["model"], "e5-small");
    assert_eq!(received[0].1["total"], total);
    assert_eq!(received[2].1["done"], total);
    assert_eq!(
        received[3].1,
        json!({ "kind": "finished", "model": "e5-small" })
    );
    assert_eq!(
        received[4].1,
        json!({ "kind": "progress", "done": 0, "total": 3, "model": "e5-small" })
    );
    assert_eq!(
        received[6].1,
        json!({ "kind": "finished", "model": "e5-small" })
    );
}

#[test]
fn a_failed_download_is_an_error_and_an_event_with_the_same_message() {
    let (window, _session) = window(Arc::new(application::NoMeaningModels));
    let received = listening(&window);
    let message = error_message(call(
        &window,
        "download_meaning_model",
        json!({ "model": "e5-small" }),
    ));
    let received = received.lock().unwrap().clone();
    assert_eq!(
        received,
        [(
            "model-download".to_owned(),
            json!({ "kind": "failed", "model": "e5-small", "message": message })
        )]
    );
}

/// Un faux téléchargement qui prévient le test qu'il a commencé, puis attend sa permission avant
/// de continuer : de quoi annuler un téléchargement en cours par la commande.
struct Waiting {
    inner: FakeMeaningModels,
    started: std::sync::mpsc::Sender<()>,
    go_on: Mutex<std::sync::mpsc::Receiver<()>>,
}

impl std::fmt::Debug for Waiting {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Waiting")
    }
}

impl MeaningModels for Waiting {
    fn state(&self, model: MeaningModel) -> application::ModelState {
        self.inner.state(model)
    }

    fn download(
        &self,
        model: MeaningModel,
        progress: application::ProgressListener<'_>,
    ) -> Result<(), application::MeaningError> {
        self.inner.download(model, &mut |done| {
            self.started.send(()).unwrap();
            self.go_on.lock().unwrap().recv().unwrap();
            progress(done)
        })
    }

    fn remove(&self, model: MeaningModel) -> Result<(), application::MeaningError> {
        self.inner.remove(model)
    }

    fn open(
        &self,
        model: MeaningModel,
    ) -> Result<Arc<dyn application::Embedder>, application::MeaningError> {
        self.inner.open(model)
    }
}

#[test]
fn the_cancel_command_stops_the_download_in_progress() {
    let (started, has_started) = std::sync::mpsc::channel();
    let (allow, go_on) = std::sync::mpsc::channel();
    let (window, _session) = window(Arc::new(Waiting {
        inner: FakeMeaningModels::default(),
        started,
        go_on: Mutex::new(go_on),
    }));
    let downloading = {
        let window = window.clone();
        std::thread::spawn(move || {
            call(
                &window,
                "download_meaning_model",
                json!({ "model": "e5-small" }),
            )
        })
    };
    has_started.recv().unwrap();
    assert_eq!(
        call(&window, "cancel_model_download", json!({})),
        Ok(Value::Null)
    );
    for _ in 0..8 {
        allow.send(()).ok();
    }
    let message = error_message(downloading.join().unwrap());
    assert!(message.contains("interrompu"), "{message}");
}

#[test]
fn cancelling_without_a_download_and_removing_a_model_are_commands_too() {
    let (window, _session) = window(small());
    assert_eq!(
        call(&window, "cancel_model_download", json!({})),
        Ok(Value::Null)
    );
    assert_eq!(
        call(
            &window,
            "remove_meaning_model",
            json!({ "model": "e5-small" })
        ),
        Ok(Value::Null)
    );
    let overview = call(&window, "meaning_overview", json!({})).unwrap();
    assert_eq!(overview["models"][0]["downloaded"], false);
    assert_eq!(
        error_message(call(
            &window,
            "remove_meaning_model",
            json!({ "model": "x" })
        )),
        "modèle de sens inconnu : « x » ; ceux qui existent : « e5-small », « e5-large »"
    );
}

#[test]
fn rebuilding_needs_a_workspace() {
    let (window, _session) = window(small());
    assert_eq!(
        error_message(call(&window, "rebuild_meaning", json!({}))),
        "aucun espace de travail n'est ouvert"
    );
}

#[test]
fn the_search_by_meaning_gives_results_and_the_typed_reason_when_the_meaning_is_missing() {
    let (window, session) = window(small());
    open(&window, &session);
    let found = call(
        &window,
        "search_notes_by_meaning",
        json!({ "query": "dessert aux pommes" }),
    )
    .unwrap();
    assert_eq!(found["meaning"], json!({ "kind": "used" }));
    assert_eq!(found["results"][0]["path"], "tarte.md");
    assert_eq!(found["results"][0]["contentType"], "note");
    assert_eq!(
        found["results"][0]["excerpt"],
        json!([{ "text": "Dessert — pommes sucre beurre", "matched": false }])
    );
    call(
        &window,
        "remove_meaning_model",
        json!({ "model": "e5-small" }),
    )
    .unwrap();
    let missing = call(
        &window,
        "search_notes_by_meaning",
        json!({ "query": "pommes" }),
    )
    .unwrap();
    assert_eq!(missing["meaning"]["kind"], "modelMissing");
    assert_eq!(missing["meaning"]["model"], "e5-small");
    assert!(
        missing["meaning"]["message"]
            .as_str()
            .unwrap()
            .contains("téléchargez-le")
    );
    assert!(missing["results"].as_array().unwrap().is_empty());
    assert_eq!(
        error_message(call(
            &window,
            "search_notes_by_meaning",
            json!({ "query": " " })
        )),
        "la question est vide : écrivez ce que vous cherchez"
    );
}

#[test]
fn the_notes_close_to_a_note_are_asked_by_path() {
    let (window, session) = window(small());
    open(&window, &session);
    let related = call(&window, "related_notes", json!({ "path": "tarte.md" })).unwrap();
    assert_eq!(related[0]["path"], "cidre.md");
    assert_eq!(related[0]["title"], "Cidre");
    assert_eq!(
        error_message(call(&window, "related_notes", json!({ "path": "../x.md" }))),
        "nom de note invalide : « ../x.md »"
    );
}
