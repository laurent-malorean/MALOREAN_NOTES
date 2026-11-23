//! Les commandes des cahiers de recherche, appelées comme le fait l'interface : nom, arguments
//! JSON.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::Arc;

use api::Session;
use api::commands::invoke_handler;
use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};
use application::{Preferences, Workspace, WorkspaceLocation, WorkspaceName, Workspaces};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};

const BRIDGE_SOURCE: &str = include_str!("../../../ui/src/bridge/index.ts");

/// Une fenêtre simulée sur un espace de travail en mémoire, déjà rouvrable.
fn window(notes: &[(&str, &str)]) -> WebviewWindow<MockRuntime> {
    let preferences = FakePreferences::default();
    let first = Workspace {
        name: WorkspaceName::new("Notes").unwrap(),
        location: WorkspaceLocation::new("/Users/moi/Notes").unwrap(),
    };
    preferences
        .save_workspaces(&Workspaces::default().added(first).unwrap())
        .unwrap();
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(
            notes,
        )))),
        Arc::new(preferences),
        Arc::new(FixedClock::default()),
    );
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

/// Un espace de travail rouvert, avec le cahier `levures.md` créé par la commande.
fn with_notebook() -> WebviewWindow<MockRuntime> {
    let window = window(&[("note.md", "# Note")]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let created = call(
        &window,
        "create_research_notebook",
        json!({ "folder": "", "title": "Levures" }),
    )
    .unwrap();
    assert_eq!(created, json!({ "path": "levures.md" }));
    window
}

fn added(window: &WebviewWindow<MockRuntime>, text: &str) -> Value {
    call(
        window,
        "add_entry",
        json!({ "path": "levures.md", "text": text }),
    )
    .unwrap()
}

#[test]
fn a_notebook_is_created_then_receives_entries_with_the_argument_names_used_by_the_interface() {
    let window = with_notebook();
    let entry = json!({
        "anchor": "2026-11-16-18h30",
        "label": "16 novembre 2026 à 18:30",
        "text": "un",
        "line": 11,
    });
    assert_eq!(added(&window, "un"), entry);
    let second = added(&window, "deux");
    assert_eq!(second["anchor"], "2026-11-16-18h30-2");
    let entries = call(&window, "list_entries", json!({ "path": "levures.md" })).unwrap();
    assert_eq!(entries[0], entry);
    assert_eq!(entries.as_array().unwrap().len(), 2);
    assert!(BRIDGE_SOURCE.contains("\"create_research_notebook\", { folder, title }"));
    assert!(BRIDGE_SOURCE.contains("\"add_entry\", { path, text }"));
    assert!(BRIDGE_SOURCE.contains("\"list_entries\", { path }"));
}

#[test]
fn an_entry_is_refused_to_a_note() {
    let window = with_notebook();
    let refused = call(
        &window,
        "add_entry",
        json!({ "path": "note.md", "text": "un" }),
    );
    assert_eq!(
        refused.unwrap_err()["message"],
        "cette note n'est pas un cahier de recherche"
    );
}

#[test]
fn an_entry_found_by_the_search_carries_its_type_and_notebook() {
    let window = window(&[(
        "levures.md",
        "---\ntype: cahier-de-recherche\n---\n# Levures\n## 2026\n### Novembre\n\
         #### Lundi 16\n- 09:42 - du pain",
    )]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let found = call(
        &window,
        "search_notes",
        json!({ "query": "pain", "order": "modified" }),
    )
    .unwrap();
    assert_eq!(found[0]["contentType"], "researchNotebook");
    assert_eq!(found[0]["containerTitle"], Value::Null);
    assert_eq!(found[1]["contentType"], "entry");
    assert_eq!(found[1]["title"], "16 novembre 2026 à 09:42");
    assert_eq!(found[1]["container"], "levures.md");
    assert_eq!(found[1]["containerTitle"], "Levures");
}
