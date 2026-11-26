//! Les outils `move_mind_map_node` et `delete_mind_map_node`, joués par leur protocole sur des
//! faux (fiche 0080) : déplacer ou supprimer une branche, leurs refus dits à l'IA.

use serde_json::{Value, json};

use super::mind_map_editing_tests::{done, failed, text};
use super::mind_map_tests::MAP;
use super::tests::opened;
use crate::session::Session;

fn moved(session: &Session, arguments: Value) -> Value {
    let mut all = json!({ "path": "p.md" });
    all.as_object_mut()
        .unwrap()
        .extend(arguments.as_object().unwrap().clone());
    done(session, "move_mind_map_node", all)
}

fn not_moved(session: &Session, arguments: Value) -> String {
    let mut all = json!({ "path": "p.md" });
    all.as_object_mut()
        .unwrap()
        .extend(arguments.as_object().unwrap().clone());
    failed(session, "move_mind_map_node", all)
}

#[test]
fn a_branch_dropped_as_a_child_becomes_the_last_child_and_a_root_node_loses_its_place() {
    let session = opened(&[("p.md", MAP)]);

    let result = moved(
        &session,
        json!({ "node": "1", "position": "child", "target": "0" }),
    );

    assert_eq!(
        result,
        json!({ "path": "p.md", "node": "0.2", "title": "Calendrier" })
    );
    assert_eq!(
        text(&session, "p.md"),
        "---
type: carte-mentale
tags: [projet]
racines: [{x: 0, y: 0}]
---
# Lancement

- Clients <!-- couleur: bleu -->
  - Artisans
    > Premiers essais.
    >
    > - appeler
    - Plombiers
  - [[Grands comptes]]
  - Calendrier
"
    );
}

#[test]
fn a_branch_dropped_before_or_after_a_node_becomes_its_sibling() {
    let session = opened(&[("p.md", MAP)]);

    let before = moved(
        &session,
        json!({ "node": "0.1", "position": "before", "target": "0.0" }),
    );
    let after = moved(
        &session,
        json!({ "node": "0.0", "position": "after", "target": "0.1" }),
    );

    assert_eq!(before["node"], "0.0");
    assert_eq!(after["node"], "0.1");
    assert_eq!(after["title"], "[[Grands comptes]]");
    let read = done(&session, "read_mind_map", json!({ "path": "p.md" }));
    let titles: Vec<_> = read["roots"][0]["children"]
        .as_array()
        .unwrap()
        .iter()
        .map(|child| child["title"].as_str().unwrap())
        .collect();
    assert_eq!(titles, ["Artisans", "[[Grands comptes]]"]);
}

#[test]
fn a_root_node_dropped_beside_another_root_node_keeps_its_place() {
    let session = opened(&[("p.md", MAP)]);

    let result = moved(
        &session,
        json!({ "node": "0", "position": "after", "target": "1" }),
    );

    assert_eq!(result["node"], "1");
    assert!(text(&session, "p.md").contains("racines: [{x: 40.5, y: 320}, {x: 0, y: 0}]"));
}

#[test]
fn a_child_dropped_on_the_background_becomes_a_root_node_with_its_detail_color_and_children() {
    let session = opened(&[("p.md", MAP)]);

    let result = moved(
        &session,
        json!({ "node": "0.0", "position": "root", "place_x": 100, "place_y": 50.25 }),
    );

    assert_eq!(result["node"], "2");
    let written = text(&session, "p.md");
    assert!(written.contains("racines: [{x: 0, y: 0}, {x: 40.5, y: 320}, {x: 100, y: 50.3}]"));
    assert!(written.ends_with(
        "- Calendrier\n- Artisans\n  > Premiers essais.\n  >\n  > - appeler\n  - Plombiers\n"
    ));
}

#[test]
fn a_child_dropped_on_the_background_without_a_place_takes_the_default_place() {
    let session = opened(&[("p.md", MAP)]);

    moved(&session, json!({ "node": "0.1", "position": "root" }));

    assert!(
        text(&session, "p.md")
            .contains("racines: [{x: 0, y: 0}, {x: 40.5, y: 320}, {x: 0, y: 320}]")
    );
}

#[test]
fn a_root_node_dropped_on_the_background_is_only_moved_on_the_map() {
    let session = opened(&[("p.md", MAP)]);

    let result = moved(
        &session,
        json!({ "node": "1", "position": "root", "place_x": 5, "place_y": 6 }),
    );

    assert_eq!(result["node"], "1");
    assert_eq!(
        text(&session, "p.md"),
        MAP.replace("{x: 40.5, y: 320}", "{x: 5, y: 6}")
    );
}

#[test]
fn a_root_node_dropped_on_the_background_without_a_place_is_refused() {
    let session = opened(&[("p.md", MAP)]);

    assert_eq!(
        not_moved(&session, json!({ "node": "1", "position": "root" })),
        "un nœud racine déplacé sur le fond a besoin de sa nouvelle place : donnez place_x et \
         place_y ; rien n'a été changé"
    );
    assert_eq!(text(&session, "p.md"), MAP);
}

#[test]
fn a_drop_on_itself_or_in_its_own_branch_is_refused_and_nothing_is_written() {
    let session = opened(&[("p.md", MAP)]);

    for (position, target) in [
        ("child", "0"),
        ("before", "0"),
        ("child", "0.0"),
        ("after", "0.0.0"),
    ] {
        assert_eq!(
            not_moved(
                &session,
                json!({ "node": "0", "position": position, "target": target })
            ),
            "un nœud ne se déplace ni sur lui-même ni dans sa propre branche ; rien n'a été changé"
        );
    }
    assert_eq!(text(&session, "p.md"), MAP);
    assert!(session.list_versions("p.md").unwrap().is_empty());
}

#[test]
fn a_bad_position_a_missing_target_or_a_misplaced_place_is_refused() {
    let session = opened(&[("p.md", MAP)]);

    assert_eq!(
        not_moved(
            &session,
            json!({ "node": "0.0", "position": "dessous", "target": "1" })
        ),
        "position inconnue : « dessous » ; `child` (dernier enfant de target), `before` ou \
         `after` (frère de target, juste au-dessus ou en dessous) ou `root` (nœud racine)"
    );
    assert_eq!(
        not_moved(&session, json!({ "node": "0.0", "position": "child" })),
        "il manque « target »"
    );
    assert_eq!(
        not_moved(&session, json!({ "node": "0.0" })),
        "il manque « position »"
    );
    assert_eq!(
        not_moved(&session, json!({ "position": "root" })),
        "il manque « node »"
    );
    assert_eq!(
        not_moved(
            &session,
            json!({ "node": "0.0", "position": "child", "target": "1", "place_x": 1, "place_y": 2 })
        ),
        "place_x et place_y ne servent qu'avec position root : sur un autre nœud, la place vient \
         de la cible"
    );
    assert!(
        not_moved(
            &session,
            json!({ "node": "0.0", "position": "root", "place_x": 1 })
        )
        .starts_with("place_x et place_y vont ensemble")
    );
    assert_eq!(text(&session, "p.md"), MAP);
}

#[test]
fn a_missing_node_or_target_is_refused() {
    let session = opened(&[("p.md", MAP), ("n.md", "# Note\n")]);

    assert!(
        not_moved(
            &session,
            json!({ "node": "4", "position": "child", "target": "0" })
        )
        .starts_with("le nœud « 4 » n'existe pas dans la carte (5 nœuds)")
    );
    assert!(
        not_moved(
            &session,
            json!({ "node": "0", "position": "after", "target": "3.1" })
        )
        .starts_with("le nœud « 3.1 » n'existe pas")
    );
    assert_eq!(
        failed(
            &session,
            "move_mind_map_node",
            json!({ "path": "n.md", "node": "0", "position": "root" })
        ),
        "cette note n'est pas une carte mentale"
    );
    assert_eq!(text(&session, "p.md"), MAP);
}

#[test]
fn a_branch_is_deleted_with_its_descendants_and_the_tool_counts_them() {
    let session = opened(&[("p.md", MAP)]);

    let result = done(
        &session,
        "delete_mind_map_node",
        json!({ "path": "p.md", "node": "0.0" }),
    );

    assert_eq!(
        result,
        json!({ "path": "p.md", "node": "0.0", "title": "Artisans", "deleted": 2 })
    );
    assert_eq!(
        text(&session, "p.md"),
        MAP.replace(
            "  - Artisans\n    > Premiers essais.\n    >\n    > - appeler\n    - Plombiers\n",
            ""
        )
    );
}

#[test]
fn a_root_node_is_deleted_with_its_place_and_the_version_before_lets_the_user_restore_it() {
    let session = opened(&[("p.md", MAP)]);

    let result = done(
        &session,
        "delete_mind_map_node",
        json!({ "path": "p.md", "node": "0" }),
    );

    assert_eq!(result["deleted"], 4);
    assert_eq!(
        text(&session, "p.md"),
        "---\ntype: carte-mentale\ntags: [projet]\nracines: [{x: 40.5, y: 320}]\n---\n# Lancement\n\n- Calendrier\n"
    );
    let versions = session.list_versions("p.md").unwrap();
    assert_eq!(versions.len(), 1);
    session.restore_version("p.md", &versions[0].id).unwrap();
    assert_eq!(text(&session, "p.md"), MAP);
}

#[test]
fn deleting_the_last_node_leaves_a_map_without_places() {
    let session = opened(&[("p.md", "---\ntype: carte-mentale\n---\n# T\n\n- Seul\n")]);

    done(
        &session,
        "delete_mind_map_node",
        json!({ "path": "p.md", "node": "0" }),
    );

    assert_eq!(
        text(&session, "p.md"),
        "---\ntype: carte-mentale\n---\n# T\n"
    );
}

#[test]
fn deleting_a_missing_node_or_in_a_note_that_is_not_a_map_is_refused() {
    let session = opened(&[("p.md", MAP), ("n.md", "# Note\n")]);
    let delete = |path: &str, node: Value| {
        failed(
            &session,
            "delete_mind_map_node",
            json!({ "path": path, "node": node }),
        )
    };

    assert!(delete("p.md", json!("2")).starts_with("le nœud « 2 » n'existe pas"));
    assert!(delete("p.md", json!("x")).starts_with("chemin de nœud invalide"));
    assert_eq!(
        delete("n.md", json!("0")),
        "cette note n'est pas une carte mentale"
    );
    assert_eq!(
        failed(&session, "delete_mind_map_node", json!({ "path": "p.md" })),
        "il manque « node »"
    );
    assert_eq!(text(&session, "p.md"), MAP);
    assert!(session.list_versions("p.md").unwrap().is_empty());
}
