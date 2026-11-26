//! Les outils de geste de la carte mentale, joués par leur protocole sur des faux (fiche 0080) :
//! ce qu'ils écrivent, ce qu'ils rendent, leurs refus dits à l'IA.

use serde_json::{Value, json};

use super::mind_map_tests::MAP;
use super::tests::{found, notes_workspace, opened, paths, refused};
use super::workspaces_tests::world;
use crate::session::Session;

/// Joue l'outil pendant un tour ; rend ce qu'il rend, lu en JSON.
pub(super) fn done(session: &Session, tool: &str, arguments: Value) -> Value {
    let tools = session.open_tools(notes_workspace()).unwrap();
    found(session, tools.key().as_str(), tool, arguments)
}

/// L'outil échoue ; rend pourquoi.
pub(super) fn failed(session: &Session, tool: &str, arguments: Value) -> String {
    let tools = session.open_tools(notes_workspace()).unwrap();
    refused(session, tools.key().as_str(), tool, arguments)
}

pub(super) fn text(session: &Session, path: &str) -> String {
    session.read_note(path).unwrap().content
}

#[test]
fn a_child_is_added_last_under_its_parent_and_the_file_keeps_its_other_properties() {
    let session = opened(&[("p.md", MAP)]);

    let result = done(
        &session,
        "add_mind_map_child",
        json!({ "path": "p.md", "node": "0.0", "title": "  Électriciens  " }),
    );

    assert_eq!(
        result,
        json!({ "path": "p.md", "node": "0.0.1", "title": "Électriciens" })
    );
    assert_eq!(
        text(&session, "p.md"),
        "---
type: carte-mentale
tags: [projet]
racines: [{x: 0, y: 0}, {x: 40.5, y: 320}]
---
# Lancement

- Clients <!-- couleur: bleu -->
  - Artisans
    > Premiers essais.
    >
    > - appeler
    - Plombiers
    - Électriciens
  - [[Grands comptes]]
- Calendrier
"
    );
}

#[test]
fn a_node_added_with_a_detail_writes_it_under_its_bullet() {
    let session = opened(&[("p.md", MAP)]);

    done(
        &session,
        "add_mind_map_child",
        json!({ "path": "p.md", "node": "1", "title": "Bêta", "detail": "Janvier\n\n- invités" }),
    );

    assert!(
        text(&session, "p.md")
            .ends_with("- Calendrier\n  - Bêta\n    > Janvier\n    >\n    > - invités\n")
    );
}

#[test]
fn a_sibling_is_added_right_below_and_the_next_siblings_change_path() {
    let session = opened(&[("p.md", MAP)]);

    let result = done(
        &session,
        "add_mind_map_sibling",
        json!({ "path": "p.md", "node": "0.0", "title": "Architectes" }),
    );

    assert_eq!(result["node"], "0.1");
    let read = done(&session, "read_mind_map", json!({ "path": "p.md" }));
    let children = &read["roots"][0]["children"];
    assert_eq!(children[1]["title"], "Architectes");
    assert_eq!(children[2]["title"], "[[Grands comptes]]");
    assert_eq!(children[2]["node"], "0.2");
}

#[test]
fn a_sibling_of_a_root_node_is_a_root_node_with_its_default_place() {
    let session = opened(&[("p.md", MAP)]);

    let result = done(
        &session,
        "add_mind_map_sibling",
        json!({ "path": "p.md", "node": "0", "title": "Budget" }),
    );

    assert_eq!(result["node"], "1");
    assert!(
        text(&session, "p.md")
            .contains("racines: [{x: 0, y: 0}, {x: 0, y: 160}, {x: 40.5, y: 320}]")
    );
}

#[test]
fn a_root_node_is_added_last_at_the_given_place_or_the_default_one() {
    let session = opened(&[("p.md", MAP)]);

    let placed = done(
        &session,
        "add_mind_map_root",
        json!({ "path": "p.md", "title": "Équipe", "place_x": 12.34, "place_y": -5 }),
    );
    let default = done(
        &session,
        "add_mind_map_root",
        json!({ "path": "p.md", "title": "Risques" }),
    );

    assert_eq!(placed["node"], "2");
    assert_eq!(default["node"], "3");
    let written = text(&session, "p.md");
    assert!(
        written.contains(
            "racines: [{x: 0, y: 0}, {x: 40.5, y: 320}, {x: 12.3, y: -5}, {x: 0, y: 480}]"
        )
    );
    assert!(written.ends_with("- Calendrier\n- Équipe\n- Risques\n"));
}

#[test]
fn the_first_node_of_an_empty_map_is_a_root_node() {
    let session = opened(&[("p.md", "---\ntype: carte-mentale\n---\n# Vide\n")]);

    let result = done(
        &session,
        "add_mind_map_root",
        json!({ "path": "p.md", "title": "Idée", "detail": "Pourquoi" }),
    );

    assert_eq!(result["node"], "0");
    assert_eq!(
        text(&session, "p.md"),
        "---\ntype: carte-mentale\nracines: [{x: 0, y: 0}]\n---\n# Vide\n\n- Idée\n  > Pourquoi\n"
    );
}

#[test]
fn a_place_given_by_one_coordinate_only_or_not_a_number_is_refused() {
    let session = opened(&[("p.md", MAP)]);
    let root = |extra: Value| {
        let mut arguments = json!({ "path": "p.md", "title": "X" });
        arguments
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        failed(&session, "add_mind_map_root", arguments)
    };

    let together = "place_x et place_y vont ensemble : donnez les deux nombres, ou aucun";
    assert_eq!(root(json!({ "place_x": 1 })), together);
    assert_eq!(root(json!({ "place_y": 1 })), together);
    assert_eq!(
        root(json!({ "place_x": "1", "place_y": 2 })),
        "« place_x » doit être un nombre"
    );
    assert_eq!(text(&session, "p.md"), MAP);
}

#[test]
fn a_null_place_counts_as_no_place() {
    let session = opened(&[("p.md", MAP)]);

    let result = done(
        &session,
        "add_mind_map_root",
        json!({ "path": "p.md", "title": "X", "place_x": null, "place_y": null }),
    );

    assert_eq!(result["node"], "2");
}

#[test]
fn a_bad_title_a_bad_node_or_a_missing_argument_is_refused_and_nothing_is_written() {
    let session = opened(&[("p.md", MAP)]);
    let child = |arguments: Value| failed(&session, "add_mind_map_child", arguments);

    assert_eq!(
        child(json!({ "path": "p.md", "node": "0", "title": "" })),
        "le titre d'un nœud ne peut pas être vide ; rien n'a été changé"
    );
    assert!(
        child(json!({ "path": "p.md", "node": "0", "title": "a\nb" }))
            .contains("tient sur une seule ligne")
    );
    assert!(
        child(json!({ "path": "p.md", "node": "7", "title": "x" }))
            .starts_with("le nœud « 7 » n'existe pas dans la carte (5 nœuds)")
    );
    assert!(
        child(json!({ "path": "p.md", "node": "a.b", "title": "x" }))
            .starts_with("chemin de nœud invalide : « a.b »")
    );
    assert_eq!(
        child(json!({ "path": "p.md", "title": "x" })),
        "il manque « node »"
    );
    assert_eq!(
        child(json!({ "path": "p.md", "node": "0" })),
        "il manque « title »"
    );
    assert_eq!(
        child(json!({ "node": "0", "title": "x" })),
        "il manque « path »"
    );
    assert_eq!(text(&session, "p.md"), MAP);
    assert!(session.list_versions("p.md").unwrap().is_empty());
}

#[test]
fn a_note_that_is_not_a_map_or_is_missing_is_refused_untouched() {
    let session = opened(&[("n.md", "# Note\n\n- un\n")]);

    for tool in ["add_mind_map_child", "add_mind_map_sibling"] {
        assert_eq!(
            failed(
                &session,
                tool,
                json!({ "path": "n.md", "node": "0", "title": "x" })
            ),
            "cette note n'est pas une carte mentale"
        );
    }
    assert_eq!(
        failed(
            &session,
            "add_mind_map_root",
            json!({ "path": "n.md", "title": "x" })
        ),
        "cette note n'est pas une carte mentale"
    );
    assert_eq!(
        failed(
            &session,
            "add_mind_map_root",
            json!({ "path": "absente.md", "title": "x" })
        ),
        "la note « absente.md » n'existe pas"
    );
    assert_eq!(text(&session, "n.md"), "# Note\n\n- un\n");
}

#[test]
fn the_text_before_the_gesture_is_kept_as_a_version_with_a_line_outside_the_format() {
    let before = format!("{MAP}\nUn paragraphe écrit à la main.\n");
    let session = opened(&[("p.md", &before)]);

    done(
        &session,
        "add_mind_map_child",
        json!({ "path": "p.md", "node": "1", "title": "Bêta" }),
    );

    assert!(!text(&session, "p.md").contains("paragraphe"));
    let versions = session.list_versions("p.md").unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(
        session.read_version("p.md", &versions[0].id).unwrap(),
        before
    );
}

#[test]
fn the_search_index_finds_the_new_node_with_its_path() {
    let session = opened(&[("p.md", MAP)]);

    done(
        &session,
        "add_mind_map_child",
        json!({ "path": "p.md", "node": "1", "title": "Bêta fermée" }),
    );

    let tools = session.open_tools(notes_workspace()).unwrap();
    let result = found(
        &session,
        tools.key().as_str(),
        "search_notes",
        json!({ "query": "fermée" }),
    );
    assert_eq!(paths(&result), ["p.md"]);
    assert_eq!(result[0]["node"], "1.0");
}

#[test]
fn the_tags_of_a_map_are_added_and_removed_without_touching_its_nodes_or_places() {
    let session = opened(&[("lancement.md", MAP)]);
    let tags = |tool: &str, tags: Value| {
        done(
            &session,
            tool,
            json!({ "path": "lancement.md", "tags": tags }),
        )
    };

    assert_eq!(
        tags("add_tags", json!(["2027"]))["tags"],
        json!(["projet", "2027"])
    );
    assert_eq!(
        text(&session, "lancement.md"),
        MAP.replace("tags: [projet]", "tags: [projet, 2027]")
    );
    assert_eq!(
        tags("remove_tags", json!(["projet", "2027"]))["tags"],
        json!([])
    );
    let after = text(&session, "lancement.md");
    assert!(after.contains("racines: [{x: 0, y: 0}, {x: 40.5, y: 320}]"));
    assert!(after.contains("- Clients <!-- couleur: bleu -->\n  - Artisans\n"));
    let read = done(&session, "read_mind_map", json!({ "path": "lancement.md" }));
    assert_eq!(read["total_nodes"], 5);
}

#[test]
fn a_gesture_plays_in_another_workspace_without_changing_the_open_one() {
    let world = world();
    world.allow(&["Notes", "Travail"]);
    let open = world.opened_name();
    let other = if open == "Notes" { "Travail" } else { "Notes" };
    world.found(
        "create_mind_map",
        json!({ "title": "Plan", "content": "- Un", "workspace": other }),
    );

    let added = world.found(
        "add_mind_map_child",
        json!({ "path": "plan.md", "node": "0", "title": "Deux", "workspace": other }),
    );

    assert_eq!(added["node"], "0.0");
    let read = world.found(
        "read_mind_map",
        json!({ "path": "plan.md", "workspace": other }),
    );
    assert_eq!(read["roots"][0]["children"][0]["title"], "Deux");
    assert_eq!(
        world.refused(
            "add_mind_map_child",
            json!({ "path": "plan.md", "node": "0", "title": "x" })
        ),
        "la note « plan.md » n'existe pas"
    );
    assert_eq!(world.opened_name(), open);
}
