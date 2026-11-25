//! Les commandes du CRM, appelées comme le fait l'interface : nom, arguments JSON (fiche 0058).

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

fn filters() -> Value {
    json!({ "search": "", "person": null, "company": null, "projects": [], "tags": [] })
}

fn read(window: &WebviewWindow<MockRuntime>) -> Value {
    call(
        window,
        "read_crm",
        json!({ "path": "clients.md", "filters": filters(), "weekDay": null }),
    )
    .unwrap()
}

type Window = WebviewWindow<MockRuntime>;

fn run(window: &Window, command: &str, args: Value) -> Value {
    call(window, command, args).unwrap()
}

/// Un CRM « Clients » avec une entreprise, une personne, un projet et une action.
fn build(window: &Window) {
    let crm = "clients.md";
    let created = run(
        window,
        "create_crm",
        json!({ "folder": "", "title": "Clients" }),
    );
    assert_eq!(created, json!({ "path": crm }));
    let company = run(
        window,
        "create_crm_company",
        json!({ "crm": crm, "name": "Acme" }),
    );
    assert_eq!(company, json!("acme"));
    let person = run(
        window,
        "create_crm_person",
        json!({ "crm": crm, "name": "Jean Dupont", "company": "acme" }),
    );
    assert_eq!(person, json!("jean-dupont"));
    let project = run(
        window,
        "create_crm_project",
        json!({ "crm": crm, "name": "Refonte" }),
    );
    assert_eq!(project, json!("refonte"));
    let draft = json!({
        "title": "Devis", "status": null, "date": "2026-11-10", "people": ["jean-dupont"],
        "channel": null, "project": "refonte", "color": null, "tags": [], "linkedNotes": [],
        "description": ""
    });
    let action = run(
        window,
        "create_crm_action",
        json!({ "crm": crm, "draft": draft }),
    );
    assert_eq!(action, json!("2026-11-16-devis"));
}

#[test]
fn a_crm_is_built_and_read_with_the_argument_names_used_by_the_interface() {
    let window = window(&[("note.md", "# Note")]);
    run(&window, "reopen_last_workspace", json!({}));
    build(&window);
    let view = read(&window);
    assert_eq!(view["title"], "Clients");
    assert_eq!(
        view["actions"][0]["urgency"],
        json!({ "kind": "late", "days": 6 })
    );
    assert_eq!(
        view["actions"][0]["people"][0],
        json!({ "person": "jean-dupont", "company": "acme" })
    );
    assert_eq!(view["columns"][0]["cards"], json!(["2026-11-16-devis"]));
    assert_eq!(view["week"]["late"], json!(["2026-11-16-devis"]));
    assert_eq!(
        view["nodata"]["tally"],
        json!({ "open": 0, "late": 0, "today": 0 })
    );
}

fn workspace() -> Vec<(&'static str, &'static str)> {
    vec![
        ("clients.md", "---\ntype: crm\n---\n# Clients\n"),
        (
            "clients/entreprises/acme.md",
            "---\ntype: crm-entreprise\n---\n# Acme\n",
        ),
        (
            "clients/personnes/jean.md",
            "---\ntype: crm-personne\nentreprise: '[[acme]]'\nparcours: ['[[acme]] · 2026-03-01 →']\n---\n# Jean\n",
        ),
        (
            "clients/projets/refonte.md",
            "---\ntype: crm-projet\ncouleur: bleu\n---\n# Refonte\n",
        ),
        (
            "clients/actions/a.md",
            "---\ntype: crm-action\npersonnes: ['[[jean]] · [[acme]]']\nprojet: '[[refonte]]'\ndate: '2026-11-16'\n---\n# A\n",
        ),
        (
            "clients/actions/b.md",
            "---\ntype: crm-action\ndate: '2026-11-16'\n---\n# B\n",
        ),
    ]
}

#[test]
fn the_gesture_commands_change_the_fiche_they_name() {
    let window = window(&workspace());
    run(&window, "reopen_last_workspace", json!({}));
    let crm = "clients.md";
    run(
        &window,
        "change_crm_action",
        json!({ "crm": crm, "action": "a",
        "change": { "kind": "body", "change": { "kind": "addComment", "text": "Rappelé." } } }),
    );
    run(
        &window,
        "change_crm_action",
        json!({ "crm": crm, "action": "a",
        "change": { "kind": "status", "status": "Progress" } }),
    );
    run(
        &window,
        "move_crm_action",
        json!({ "crm": crm, "action": "b", "status": "Progress",
        "placement": { "kind": "before", "card": "a" } }),
    );
    run(
        &window,
        "change_crm_person",
        json!({ "crm": crm, "person": "jean",
        "change": { "kind": "field", "field": "role", "value": "Chef" } }),
    );
    run(
        &window,
        "change_crm_company",
        json!({ "crm": crm, "company": "acme",
        "change": { "kind": "rename", "name": "Acme France" } }),
    );
    run(
        &window,
        "change_crm_project",
        json!({ "crm": crm, "project": "refonte",
        "change": { "kind": "color", "color": "rose" } }),
    );
    let stages = run(
        &window,
        "change_crm_stages",
        json!({ "crm": crm,
        "change": { "kind": "add", "name": "Négo" } }),
    );
    assert_eq!(stages, json!(["Progress", "WaitingFor", "Négo"]));
    let known = run(
        &window,
        "crm_email_is_known",
        json!({ "crm": crm, "email": "x@y.fr", "except": null }),
    );
    assert_eq!(known, json!(false));
    let view = read(&window);
    assert_eq!(view["people"][0]["role"], "Chef");
    assert_eq!(view["companies"][0]["title"], "Acme France");
    assert_eq!(view["projects"][0]["color"], "rose");
    assert_eq!(view["columns"][1]["cards"], json!(["b", "a"]));
    assert_eq!(view["actions"][0]["comments"][0]["text"], "Rappelé.");
}

#[test]
fn the_delete_commands_trash_the_fiche_and_clean_the_ones_that_name_it() {
    let window = window(&workspace());
    run(&window, "reopen_last_workspace", json!({}));
    let crm = "clients.md";
    run(
        &window,
        "delete_crm_action",
        json!({ "crm": crm, "action": "b" }),
    );
    run(
        &window,
        "delete_crm_project",
        json!({ "crm": crm, "project": "refonte" }),
    );
    run(
        &window,
        "delete_crm_person",
        json!({ "crm": crm, "person": "jean" }),
    );
    run(
        &window,
        "delete_crm_company",
        json!({ "crm": crm, "company": "acme" }),
    );
    let view = read(&window);
    assert_eq!(view["actions"].as_array().unwrap().len(), 1);
    assert_eq!(view["actions"][0]["people"], json!([]));
    assert_eq!(view["actions"][0]["project"], json!(null));
    assert!(view["people"].as_array().unwrap().is_empty());
    assert!(view["companies"].as_array().unwrap().is_empty());
}

#[test]
fn a_refused_crm_command_says_why() {
    let window = window(&[
        ("note.md", "# Note"),
        ("c.md", "---\ntype: crm\n---\n# C\n"),
    ]);
    call(&window, "reopen_last_workspace", json!({})).unwrap();
    let refused =
        |command: &str, args: Value| call(&window, command, args).unwrap_err()["message"].clone();
    assert_eq!(
        refused(
            "read_crm",
            json!({ "path": "note.md", "filters": filters(), "weekDay": null })
        ),
        "cette note n'est pas un CRM"
    );
    assert_eq!(
        refused(
            "change_crm_person",
            json!({ "crm": "c.md", "person": "absente",
            "change": { "kind": "notes", "notes": "x" } })
        ),
        "Cette fiche n'existe plus."
    );
    assert_eq!(
        refused("create_crm_company", json!({ "crm": "c.md", "name": " " })),
        "Le nom est vide."
    );
    assert_eq!(
        refused(
            "change_crm_stages",
            json!({ "crm": "c.md", "change": { "kind": "add", "name": "done" } })
        ),
        "« TODO », « Done » et « Cancel » sont déjà des colonnes."
    );
}

#[test]
fn an_email_written_on_a_person_is_known_to_the_crm() {
    let window = window(&workspace());
    run(&window, "reopen_last_workspace", json!({}));
    let crm = "clients.md";
    let ask = |email: &str| {
        run(
            &window,
            "crm_email_is_known",
            json!({ "crm": crm, "email": email, "except": null }),
        )
    };
    assert_eq!(ask("x@y.fr"), json!(false));
    run(
        &window,
        "change_crm_person",
        json!({ "crm": crm, "person": "jean",
        "change": { "kind": "field", "field": "email", "value": "x@y.fr" } }),
    );
    assert_eq!(ask("x@y.fr"), json!(true));
    assert_eq!(ask("autre@y.fr"), json!(false));
}
