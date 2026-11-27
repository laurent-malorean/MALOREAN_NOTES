//! Les commandes de la saisie vocale, appelées comme le fait l'interface (nom, arguments JSON),
//! sur le faux transcripteur (fiche 0103).

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use api::Session;
use api::commands::invoke_handler;
use api::commands::voice::{TauriVoiceEvents, VOICE_INPUT_EVENT};
use application::testing::{
    FakeOpener, FakePreferences, FakeTranscriber, FakeUptime, FixedClock, InMemoryNoteStore,
};
use application::{Preferences, Transcriber};
use domain::voice_input::{VoiceEvent, VoiceFailure};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};

const BRIDGE_SOURCE: &str = include_str!("../../../ui/src/bridge/index.ts");

/// Une fenêtre simulée, avec ce transcripteur (ou aucun) ; rend aussi les préférences.
fn window(
    transcriber: Option<FakeTranscriber>,
) -> (WebviewWindow<MockRuntime>, Arc<FakePreferences>) {
    let preferences = Arc::new(FakePreferences::default());
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::default()))),
        Arc::clone(&preferences) as Arc<dyn Preferences>,
        Arc::new(FixedClock::default()),
    );
    let app = mock_builder()
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    let session = match transcriber {
        Some(transcriber) => session.with_voice_input(
            Arc::new(transcriber) as Arc<dyn Transcriber>,
            Arc::new(TauriVoiceEvents(app.handle().clone())),
            Arc::new(FakeUptime::default()),
        ),
        None => session,
    };
    app.manage(Arc::new(session));
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    (window, preferences)
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

/// Garde, dans l'ordre, les événements `voice-input-event` reçus.
fn listening(window: &WebviewWindow<MockRuntime>) -> Arc<Mutex<Vec<Value>>> {
    let received = Arc::new(Mutex::new(Vec::new()));
    let kept = Arc::clone(&received);
    window.listen_any(VOICE_INPUT_EVENT, move |event| {
        kept.lock()
            .unwrap()
            .push(serde_json::from_str(event.payload()).unwrap());
    });
    received
}

fn wait_for(received: &Arc<Mutex<Vec<Value>>>, kind: &str) -> Vec<Value> {
    for _ in 0..500 {
        let seen = received.lock().unwrap().clone();
        if seen.last().is_some_and(|event| event["kind"] == kind) {
            return seen;
        }
        thread::sleep(Duration::from_millis(10));
    }
    received.lock().unwrap().clone()
}

#[test]
fn the_event_and_the_commands_have_the_names_and_arguments_the_interface_uses() {
    assert_eq!(VOICE_INPUT_EVENT, "voice-input-event");
    for expected in [
        "\"voice_input_status\"",
        "\"choose_voice_language\", { language }",
        "\"prepare_voice_language\", { language }",
        "\"start_voice_input\"",
        "\"stop_voice_input\"",
        "\"open_voice_privacy_settings\"",
        "const VOICE_INPUT_EVENT = \"voice-input-event\"",
    ] {
        assert!(BRIDGE_SOURCE.contains(expected), "{expected}");
    }
}

#[test]
fn the_status_is_answered_in_camel_case() {
    let (window, _) = window(Some(FakeTranscriber::new()));
    assert_eq!(
        call(&window, "voice_input_status", json!({})).unwrap(),
        json!({
            "kind": "available",
            "access": "allowed",
            "language": "fr-FR",
            "languageName": "français (France)",
            "usingMacLanguage": true,
            "languages": [
                { "id": "en-US", "name": "anglais (États-Unis)", "ready": false },
                { "id": "fr-FR", "name": "français (France)", "ready": true },
            ],
            "listening": false,
        })
    );
}

#[test]
fn a_mac_too_old_says_so_and_nothing_starts() {
    let (window, _) = window(Some(FakeTranscriber::unavailable(
        VoiceFailure::SystemTooOld,
    )));
    assert_eq!(
        call(&window, "voice_input_status", json!({})).unwrap(),
        json!({
            "kind": "unavailable",
            "code": "systemTooOld",
            "message": "Saisie vocale : macOS 26 minimum",
        })
    );
    assert_eq!(
        error_message(call(&window, "start_voice_input", json!({}))),
        "Saisie vocale : macOS 26 minimum"
    );
}

#[test]
fn without_an_engine_the_voice_input_is_unavailable() {
    let (window, _) = window(None);
    let message = "Le moteur de la saisie vocale est introuvable : réinstallez l'application.";
    assert_eq!(
        call(&window, "voice_input_status", json!({})).unwrap(),
        json!({ "kind": "unavailable", "code": "engineMissing", "message": message })
    );
    for (command, args) in [
        ("start_voice_input", json!({})),
        ("choose_voice_language", json!({ "language": null })),
        ("prepare_voice_language", json!({ "language": "fr-FR" })),
    ] {
        assert_eq!(error_message(call(&window, command, args)), message);
    }
    assert_eq!(
        call(&window, "stop_voice_input", json!({})),
        Ok(Value::Null)
    );
}

#[test]
fn the_chosen_language_is_kept_in_the_preferences_and_the_status_follows() {
    let (window, preferences) = window(Some(FakeTranscriber::new()));
    assert_eq!(
        call(
            &window,
            "choose_voice_language",
            json!({ "language": "en-US" })
        ),
        Ok(Value::Null)
    );
    assert_eq!(
        preferences.voice_language().unwrap().as_deref(),
        Some("en-US")
    );
    let status = call(&window, "voice_input_status", json!({})).unwrap();
    assert_eq!(status["language"], "en-US");
    assert_eq!(status["usingMacLanguage"], false);
    assert_eq!(
        call(
            &window,
            "choose_voice_language",
            json!({ "language": null })
        ),
        Ok(Value::Null)
    );
    assert_eq!(preferences.voice_language().unwrap(), None);
    assert_eq!(
        error_message(call(
            &window,
            "choose_voice_language",
            json!({ "language": "tlh" })
        )),
        "Cette langue n'est pas prise en charge par la saisie vocale."
    );
}

#[test]
fn a_language_is_prepared_and_a_failed_download_says_so() {
    let (window, _) = window(Some(FakeTranscriber::new()));
    assert_eq!(
        call(
            &window,
            "prepare_voice_language",
            json!({ "language": "en-US" })
        ),
        Ok(Value::Null)
    );
    let (window, _) = window_failing_download();
    assert_eq!(
        error_message(call(
            &window,
            "prepare_voice_language",
            json!({ "language": "en-US" })
        )),
        "Le modèle de la langue n'a pas pu être téléchargé : vérifiez la connexion, puis réessayez."
    );
}

fn window_failing_download() -> (WebviewWindow<MockRuntime>, Arc<FakePreferences>) {
    window(Some(
        FakeTranscriber::new().failing_to_prepare(VoiceFailure::LanguageDownload),
    ))
}

#[test]
fn the_events_reach_the_interface_in_order_up_to_the_end() {
    let (window, _) = window(Some(FakeTranscriber::new().saying(vec![
        VoiceEvent::Preparing,
        VoiceEvent::Listening,
        VoiceEvent::Level(0.5),
        VoiceEvent::Provisional("bon".to_owned()),
    ])));
    let received = listening(&window);
    assert_eq!(
        call(&window, "start_voice_input", json!({})),
        Ok(Value::Null)
    );
    assert_eq!(
        call(&window, "start_voice_input", json!({})).unwrap_err()["message"],
        "La saisie vocale est déjà en cours."
    );
    wait_for(&received, "provisional");
    assert_eq!(
        call(&window, "voice_input_status", json!({})).unwrap()["listening"],
        true
    );
    assert_eq!(
        call(&window, "stop_voice_input", json!({})),
        Ok(Value::Null)
    );
    assert_eq!(
        wait_for(&received, "ended"),
        vec![
            json!({ "kind": "preparing" }),
            json!({ "kind": "listening" }),
            json!({ "kind": "level", "value": 0.5 }),
            json!({ "kind": "provisional", "text": "bon" }),
            json!({ "kind": "fixed", "text": "bon" }),
            json!({ "kind": "ended" }),
        ]
    );
}

#[test]
fn an_engine_that_stops_by_itself_is_told_with_its_message() {
    let (window, _) = window(Some(
        FakeTranscriber::new()
            .saying(vec![VoiceEvent::Failed(VoiceFailure::NoMicrophone)])
            .ending_by_itself(),
    ));
    let received = listening(&window);
    call(&window, "start_voice_input", json!({})).unwrap();
    assert_eq!(
        wait_for(&received, "ended"),
        vec![
            json!({ "kind": "failed", "reason": "noMicrophone", "message": "Aucun micro disponible." }),
            json!({ "kind": "ended" }),
        ]
    );
}
