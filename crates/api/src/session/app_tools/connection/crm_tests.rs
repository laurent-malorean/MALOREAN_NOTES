//! Une IA branchée lit et change un CRM par la vraie prise locale, avec les règles de l'application
//! (fiche 0081).

use serde_json::{Value, json};

use super::tests::{Fixture, call, fixture_with};
use crate::session::app_tools::crm_reading_tests::{CLIENTS, DEVIS_REF};

/// Ce que rend l'outil, réussi, lu en JSON.
fn text(reply: &Value) -> Value {
    assert_eq!(reply["result"]["isError"], false, "{reply}");
    serde_json::from_str(reply["result"]["content"][0]["text"].as_str().unwrap()).unwrap()
}

/// Un appel d'outil du CRM « Clients » par une IA branchée avec la clé `secret`.
fn tool(fixture: &Fixture, secret: &str, name: &str, arguments: Value) -> Value {
    let mut all = json!({ "path": "clients.md" });
    for (key, value) in arguments.as_object().unwrap() {
        all[key] = value.clone();
    }
    call(&fixture.session, secret, name, &all)
}

#[test]
fn a_connected_ai_creates_moves_and_comments_an_action() {
    let fixture = fixture_with(&CLIENTS, true);
    let secret = fixture.session.create_connection_key().unwrap();
    let secret = secret.secret();

    let created = tool(
        &fixture,
        secret,
        "create_crm_action",
        json!({ "title": "Relancer Acme", "people": ["jean-dupont"] }),
    );
    let reference = text(&created)["ref"].as_str().unwrap().to_owned();
    let moved = tool(
        &fixture,
        secret,
        "move_crm_action",
        json!({ "action": reference, "status": "Progress", "at_end": true }),
    );
    let commented = tool(
        &fixture,
        secret,
        "change_crm_action",
        json!({ "action": reference, "operation": "add_comment", "text": "Rappelé." }),
    );
    let read = text(&tool(&fixture, secret, "read_crm", json!({})));

    assert_eq!(text(&moved)["action"]["status"], "Progress");
    assert_eq!(
        text(&commented)["action"]["comments"][0]["text"],
        "Rappelé."
    );
    assert_eq!(read["columns"][1]["actions"][1]["ref"], reference);
}

#[test]
fn a_connected_ai_creates_people_companies_and_stages() {
    let fixture = fixture_with(&CLIENTS, true);
    let secret = fixture.session.create_connection_key().unwrap();
    let secret = secret.secret();

    let person = tool(
        &fixture,
        secret,
        "create_crm_person",
        json!({ "name": "Paul Martin", "company": "acme" }),
    );
    let company = tool(
        &fixture,
        secret,
        "create_crm_company",
        json!({ "name": "Initech" }),
    );
    let stages = tool(
        &fixture,
        secret,
        "change_crm_stages",
        json!({ "operation": "add", "name": "Revue" }),
    );
    let read = text(&tool(&fixture, secret, "read_crm", json!({})));

    assert_eq!(text(&person)["ref"], "paul-martin");
    assert_eq!(text(&company)["ref"], "initech");
    assert_eq!(
        text(&stages)["stages"],
        json!(["Progress", "WaitingFor", "Revue"])
    );
    assert_eq!(read["people"].as_array().unwrap().len(), 3);
}

#[test]
fn a_connected_ai_deletes_to_the_trash_and_is_refused_with_the_message_of_the_application() {
    let fixture = fixture_with(&CLIENTS, true);
    let secret = fixture.session.create_connection_key().unwrap();
    let secret = secret.secret();

    let refused = tool(
        &fixture,
        secret,
        "delete_crm_action",
        json!({ "action": "inconnue" }),
    );
    let deleted = tool(
        &fixture,
        secret,
        "delete_crm_action",
        json!({ "action": DEVIS_REF }),
    );

    assert_eq!(refused["result"]["isError"], true);
    assert!(
        refused["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .starts_with("Cette fiche n'existe plus.")
    );
    assert_eq!(text(&deleted)["deleted"], DEVIS_REF);
    assert!(
        fixture
            .session
            .read_note("clients/actions/2026-11-10-demande-de-devis.md")
            .is_err()
    );
    assert_eq!(fixture.session.list_trash().unwrap().notes.len(), 1);
}
