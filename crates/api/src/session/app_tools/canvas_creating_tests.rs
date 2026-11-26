//! La création d'un canvas par l'outil `create_canvas`, jouée par son protocole sur des faux
//! (fiche 0087) : les règles de l'interface, puis les outils du canvas sur le canvas neuf.

use domain::canvas::Canvas;
use serde_json::json;

use super::canvas_changing_tests::{done, failed};
use super::tests::opened;

fn empty_canvas() -> String {
    Canvas::default().to_text()
}

#[test]
fn a_canvas_is_created_empty_with_the_name_taken_from_its_title_in_a_folder_made_on_the_way() {
    let session = opened(&[("Ventes/plan.canvas", "{}")]);

    let created = done(
        &session,
        "create_canvas",
        json!({ "title": "  Plan ", "folder": "Ventes" }),
    );
    let at_root = done(&session, "create_canvas", json!({ "title": "Mon schéma" }));
    let in_new_folder = done(
        &session,
        "create_canvas",
        json!({ "title": "Idées", "folder": "Ventes/2027" }),
    );

    assert_eq!(created, json!({ "path": "Ventes/plan-2.canvas" }));
    assert_eq!(at_root, json!({ "path": "mon-schema.canvas" }));
    assert_eq!(in_new_folder, json!({ "path": "Ventes/2027/idees.canvas" }));
    for path in [
        "Ventes/plan-2.canvas",
        "mon-schema.canvas",
        "Ventes/2027/idees.canvas",
    ] {
        assert_eq!(session.read_note(path).unwrap().content, empty_canvas());
    }
    assert_eq!(
        session.read_note("Ventes/plan.canvas").unwrap().content,
        "{}"
    );
    assert!(
        session
            .list_folders()
            .unwrap()
            .contains(&"Ventes/2027".to_owned())
    );
}

#[test]
fn a_canvas_without_a_title_or_with_a_bad_folder_is_refused_and_nothing_is_written() {
    let session = opened(&[]);

    assert_eq!(
        failed(&session, "create_canvas", json!({})),
        "il manque « title »"
    );
    assert_eq!(
        failed(
            &session,
            "create_canvas",
            json!({ "title": "  ", "folder": "Ventes" })
        ),
        "il manque « title »"
    );
    assert_eq!(
        failed(
            &session,
            "create_canvas",
            json!({ "title": "X", "folder": "../x" })
        ),
        "nom de dossier invalide : « ../x »"
    );
    assert!(session.list_folders().unwrap().is_empty());
}

#[test]
fn the_canvas_tools_fill_a_canvas_just_created_and_read_canvas_gives_it_back() {
    let session = opened(&[]);
    let path = done(&session, "create_canvas", json!({ "title": "Neuf" }))["path"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(path, "neuf.canvas");
    let empty = done(&session, "read_canvas", json!({ "path": path }));
    assert_eq!(empty["card_count"], 0);
    assert_eq!(empty["arrow_count"], 0);

    let first = done(
        &session,
        "add_canvas_card",
        json!({ "path": path, "type": "text", "text": "Un", "x": 0, "y": 0 }),
    );
    let second = done(
        &session,
        "add_canvas_card",
        json!({ "path": path, "type": "text", "text": "Deux", "x": 400, "y": 0 }),
    );
    let first_id = first["card"]["id"].as_str().unwrap().to_owned();
    let second_id = second["card"]["id"].as_str().unwrap().to_owned();
    done(
        &session,
        "add_canvas_arrow",
        json!({ "path": path, "from": first_id, "to": second_id, "label": "puis" }),
    );
    done(
        &session,
        "add_canvas_group",
        json!({ "path": path, "label": "Etapes", "cards": [first_id, second_id] }),
    );

    let read = done(&session, "read_canvas", json!({ "path": path }));
    assert_eq!(read["card_count"], 3);
    assert_eq!(read["arrow_count"], 1);
    assert_eq!(read["arrows"][0]["label"], "puis");
    let cards = read["cards"].as_array().unwrap();
    assert!(cards.iter().any(|card| card["text"] == "Un"));
    assert!(cards.iter().any(|card| card["text"] == "Deux"));
    assert!(
        cards
            .iter()
            .any(|card| card["type"] == "group" && card["label"] == "Etapes")
    );
}

#[test]
fn a_canvas_is_created_in_another_workspace_without_touching_the_open_one() {
    let world = super::workspaces_tests::world();
    world.allow(&["Notes", "Travail"]);

    let created = world.found(
        "create_canvas",
        json!({ "title": "Ailleurs", "folder": "Plans", "workspace": "Notes" }),
    );

    assert_eq!(created, json!({ "path": "Plans/ailleurs.canvas" }));
    let written = application::NoteStore::read(
        &*world.notes,
        &domain::NotePath::parse("Plans/ailleurs.canvas").unwrap(),
    )
    .unwrap()
    .content;
    assert_eq!(written, empty_canvas());
    assert!(
        application::NoteStore::read(
            &*world.travail,
            &domain::NotePath::parse("Plans/ailleurs.canvas").unwrap()
        )
        .is_err()
    );
    assert_eq!(world.opened_name(), "Travail");
}
