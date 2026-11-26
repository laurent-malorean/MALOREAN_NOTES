//! Les outils qui déplacent et suppriment les actions d'un CRM, joués par leur protocole sur des
//! faux (fiche 0081) : la place d'une carte, ses refus, la corbeille, un autre espace de travail.

use serde_json::{Value, json};

use super::crm_actions_tests::action;
use super::crm_actions_tests::{done, failed, fiche};
use super::crm_reading_tests::{
    APPEL_PATH, APPEL_REF, CLIENTS, DEVIS, DEVIS_PATH, DEVIS_REF, FAIT_REF, clients,
};
use super::tests::opened;
use super::workspaces_tests::world;
use crate::session::Session;

#[test]
fn a_card_moved_to_another_column_changes_its_status_and_loses_its_rank() {
    let session = clients();

    let result = done(
        &session,
        "move_crm_action",
        json!({ "path": "clients.md", "action": DEVIS_REF, "status": "done" }),
    );

    assert_eq!(result["action"]["status"], "Done");
    assert!(!fiche(&session, DEVIS_PATH).contains("rang:"));
    let read = done(&session, "read_crm", json!({ "path": "clients.md" }));
    assert_eq!(read["columns"][1]["count"], 0);
    assert_eq!(read["columns"][3]["count"], 2);
}

/// Les références des cartes de la colonne `status`, dans l'ordre.
fn column_refs(session: &Session, status: &str) -> Vec<String> {
    let read = done(session, "read_crm", json!({ "path": "clients.md" }));
    read["columns"]
        .as_array()
        .unwrap()
        .iter()
        .find(|column| column["status"] == status)
        .unwrap()["actions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|action| action["ref"].as_str().unwrap().to_owned())
        .collect()
}

#[test]
fn a_card_is_placed_before_another_or_at_the_bottom_of_an_open_column() {
    let session = clients();
    let args = |extra: Value| {
        let mut all = json!({ "path": "clients.md", "action": APPEL_REF, "status": "Progress" });
        for (name, value) in extra.as_object().unwrap() {
            all[name] = value.clone();
        }
        all
    };

    done(
        &session,
        "move_crm_action",
        args(json!({ "before": DEVIS_REF })),
    );
    assert_eq!(column_refs(&session, "Progress"), [APPEL_REF, DEVIS_REF]);
    done(&session, "move_crm_action", args(json!({ "at_end": true })));
    assert_eq!(column_refs(&session, "Progress"), [DEVIS_REF, APPEL_REF]);
    done(&session, "move_crm_action", args(json!({})));
    assert!(fiche(&session, APPEL_PATH).contains("statut: Progress"));
}

#[test]
fn a_move_refused_says_why() {
    let session = clients();
    let both = failed(
        &session,
        "move_crm_action",
        json!({ "path": "clients.md", "action": DEVIS_REF, "status": "TODO", "before": APPEL_REF, "at_end": true }),
    );
    assert!(both.contains("soit « before »"), "{both}");
    let status = failed(
        &session,
        "move_crm_action",
        json!({ "path": "clients.md", "action": DEVIS_REF, "status": "Presque" }),
    );
    assert_eq!(status, "« Presque » n'est pas une colonne de ce CRM");
    let gone = failed(
        &session,
        "move_crm_action",
        json!({ "path": "clients.md", "action": "inconnue", "status": "TODO" }),
    );
    assert!(gone.starts_with("Cette fiche n'existe plus."), "{gone}");
    assert_eq!(fiche(&session, DEVIS_PATH), DEVIS);
}

#[test]
fn a_deleted_action_goes_to_the_trash_and_leaves_the_crm_and_the_index() {
    let session = clients();

    let result = done(
        &session,
        "delete_crm_action",
        json!({ "path": "clients.md", "action": FAIT_REF }),
    );

    assert_eq!(result, json!({ "path": "clients.md", "deleted": FAIT_REF }));
    assert_eq!(action(&session, FAIT_REF), Value::Null);
    assert!(
        session
            .read_note("clients/actions/2026-11-01-fait.md")
            .is_err()
    );
    assert!(!session.list_trash().unwrap().notes.is_empty());
    let gone = failed(
        &session,
        "delete_crm_action",
        json!({ "path": "clients.md", "action": FAIT_REF }),
    );
    assert!(gone.starts_with("Cette fiche n'existe plus."), "{gone}");
}

#[test]
fn an_action_is_changed_in_another_workspace_without_changing_the_open_one() {
    let world = world();
    world.allow(&["Notes", "Travail"]);
    for (path, text) in CLIENTS {
        application::NoteStore::write(&*world.notes, &domain::NotePath::parse(path).unwrap(), text)
            .unwrap();
    }

    let result = world.found(
        "move_crm_action",
        json!({ "path": "clients.md", "action": DEVIS_REF, "status": "Done", "workspace": "Notes" }),
    );

    assert_eq!(result["action"]["status"], "Done");
    assert_eq!(world.opened_name(), "Travail");
    assert!(
        world
            .refused(
                "move_crm_action",
                json!({ "path": "clients.md", "action": DEVIS_REF, "status": "Done" })
            )
            .contains("clients.md")
    );
}

#[test]
fn a_note_that_is_not_a_crm_is_refused() {
    let session = opened(&[("plan.md", "# Plan")]);

    let text = failed(
        &session,
        "create_crm_action",
        json!({ "path": "plan.md", "title": "A" }),
    );

    assert_eq!(text, "cette note n'est pas un CRM");
}
