//! Les commandes de l'agenda 12, appelées comme le fait l'interface : nom, arguments JSON en camelCase,
//! erreurs `{ message }` en français (fiche 0104). Le jour du Mac est le 16/11/2026.

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

type Window = WebviewWindow<MockRuntime>;

fn window(notes: &[(&str, &str)]) -> Window {
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

fn call(window: &Window, command: &str, args: Value) -> Result<Value, Value> {
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

fn run(window: &Window, command: &str, args: Value) -> Value {
    call(window, command, args).unwrap()
}

fn opened(notes: &[(&str, &str)]) -> Window {
    let window = window(notes);
    run(&window, "reopen_last_workspace", json!({}));
    window
}

const EVENT: &str = "---\ntype: agenda-12-evenement\nmois: 2\njour: 10\nannee: 2027\njour-fin: 13\npays: DE\nville: Nuremberg\ntags: [salon]\n---\n# Salon Embedded World\n\nStand.\n";

fn workspace() -> Vec<(&'static str, &'static str)> {
    vec![
        (
            "salons.md",
            "---\ntype: agenda-12\ncolonnes: 6\n---\n# Salons\n",
        ),
        ("salons/embedded.md", EVENT),
        (
            "salons/archives/passe.md",
            "---\ntype: agenda-12-evenement\nmois: 3\nannee: 2025\nclos-le: 2026-03-01\n---\n# Passé\n",
        ),
    ]
}

#[test]
fn an_agenda_is_created_and_read_with_the_argument_names_used_by_the_interface() {
    let window = opened(&[("note.md", "# Note")]);
    let created = run(
        &window,
        "create_agenda_12",
        json!({ "folder": "", "title": "Salons" }),
    );
    assert_eq!(created, json!({ "path": "salons.md" }));
    let read = run(
        &window,
        "read_agenda_12",
        json!({ "path": "salons.md", "tag": null }),
    );
    assert_eq!(read["title"], "Salons");
    assert_eq!(read["columns"], 4);
    assert_eq!(read["layout"], "grid");
    assert_eq!(read["cells"].as_array().unwrap().len(), 12);
    assert_eq!(
        read["cells"][0],
        json!({ "month": 1, "name": "janvier", "events": [] })
    );
    assert_eq!(read["archives"], json!([]));
    assert_eq!(read["unreadable"], json!([]));
    assert_eq!(read["tags"], json!([]));
}

#[test]
fn a_grid_is_read_with_the_json_the_interface_receives() {
    let window = opened(&workspace());
    let read = run(&window, "read_agenda_12", json!({ "path": "salons.md" }));
    assert_eq!(read["columns"], 6);
    assert_eq!(read["tags"], json!(["salon"]));
    assert_eq!(
        read["cells"][1]["events"][0],
        json!({
            "path": "salons/embedded.md",
            "title": "Salon Embedded World",
            "month": 2, "day": 10, "year": 2027,
            "end": { "day": 13, "month": 2 },
            "country": { "code": "DE", "name": "Allemagne", "flag": "🇩🇪" },
            "city": "Nuremberg",
            "tags": ["salon"],
            "closedOn": null,
            "line": {
                "date": "10–13/02", "year": 2027, "yearTone": "next", "flag": "🇩🇪",
                "city": "Nuremberg", "title": "Salon Embedded World",
                "text": "10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World"
            }
        })
    );
    assert_eq!(read["archives"][0]["closedOn"], "2026-03-01");
    assert_eq!(read["archives"][0]["line"]["yearTone"], "past");
    let filtered = run(
        &window,
        "read_agenda_12",
        json!({ "path": "salons.md", "tag": "absente" }),
    );
    assert_eq!(filtered["cells"][1]["events"], json!([]));
    assert_eq!(filtered["tags"], json!(["salon"]));
}

#[test]
fn the_columns_are_kept_and_a_wrong_number_is_refused_with_a_message() {
    let window = opened(&workspace());
    run(
        &window,
        "change_agenda_12_columns",
        json!({ "path": "salons.md", "columns": 3 }),
    );
    assert_eq!(
        run(&window, "read_agenda_12", json!({ "path": "salons.md" }))["columns"],
        3
    );
    let refused = call(
        &window,
        "change_agenda_12_columns",
        json!({ "path": "salons.md", "columns": 5 }),
    );
    assert_eq!(
        refused,
        Err(json!({ "message": "« 5 » colonnes : la grille a 3, 4 ou 6 colonnes." }))
    );
}

#[test]
fn the_layout_is_kept_and_a_wrong_value_is_refused() {
    let window = opened(&workspace());
    run(
        &window,
        "change_agenda_12_layout",
        json!({ "path": "salons.md", "layout": "list" }),
    );
    assert_eq!(
        run(&window, "read_agenda_12", json!({ "path": "salons.md" }))["layout"],
        "list"
    );
    run(
        &window,
        "change_agenda_12_layout",
        json!({ "path": "salons.md", "layout": "grid" }),
    );
    assert_eq!(
        run(&window, "read_agenda_12", json!({ "path": "salons.md" }))["layout"],
        "grid"
    );
    assert!(
        call(
            &window,
            "change_agenda_12_layout",
            json!({ "path": "salons.md", "layout": "table" }),
        )
        .is_err()
    );
}

#[test]
fn the_plus_of_a_cell_creates_an_untitled_event_of_its_month() {
    let window = opened(&workspace());
    let created = run(
        &window,
        "create_agenda_12_event",
        json!({ "agenda": "salons.md", "month": 4 }),
    );
    assert_eq!(created, json!({ "path": "salons/sans-titre.md" }));
    let event = run(
        &window,
        "read_agenda_12_event",
        json!({ "path": "salons/sans-titre.md" }),
    );
    assert_eq!(event["agenda"], "salons.md");
    assert_eq!(event["agendaTitle"], "Salons");
    assert_eq!(event["closed"], false);
    assert_eq!(event["event"]["title"], "Sans titre");
    assert_eq!(event["event"]["month"], 4);
    let refused = call(
        &window,
        "create_agenda_12_event",
        json!({ "agenda": "salons.md", "month": 13 }),
    );
    assert_eq!(
        refused,
        Err(
            json!({ "message": "« 13 » n'est pas un mois : un nombre de 1 (janvier) à 12 (décembre) est attendu." })
        )
    );
}

fn change(window: &Window, change: Value) {
    run(
        window,
        "change_agenda_12_event",
        json!({ "path": "salons/embedded.md", "change": change }),
    );
}

fn event(window: &Window) -> Value {
    run(
        window,
        "read_agenda_12_event",
        json!({ "path": "salons/embedded.md" }),
    )["event"]
        .clone()
}

#[test]
fn each_gesture_on_an_event_is_sent_as_a_tagged_object() {
    let window = opened(&workspace());
    change(
        &window,
        json!({ "kind": "title", "title": "Embedded World 2027" }),
    );
    change(&window, json!({ "kind": "month", "month": 3 }));
    change(&window, json!({ "kind": "day", "day": 11 }));
    change(&window, json!({ "kind": "year", "year": 2028 }));
    change(
        &window,
        json!({ "kind": "end", "end": { "day": 3, "month": 4 } }),
    );
    change(&window, json!({ "kind": "country", "country": "at" }));
    change(&window, json!({ "kind": "city", "city": "Vienne" }));
    change(&window, json!({ "kind": "tags", "tags": ["pro"] }));
    let event = event(&window);
    assert_eq!(event["title"], "Embedded World 2027");
    assert_eq!(event["month"], 3);
    assert_eq!(event["day"], 11);
    assert_eq!(event["year"], 2028);
    assert_eq!(event["end"], json!({ "day": 3, "month": 4 }));
    assert_eq!(event["country"]["code"], "AT");
    assert_eq!(event["city"], "Vienne");
    assert_eq!(event["tags"], json!(["pro"]));
}

#[test]
fn a_field_is_cleared_by_sending_null() {
    let window = opened(&workspace());
    change(&window, json!({ "kind": "end", "end": null }));
    change(&window, json!({ "kind": "day", "day": null }));
    change(&window, json!({ "kind": "country", "country": null }));
    let event = event(&window);
    assert_eq!(event["end"], Value::Null);
    assert_eq!(event["day"], Value::Null);
    assert_eq!(event["country"], Value::Null);
}

#[test]
fn an_impossible_date_is_refused_with_a_message_ready_to_show() {
    let window = opened(&workspace());
    let refused = call(
        &window,
        "change_agenda_12_event",
        json!({ "path": "salons/embedded.md", "change": { "kind": "day", "day": 31 } }),
    );
    assert_eq!(
        refused,
        Err(json!({ "message": "Ce jour n'existe pas dans ce mois." }))
    );
    let before_end = call(
        &window,
        "change_agenda_12_event",
        json!({ "path": "salons/embedded.md", "change": { "kind": "day", "day": 14 } }),
    );
    assert_eq!(
        before_end,
        Err(json!({ "message": "La fin est avant le début." }))
    );
    let unknown = call(
        &window,
        "change_agenda_12_event",
        json!({ "path": "salons/embedded.md", "change": { "kind": "country", "country": "ZZ" } }),
    );
    assert_eq!(
        unknown,
        Err(
            json!({ "message": "« ZZ » n'est pas un pays connu : un code sur deux lettres (FR, DE, US…) est attendu." })
        )
    );
    let empty = call(
        &window,
        "change_agenda_12_event",
        json!({ "path": "salons/embedded.md", "change": { "kind": "title", "title": " " } }),
    );
    assert_eq!(empty, Err(json!({ "message": "Le titre est vide." })));
}

#[test]
fn closing_with_the_next_prepared_then_reopening_follows_the_screen() {
    let window = opened(&workspace());
    let closed = run(
        &window,
        "close_agenda_12_event",
        json!({ "path": "salons/embedded.md", "closing": "withSuccessor" }),
    );
    assert_eq!(
        closed,
        json!({ "closed": "salons/archives/embedded.md", "successor": "salons/salon-embedded-world.md" })
    );
    let read = run(&window, "read_agenda_12", json!({ "path": "salons.md" }));
    assert_eq!(read["archives"].as_array().unwrap().len(), 2);
    assert_eq!(read["archives"][0]["closedOn"], "2026-11-16");
    assert_eq!(read["cells"][1]["events"][0]["day"], Value::Null);
    let twice = call(
        &window,
        "close_agenda_12_event",
        json!({ "path": "salons/archives/embedded.md", "closing": "alone" }),
    );
    assert_eq!(
        twice,
        Err(json!({ "message": "Cet événement est déjà clos." }))
    );
    let reopened = run(
        &window,
        "reopen_agenda_12_event",
        json!({ "path": "salons/archives/embedded.md" }),
    );
    assert_eq!(reopened, json!({ "path": "salons/embedded.md" }));
    let open = call(
        &window,
        "reopen_agenda_12_event",
        json!({ "path": "salons/embedded.md" }),
    );
    assert_eq!(
        open,
        Err(json!({ "message": "Cet événement n'est pas clos." }))
    );
}

#[test]
fn closing_alone_creates_no_copy() {
    let window = opened(&workspace());
    let closed = run(
        &window,
        "close_agenda_12_event",
        json!({ "path": "salons/embedded.md", "closing": "alone" }),
    );
    assert_eq!(
        closed,
        json!({ "closed": "salons/archives/embedded.md", "successor": null })
    );
    let read = run(&window, "read_agenda_12", json!({ "path": "salons.md" }));
    assert_eq!(read["cells"][1]["events"], json!([]));
}

#[test]
fn an_event_goes_to_the_trash_and_a_gone_one_is_told_so() {
    let window = opened(&workspace());
    let trashed = run(
        &window,
        "delete_agenda_12_event",
        json!({ "path": "salons/archives/passe.md" }),
    );
    assert_eq!(trashed, json!("salons/archives/passe.md"));
    let gone = call(
        &window,
        "delete_agenda_12_event",
        json!({ "path": "salons/archives/passe.md" }),
    );
    assert_eq!(
        gone,
        Err(json!({ "message": "Cet événement n'existe plus." }))
    );
    let read = call(
        &window,
        "read_agenda_12_event",
        json!({ "path": "salons/absent.md" }),
    );
    assert_eq!(
        read,
        Err(json!({ "message": "Cet événement n'existe plus." }))
    );
    let note = call(
        &window,
        "read_agenda_12",
        json!({ "path": "salons/embedded.md" }),
    );
    assert_eq!(
        note,
        Err(json!({ "message": "cette note n'est pas un agenda 12" }))
    );
}

#[test]
fn the_list_of_countries_is_sorted_by_french_name_with_flags() {
    let window = window(&[]);
    let list = run(&window, "list_countries", json!({}));
    let list = list.as_array().unwrap();
    assert_eq!(list.len(), 249);
    assert_eq!(
        list[0],
        json!({ "code": "AF", "name": "Afghanistan", "flag": "🇦🇫" })
    );
    assert!(list.contains(&json!({ "code": "FR", "name": "France", "flag": "🇫🇷" })));
}

#[test]
fn a_note_that_is_not_an_agenda_has_no_layout_to_change() {
    let window = opened(&[("note.md", "# Note")]);
    let refused = call(
        &window,
        "change_agenda_12_layout",
        json!({ "path": "note.md", "layout": "list" }),
    );
    assert_eq!(
        refused,
        Err(json!({ "message": "cette note n'est pas un agenda 12" }))
    );
}

#[test]
fn a_note_that_is_not_an_agenda_has_no_columns_to_change() {
    let window = opened(&[("note.md", "# Note")]);
    let refused = call(
        &window,
        "change_agenda_12_columns",
        json!({ "path": "note.md", "columns": 3 }),
    );
    assert_eq!(
        refused,
        Err(json!({ "message": "cette note n'est pas un agenda 12" }))
    );
}
