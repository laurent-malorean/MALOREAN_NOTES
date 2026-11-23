//! Les commandes de l'export, appelées comme le fait l'interface : nom, arguments JSON.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::Arc;

use api::Session;
use api::commands::invoke_handler;
use application::testing::{
    FakeOpener, FakePreferences, FixedClock, InMemoryClipboard, InMemoryExportStore,
    InMemoryNoteStore,
};
use application::{Preferences, Workspace, WorkspaceLocation, WorkspaceName, Workspaces};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};

const BRIDGE_SOURCE: &str = include_str!("../../../ui/src/bridge/index.ts");

/// Une fenêtre simulée sur un espace de travail en mémoire, dont les exports vont dans `exports`.
fn window(notes: &[(&str, &str)], exports: Arc<InMemoryExportStore>) -> WebviewWindow<MockRuntime> {
    let preferences = FakePreferences::default();
    let first = Workspace {
        name: WorkspaceName::new("Notes").unwrap(),
        location: WorkspaceLocation::new("/Users/moi/Notes").unwrap(),
    };
    preferences
        .save_workspaces(&Workspaces::default().added(first).unwrap())
        .unwrap();
    let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
    let session = Session::new(
        Arc::new(opener),
        Arc::new(preferences),
        Arc::new(FixedClock::default()),
    )
    .with_exports(exports);
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
    send(window, command, InvokeBody::Json(args), &[])
}

/// Envoie une commande comme l'interface : un corps, et des en-têtes encodés comme une adresse.
fn send(
    window: &WebviewWindow<MockRuntime>,
    command: &str,
    body: InvokeBody,
    headers: &[(&str, &str)],
) -> Result<Value, Value> {
    let mut map = tauri::http::HeaderMap::new();
    for (name, value) in headers {
        map.insert(
            tauri::http::HeaderName::from_bytes(name.as_bytes()).unwrap(),
            value.parse().unwrap(),
        );
    }
    let request = InvokeRequest {
        cmd: command.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "tauri://localhost".parse().unwrap(),
        body,
        headers: map,
        invoke_key: INVOKE_KEY.to_string(),
    };
    get_ipc_response(window, request).map(|body| body.deserialize::<Value>().unwrap())
}

#[test]
fn a_note_is_exported_in_markdown_with_the_argument_names_used_by_the_interface() {
    let exports = Arc::new(InMemoryExportStore::default());
    let window = window(&[("a.md", "# Alpha\ntexte")], Arc::clone(&exports));
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let args = json!({ "path": "a.md", "destination": "/Users/moi/Documents/Alpha.md" });
    call(&window, "export_markdown", args).unwrap();
    assert_eq!(
        exports.file("/Users/moi/Documents/Alpha.md"),
        Some(b"# Alpha\ntexte".to_vec())
    );
    assert!(BRIDGE_SOURCE.contains("\"export_markdown\", { path, destination }"));
}

#[test]
fn a_pdf_is_refused_outside_a_complete_path() {
    let window = window(&[], Arc::new(InMemoryExportStore::default()));
    let refused = call(&window, "export_pdf", json!({ "destination": "Alpha.pdf" }));
    assert_eq!(
        refused.unwrap_err()["message"],
        "emplacement d'export invalide : « Alpha.pdf »"
    );
    assert!(BRIDGE_SOURCE.contains("\"export_pdf\", { destination }"));
    assert!(BRIDGE_SOURCE.contains("\"choose_export_file\", { title, format, folder, near }"));
}

#[test]
fn printing_asks_the_window_for_its_print_panel() {
    let window = window(&[], Arc::new(InMemoryExportStore::default()));
    // Le simulateur de Tauri n'a pas de WebKit : l'interface n'est jamais imprimée, et le dit.
    let refused = call(&window, "print_page", json!({}));
    assert!(
        refused.unwrap_err()["message"]
            .as_str()
            .unwrap()
            .starts_with("erreur interne")
    );
    assert!(BRIDGE_SOURCE.contains("invoke<null>(\"print_page\")"));
}

#[test]
fn copying_puts_the_html_and_the_plain_text_or_the_markdown_on_the_clipboard() {
    let clipboard = Arc::new(InMemoryClipboard::default());
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::default()))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    )
    .with_clipboard(Arc::clone(&clipboard) as _);
    let app = mock_builder()
        .manage(Arc::new(session))
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let args = json!({ "html": "<p><em>Été</em></p>", "text": "Été" });
    call(&window, "copy_rich_text", args).unwrap();
    assert_eq!(
        clipboard.copied(),
        Some((Some("<p><em>Été</em></p>".to_owned()), "Été".to_owned()))
    );
    assert!(BRIDGE_SOURCE.contains("\"copy_rich_text\", { html, text }"));
    call(
        &window,
        "copy_plain_text",
        json!({ "text": "# Été\n\n*là*\n" }),
    )
    .unwrap();
    assert_eq!(
        clipboard.copied(),
        Some((None, "# Été\n\n*là*\n".to_owned()))
    );
    assert!(BRIDGE_SOURCE.contains("\"copy_plain_text\", { text }"));
}

#[test]
fn copying_without_a_clipboard_says_so() {
    let window = window(&[], Arc::new(InMemoryExportStore::default()));
    let refused = call(&window, "copy_rich_text", json!({ "html": "", "text": "" }));
    assert_eq!(
        refused.unwrap_err()["message"],
        "le presse-papiers n'est pas disponible"
    );
    let refused = call(&window, "copy_plain_text", json!({ "text": "" }));
    assert_eq!(
        refused.unwrap_err()["message"],
        "le presse-papiers n'est pas disponible"
    );
}

#[test]
fn an_image_is_written_as_sent_to_the_destination_of_its_header() {
    let exports = Arc::new(InMemoryExportStore::default());
    let window = window(&[], Arc::clone(&exports));
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    send(
        &window,
        "export_image",
        InvokeBody::Raw(b"\x89PNG".to_vec()),
        &[(
            "x-destination",
            "%2FUsers%2Fmoi%2FDocuments%2FCarte%20%C3%A9t%C3%A9.png",
        )],
    )
    .unwrap();
    assert_eq!(
        exports.file("/Users/moi/Documents/Carte été.png"),
        Some(b"\x89PNG".to_vec())
    );
    assert!(BRIDGE_SOURCE.contains("\"x-destination\": encodeURIComponent(destination)"));
}

#[test]
fn an_image_without_its_content_or_its_destination_is_refused_with_a_message() {
    let window = window(&[], Arc::new(InMemoryExportStore::default()));
    let message = "l'image à enregistrer n'a pas été reçue en entier";
    let no_content = send(
        &window,
        "export_image",
        InvokeBody::Json(json!({})),
        &[("x-destination", "%2FCarte.png")],
    )
    .unwrap_err();
    assert_eq!(no_content["message"], message);
    let no_destination = send(
        &window,
        "export_image",
        InvokeBody::Raw(b"PNG".to_vec()),
        &[],
    )
    .unwrap_err();
    assert_eq!(no_destination["message"], message);
}
