//! Les outils qui changent les actions d'un CRM, joués par leur protocole sur des faux
//! (fiche 0081) : chaque geste, ses refus dits à l'IA, la version gardée, l'index.

use serde_json::{Value, json};

use super::crm_reading_tests::{DEVIS, DEVIS_PATH, DEVIS_REF, clients};
use super::tests::{found, notes_workspace, paths, refused};
use crate::NoteOrderItem;
use crate::session::Session;

pub(super) fn done(session: &Session, tool: &str, arguments: Value) -> Value {
    let tools = session.open_tools(notes_workspace()).unwrap();
    found(session, tools.key().as_str(), tool, arguments)
}

pub(super) fn failed(session: &Session, tool: &str, arguments: Value) -> String {
    let tools = session.open_tools(notes_workspace()).unwrap();
    refused(session, tools.key().as_str(), tool, arguments)
}

pub(super) fn fiche(session: &Session, path: &str) -> String {
    session.read_note(path).unwrap().content
}

/// L'action `reference` telle que `read_crm` la donne.
pub(super) fn action(session: &Session, reference: &str) -> Value {
    let read = done(session, "read_crm", json!({ "path": "clients.md" }));
    read["columns"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|column| column["actions"].as_array().unwrap())
        .find(|action| action["ref"] == reference)
        .cloned()
        .unwrap_or(Value::Null)
}

/// Le changement `arguments` de l'action du devis.
fn change(session: &Session, arguments: Value) -> Value {
    let mut all = json!({ "path": "clients.md", "action": DEVIS_REF });
    for (name, value) in arguments.as_object().unwrap() {
        all[name] = value.clone();
    }
    done(session, "change_crm_action", all)
}

fn refusal(session: &Session, arguments: Value) -> String {
    let mut all = json!({ "path": "clients.md", "action": DEVIS_REF });
    for (name, value) in arguments.as_object().unwrap() {
        all[name] = value.clone();
    }
    failed(session, "change_crm_action", all)
}

fn created(session: &Session, arguments: Value) -> Value {
    let mut all = json!({ "path": "clients.md" });
    for (name, value) in arguments.as_object().unwrap() {
        all[name] = value.clone();
    }
    done(session, "create_crm_action", all)
}

#[test]
fn an_action_is_created_with_its_title_alone_today_in_the_todo_column() {
    let session = clients();

    let result = created(&session, json!({ "title": "Relancer Acme" }));

    assert_eq!(result["path"], "clients.md");
    assert_eq!(result["ref"], "2026-11-16-relancer-acme");
    assert_eq!(
        result["fiche"],
        "clients/actions/2026-11-16-relancer-acme.md"
    );
    let action = action(&session, "2026-11-16-relancer-acme");
    assert_eq!(action["title"], "Relancer Acme");
    assert_eq!(action["status"], "TODO");
    assert_eq!(action["date"], "2026-11-16");
    assert_eq!(action["due_today"], true);
}

#[test]
fn an_action_is_created_with_everything_the_window_of_an_action_takes() {
    let session = clients();

    let result = created(
        &session,
        json!({ "title": "Envoyer le devis", "status": "progress", "date": "2026-11-20",
                "people": ["jean-dupont", "marie-durand"], "channel": "e-mail",
                "project": "refonte", "color": "rouge", "tags": ["devis", "urgent"],
                "linked_notes": ["Plan"], "description": "Pour trois postes." }),
    );

    let action = action(&session, result["ref"].as_str().unwrap());
    assert_eq!(action["status"], "Progress");
    assert_eq!(action["date"], "2026-11-20");
    assert_eq!(
        action["people"],
        json!([{ "ref": "jean-dupont", "company": "acme" }, { "ref": "marie-durand" }])
    );
    assert_eq!(action["channel"], "e-mail");
    assert_eq!(action["project"], "refonte");
    assert_eq!(action["color"], "rouge");
    assert_eq!(action["tags"], json!(["devis", "urgent"]));
    assert_eq!(action["linked_notes"], json!(["Plan"]));
    assert_eq!(action["description"], "Pour trois postes.");
}

#[test]
fn a_created_action_is_found_by_the_search_of_the_index() {
    let session = clients();

    created(&session, json!({ "title": "Relancer Acme" }));

    let tools = session.open_tools(notes_workspace()).unwrap();
    let found = found(
        &session,
        tools.key().as_str(),
        "search_notes",
        json!({ "query": "relancer", "content_type": "crm-action" }),
    );
    assert_eq!(
        paths(&found),
        ["clients/actions/2026-11-16-relancer-acme.md"]
    );
    assert_eq!(found[0]["crm"], "clients.md");
}

fn names_of_actions(session: &Session) -> usize {
    session
        .list_notes("clients/actions", NoteOrderItem::Modified)
        .map_or(0, |notes| notes.len())
}

#[test]
fn a_refused_creation_says_why_in_french_and_writes_nothing() {
    let session = clients();
    let before = names_of_actions(&session);
    for (arguments, said) in [
        (json!({ "title": "" }), "vide"),
        (json!({ "title": "a\nb" }), "une seule ligne"),
        (
            json!({ "title": "A", "status": "Presque" }),
            "« Presque » n'est pas une colonne de ce CRM",
        ),
        (
            json!({ "title": "A", "people": ["inconnue"] }),
            "Cette fiche n'existe plus.",
        ),
        (
            json!({ "title": "A", "project": "inconnu" }),
            "Cette fiche n'existe plus.",
        ),
        (
            json!({ "title": "A", "color": "#FF0000" }),
            "« #FF0000 » n'est pas une couleur de la palette",
        ),
        (
            json!({ "title": "A", "channel": "pigeon" }),
            "« pigeon » n'est pas un canal",
        ),
    ] {
        let text = failed(
            &session,
            "create_crm_action",
            json!({ "path": "clients.md", "title": arguments["title"], "status": arguments["status"],
                    "people": arguments["people"], "project": arguments["project"],
                    "color": arguments["color"], "channel": arguments["channel"] }),
        );
        assert!(text.contains(said), "{text}");
    }
    assert_eq!(names_of_actions(&session), before);
}

#[test]
fn a_date_that_is_not_a_day_is_refused() {
    let session = clients();

    let text = failed(
        &session,
        "create_crm_action",
        json!({ "path": "clients.md", "title": "A", "date": "demain" }),
    );

    assert!(text.contains("demain"), "{text}");
}

#[test]
fn the_fields_of_an_action_are_changed_one_gesture_at_a_time() {
    let session = clients();

    for (arguments, field, expected) in [
        (
            json!({ "operation": "title", "title": "Devis revu" }),
            "title",
            json!("Devis revu"),
        ),
        (
            json!({ "operation": "date", "date": "2026-12-01" }),
            "date",
            json!("2026-12-01"),
        ),
        (
            json!({ "operation": "channel", "channel": "appel" }),
            "channel",
            json!("appel"),
        ),
        (
            json!({ "operation": "color", "color": "vert" }),
            "color",
            json!("vert"),
        ),
        (
            json!({ "operation": "linked_notes", "linked_notes": ["Plan", "Autre"] }),
            "linked_notes",
            json!(["Plan", "Autre"]),
        ),
    ] {
        let result = change(&session, arguments);
        assert_eq!(result["path"], "clients.md");
        assert_eq!(result["action"][field], expected);
    }
}

#[test]
fn people_and_the_project_of_an_action_are_given_and_taken_back() {
    let session = clients();

    change(
        &session,
        json!({ "operation": "remove_person", "person": "jean-dupont" }),
    );
    let removed = action(&session, DEVIS_REF);
    assert_eq!(removed["people"], json!([{ "ref": "marie-durand" }]));
    let added = change(
        &session,
        json!({ "operation": "add_person", "person": "jean-dupont" }),
    );
    assert_eq!(
        added["action"]["people"][1],
        json!({ "ref": "jean-dupont", "company": "acme" })
    );
    let none = change(&session, json!({ "operation": "project", "project": "" }));
    assert!(none["action"].get("project").is_none());
    let again = change(
        &session,
        json!({ "operation": "project", "project": "refonte" }),
    );
    assert_eq!(again["action"]["project"], "refonte");
}

#[test]
fn an_empty_value_removes_the_channel_and_the_color_and_a_missing_one_is_an_error() {
    let session = clients();

    let result = change(&session, json!({ "operation": "channel", "channel": "" }));
    assert!(result["action"].get("channel").is_none());
    change(&session, json!({ "operation": "color", "color": "" }));
    assert!(action(&session, DEVIS_REF).get("color").is_none());
    assert_eq!(
        refusal(&session, json!({ "operation": "channel" })),
        "il manque « channel »"
    );
}

#[test]
fn a_change_touches_only_its_property_and_keeps_the_rank_of_the_card() {
    let session = clients();

    change(
        &session,
        json!({ "operation": "title", "title": "Devis revu" }),
    );

    let after = fiche(&session, DEVIS_PATH);
    assert!(after.contains("# Devis revu"));
    assert!(after.contains("rang: 1"));
    assert_eq!(after.replace("# Devis revu", "# Demande de devis"), DEVIS);
}

#[test]
fn the_text_of_an_action_is_changed_by_its_description_lists_items_and_comments() {
    let session = clients();

    change(
        &session,
        json!({ "operation": "description", "text": "Pour 4 postes." }),
    );
    change(
        &session,
        json!({ "operation": "add_checklist", "name": "Envoi" }),
    );
    change(
        &session,
        json!({ "operation": "add_item", "list": 1, "text": "Poster" }),
    );
    change(
        &session,
        json!({ "operation": "check_item", "list": 1, "item": 0, "done": true }),
    );
    change(
        &session,
        json!({ "operation": "edit_item", "list": 0, "item": 1, "text": "Chiffrer à nouveau" }),
    );
    change(
        &session,
        json!({ "operation": "rename_checklist", "list": 1, "name": "Courrier" }),
    );

    let action = action(&session, DEVIS_REF);
    assert_eq!(action["description"], "Pour 4 postes.");
    assert_eq!(
        action["checklists"][0]["items"][1]["text"],
        "Chiffrer à nouveau"
    );
    assert_eq!(
        action["checklists"][1],
        json!({ "index": 1, "name": "Courrier", "items": [{ "index": 0, "done": true, "text": "Poster" }] })
    );
}

#[test]
fn items_and_lists_are_removed_by_their_index() {
    let session = clients();

    change(
        &session,
        json!({ "operation": "remove_item", "list": 0, "item": 0 }),
    );
    assert_eq!(
        action(&session, DEVIS_REF)["checklists"][0]["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    change(
        &session,
        json!({ "operation": "remove_checklist", "list": 0 }),
    );
    assert!(action(&session, DEVIS_REF).get("checklists").is_none());
}

#[test]
fn a_comment_is_added_dated_now_then_edited_and_removed() {
    let session = clients();

    let added = change(
        &session,
        json!({ "operation": "add_comment", "text": "Relancé par téléphone." }),
    );
    assert_eq!(
        added["action"]["comments"][1],
        json!({ "index": 1, "at": "2026-11-16 18:30", "text": "Relancé par téléphone." })
    );
    change(
        &session,
        json!({ "operation": "edit_comment", "comment": 1, "text": "Relancé par e-mail." }),
    );
    assert_eq!(
        action(&session, DEVIS_REF)["comments"][1]["text"],
        "Relancé par e-mail."
    );
    change(
        &session,
        json!({ "operation": "remove_comment", "comment": 0 }),
    );
    let comments = action(&session, DEVIS_REF)["comments"].clone();
    assert_eq!(comments.as_array().unwrap().len(), 1);
    assert_eq!(comments[0]["text"], "Relancé par e-mail.");
}

#[test]
fn a_refused_change_says_why_and_changes_nothing() {
    let session = clients();

    let unknown = refusal(&session, json!({ "operation": "rename" }));
    assert!(
        unknown.starts_with("« rename » n'est pas une opération de change_crm_action : `title`"),
        "{unknown}"
    );
    assert!(refusal(&session, json!({ "operation": "title", "title": "" })).contains("vide"));
    assert_eq!(refusal(&session, json!({})), "il manque « operation »");
    assert!(refusal(&session, json!({ "operation": "date", "date": "demain" })).contains("demain"));
    assert!(
        refusal(
            &session,
            json!({ "operation": "color", "color": "pourpre" })
        )
        .contains("pourpre")
    );
    assert_eq!(
        refusal(&session, json!({ "operation": "remove_item", "list": 0 })),
        "il manque « item »"
    );
    assert_eq!(
        refusal(
            &session,
            json!({ "operation": "remove_item", "list": 0, "item": -1 })
        ),
        "« item » doit être un entier à partir de 0"
    );
    assert_eq!(
        refusal(
            &session,
            json!({ "operation": "check_item", "list": 0, "item": 0 })
        ),
        "il manque « done » (true pour cocher, false pour décocher)"
    );
    assert_eq!(fiche(&session, DEVIS_PATH), DEVIS);
}

#[test]
fn a_list_an_item_or_a_comment_that_does_not_exist_is_refused() {
    let session = clients();

    for arguments in [
        json!({ "operation": "remove_checklist", "list": 5 }),
        json!({ "operation": "edit_item", "list": 0, "item": 9, "text": "x" }),
        json!({ "operation": "remove_comment", "comment": 3 }),
    ] {
        let text = refusal(&session, arguments);
        assert!(!text.is_empty());
    }
    assert_eq!(fiche(&session, DEVIS_PATH), DEVIS);
}

#[test]
fn an_action_or_a_person_that_does_not_exist_is_refused_with_a_hint_to_read_the_crm() {
    let session = clients();

    let gone = failed(
        &session,
        "change_crm_action",
        json!({ "path": "clients.md", "action": "inconnue", "operation": "title", "title": "A" }),
    );
    assert!(
        gone.starts_with("Cette fiche n'existe plus. Vérifiez la référence avec read_crm"),
        "{gone}"
    );
    let person = refusal(
        &session,
        json!({ "operation": "add_person", "person": "inconnue" }),
    );
    assert!(person.starts_with("Cette fiche n'existe plus."), "{person}");
    let project = refusal(
        &session,
        json!({ "operation": "project", "project": "inconnu" }),
    );
    assert!(
        project.starts_with("Cette fiche n'existe plus."),
        "{project}"
    );
}

#[test]
fn a_change_keeps_the_text_before_as_a_version_of_the_fiche() {
    let session = clients();

    change(
        &session,
        json!({ "operation": "title", "title": "Devis revu" }),
    );

    let versions = session.list_versions(DEVIS_PATH).unwrap();
    assert_eq!(versions.len(), 1);
    let before = session.read_version(DEVIS_PATH, &versions[0].id).unwrap();
    assert_eq!(before, DEVIS);
}
