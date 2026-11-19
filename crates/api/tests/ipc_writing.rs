//! Les commandes de l'aide à l'écriture, appelées comme le fait l'interface (nom, arguments JSON),
//! sur le faux assistant d'écriture.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::Arc;

use api::Session;
use api::commands::invoke_handler;
use application::testing::{
    FakeOpener, FakePreferences, FakeWritingAssistant, FixedClock, InMemoryNoteStore,
};
use application::{AssistError, Unavailability};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};

const BRIDGE_SOURCE: &str = include_str!("../../../ui/src/bridge/index.ts");

/// Une fenêtre simulée, sans espace de travail ouvert : l'aide à l'écriture n'en a pas besoin.
fn window(assistant: Option<FakeWritingAssistant>) -> WebviewWindow<MockRuntime> {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::default()))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    let session = match assistant {
        Some(assistant) => session.with_writing_assistant(Arc::new(assistant)),
        None => session,
    };
    let app = mock_builder()
        .manage(Arc::new(session))
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap()
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

#[test]
fn a_proposal_comes_back_with_its_word_differences_and_the_argument_names_used_by_the_page() {
    let window = window(Some(FakeWritingAssistant::default()));
    let args = json!({ "action": "correct", "selection": "Une fote." });
    let proposal = call(&window, "propose_rewriting", args).unwrap();
    assert_eq!(
        proposal,
        json!({
            "text": "Une faute.",
            "differences": [
                { "kind": "same", "text": "Une " },
                { "kind": "removed", "text": "fote." },
                { "kind": "added", "text": "faute." },
            ],
        })
    );
    assert!(BRIDGE_SOURCE.contains("\"propose_rewriting\", { action, selection }"));
    assert!(BRIDGE_SOURCE.contains("\"assistant_status\""));
}

#[test]
fn an_available_assistant_says_so() {
    let window = window(Some(FakeWritingAssistant::default()));
    let status = call(&window, "assistant_status", json!({})).unwrap();
    assert_eq!(status, json!({ "kind": "available" }));
}

#[test]
fn an_unavailable_assistant_says_why_in_words_for_the_page() {
    let window = window(Some(FakeWritingAssistant::unavailable(
        Unavailability::AppleIntelligenceDisabled,
    )));
    let reason =
        "Apple Intelligence n'est pas activé : Réglages Système, « Apple Intelligence et Siri »";
    let status = call(&window, "assistant_status", json!({})).unwrap();
    assert_eq!(status, json!({ "kind": "unavailable", "reason": reason }));
    let refused = call(
        &window,
        "propose_rewriting",
        json!({ "action": "summarize", "selection": "Texte." }),
    );
    assert_eq!(refused, Err(json!({ "message": reason })));
}

#[test]
fn a_session_without_assistant_reports_it_missing() {
    let window = window(None);
    let missing = "l'assistant d'écriture est introuvable : réinstallez l'application";
    let status = call(&window, "assistant_status", json!({})).unwrap();
    assert_eq!(status, json!({ "kind": "unavailable", "reason": missing }));
    let refused = call(
        &window,
        "propose_rewriting",
        json!({ "action": "rephrase", "selection": "Texte." }),
    );
    assert_eq!(refused, Err(json!({ "message": missing })));
}

#[test]
fn a_refusal_of_the_model_is_reported() {
    let window = window(Some(FakeWritingAssistant::failing(AssistError::Refused)));
    let refused = call(
        &window,
        "propose_rewriting",
        json!({ "action": "correct", "selection": "Texte." }),
    );
    assert_eq!(
        refused,
        Err(json!({ "message": "le modèle d'Apple a refusé de traiter ce texte" }))
    );
}

#[test]
fn an_unknown_action_from_the_page_is_refused() {
    let window = window(Some(FakeWritingAssistant::default()));
    let refused = call(
        &window,
        "propose_rewriting",
        json!({ "action": "traduire", "selection": "Texte." }),
    );
    assert!(refused.is_err());
}
