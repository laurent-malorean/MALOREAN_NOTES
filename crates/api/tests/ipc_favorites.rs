//! Les commandes des favoris, appelées comme le fait l'interface (fiche 0102).

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::Arc;

use api::Session;
use api::commands::invoke_handler;
use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};
use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{WebviewWindow, WebviewWindowBuilder};

fn window(notes: &[(&str, &str)]) -> WebviewWindow<MockRuntime> {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(
            notes,
        )))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    let app = mock_builder()
        .manage(Arc::new(session))
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    call(
        &window,
        "add_workspace",
        json!({ "name": "Notes", "folder": "/Users/moi/Notes" }),
    )
    .unwrap();
    window
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

fn text(window: &WebviewWindow<MockRuntime>, path: &str) -> String {
    let note = call(window, "read_note", json!({ "path": path })).unwrap();
    note["content"].as_str().unwrap().to_owned()
}

const NOTES: [(&str, &str); 3] = [
    ("courses.md", "# Courses"),
    ("plan.canvas", "{}"),
    ("fiche.md", "---\ntype: crm-personne\n---\n# Léa"),
];

fn is_favorite(window: &WebviewWindow<MockRuntime>, path: &str) -> bool {
    call(window, "is_favorite", json!({ "path": path }))
        .unwrap()
        .as_bool()
        .unwrap()
}

#[test]
fn the_interface_creates_the_favorites_note() {
    let window = window(&NOTES);
    assert_eq!(
        call(&window, "favorites_note", json!({})).unwrap(),
        Value::Null
    );
    assert!(!is_favorite(&window, "courses.md"));

    let created = call(
        &window,
        "create_favorites_note",
        json!({ "title": "Favoris", "folder": "" }),
    )
    .unwrap();

    assert_eq!(created, json!({ "path": "favoris.md", "title": "Favoris" }));
    assert_eq!(call(&window, "favorites_note", json!({})).unwrap(), created);
}

#[test]
fn the_interface_stars_and_unstars_a_content_and_cancels_the_removal() {
    let window = window(&NOTES);
    call(
        &window,
        "create_favorites_note",
        json!({ "title": "Favoris", "folder": "" }),
    )
    .unwrap();

    call(&window, "add_favorite", json!({ "path": "courses.md" })).unwrap();
    call(&window, "add_favorite", json!({ "path": "plan.canvas" })).unwrap();
    let both = "# Favoris\n- [[Courses]]\n- [[plan.canvas]]\n";
    assert_eq!(text(&window, "favoris.md"), both);
    assert!(is_favorite(&window, "courses.md"));

    let removed = call(&window, "remove_favorite", json!({ "path": "courses.md" })).unwrap();
    assert_eq!(removed, json!([{ "index": 1, "text": "- [[Courses]]\n" }]));
    assert_eq!(
        text(&window, "favoris.md"),
        "# Favoris\n- [[plan.canvas]]\n"
    );
    assert!(!is_favorite(&window, "courses.md"));

    call(&window, "restore_favorites", json!({ "removed": removed })).unwrap();
    assert_eq!(text(&window, "favoris.md"), both);
}

#[test]
fn the_interface_chooses_a_note_and_stops_using_it_without_deleting_it() {
    let window = window(&NOTES);
    let chosen = call(
        &window,
        "choose_favorites_note",
        json!({ "path": "courses.md" }),
    )
    .unwrap();
    assert_eq!(chosen, json!({ "path": "courses.md", "title": "Courses" }));
    call(&window, "stop_using_favorites_note", json!({})).unwrap();
    assert_eq!(
        call(&window, "favorites_note", json!({})).unwrap(),
        Value::Null
    );
    assert_eq!(text(&window, "courses.md"), "# Courses");
}

#[test]
fn a_refused_favorite_says_why_in_french() {
    let window = window(&NOTES);
    assert_eq!(
        call(&window, "add_favorite", json!({ "path": "courses.md" })).unwrap_err()["message"],
        "Aucune note des favoris n'est choisie."
    );
    assert_eq!(
        call(&window, "remove_favorite", json!({ "path": "courses.md" })).unwrap_err()["message"],
        "Aucune note des favoris n'est choisie."
    );
    call(
        &window,
        "choose_favorites_note",
        json!({ "path": "courses.md" }),
    )
    .unwrap();
    assert_eq!(
        call(&window, "add_favorite", json!({ "path": "fiche.md" })).unwrap_err()["message"],
        "Une fiche du CRM n'a pas d'étoile : seul le CRM entier se met en favori."
    );
    assert_eq!(
        call(&window, "add_favorite", json!({ "path": "courses.md" })).unwrap_err()["message"],
        "La note des favoris ne se met pas elle-même en favori."
    );
    assert!(
        call(
            &window,
            "choose_favorites_note",
            json!({ "path": "plan.canvas" })
        )
        .is_err()
    );
}

#[test]
fn the_favorites_note_follows_a_rename_and_a_move_made_by_the_interface() {
    let window = window(&NOTES);
    call(
        &window,
        "create_favorites_note",
        json!({ "title": "Favoris", "folder": "" }),
    )
    .unwrap();
    call(
        &window,
        "create_folder",
        json!({ "parent": "", "name": "Perso" }),
    )
    .unwrap();
    let moved = call(
        &window,
        "move_note",
        json!({ "path": "favoris.md", "into": "Perso" }),
    )
    .unwrap();
    assert_eq!(moved["path"], "Perso/favoris.md");
    let renamed = call(
        &window,
        "rename_note",
        json!({ "path": "Perso/favoris.md", "title": "Mes favoris" }),
    )
    .unwrap();
    assert_eq!(renamed["path"], "Perso/mes-favoris.md");
    assert_eq!(
        call(&window, "favorites_note", json!({})).unwrap(),
        json!({ "path": "Perso/mes-favoris.md", "title": "Mes favoris" })
    );
}

#[test]
fn without_a_workspace_open_the_favorites_are_refused() {
    let session = Session::new(
        Arc::new(FakeOpener::new(Arc::new(
            InMemoryNoteStore::with_notes(&[]),
        ))),
        Arc::new(FakePreferences::default()),
        Arc::new(FixedClock::default()),
    );
    let app = mock_builder()
        .manage(Arc::new(session))
        .invoke_handler(invoke_handler())
        .build(mock_context(noop_assets()))
        .unwrap();
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    assert!(call(&window, "favorites_note", json!({})).is_err());
    assert!(call(&window, "add_favorite", json!({ "path": "a.md" })).is_err());
}
