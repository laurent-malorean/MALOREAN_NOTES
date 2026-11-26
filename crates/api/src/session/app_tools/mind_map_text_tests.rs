//! Les outils `edit_mind_map_node` et `color_mind_map_node`, joués par leur protocole sur des
//! faux (fiche 0080) : le texte et la couleur d'un nœud, leurs refus dits à l'IA.

use serde_json::json;

use super::mind_map_editing_tests::{done, failed, text};
use super::mind_map_tests::MAP;
use super::tests::opened;

#[test]
fn the_title_and_the_detail_of_a_node_change_and_its_children_and_color_stay() {
    let session = opened(&[("p.md", MAP)]);

    let result = done(
        &session,
        "edit_mind_map_node",
        json!({ "path": "p.md", "node": "0", "title": " Comptes clients ", "detail": "Priorité\nhaute" }),
    );

    assert_eq!(
        result,
        json!({ "path": "p.md", "node": "0", "title": "Comptes clients" })
    );
    assert_eq!(
        text(&session, "p.md"),
        MAP.replace(
            "- Clients <!-- couleur: bleu -->\n",
            "- Comptes clients <!-- couleur: bleu -->\n  > Priorité\n  > haute\n"
        )
    );
}

#[test]
fn what_is_not_given_stays_and_an_empty_detail_clears_it() {
    let session = opened(&[("p.md", MAP)]);

    done(
        &session,
        "edit_mind_map_node",
        json!({ "path": "p.md", "node": "0.0", "title": "Artisans du bâtiment" }),
    );
    assert!(
        text(&session, "p.md")
            .contains("  - Artisans du bâtiment\n    > Premiers essais.\n    >\n    > - appeler\n")
    );
    done(
        &session,
        "edit_mind_map_node",
        json!({ "path": "p.md", "node": "0.0", "detail": "Autre" }),
    );
    assert!(
        text(&session, "p.md").contains("  - Artisans du bâtiment\n    > Autre\n    - Plombiers")
    );
    let result = done(
        &session,
        "edit_mind_map_node",
        json!({ "path": "p.md", "node": "0.0", "detail": "" }),
    );
    assert_eq!(result["title"], "Artisans du bâtiment");
    assert!(text(&session, "p.md").contains("  - Artisans du bâtiment\n    - Plombiers"));
}

#[test]
fn a_text_change_with_nothing_given_an_empty_title_or_several_lines_is_refused() {
    let session = opened(&[("p.md", MAP)]);
    let edit = |extra: serde_json::Value| {
        let mut arguments = json!({ "path": "p.md", "node": "0" });
        arguments
            .as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        failed(&session, "edit_mind_map_node", arguments)
    };

    assert!(edit(json!({})).starts_with("rien à changer : donnez le nouveau titre (title)"));
    assert_eq!(
        edit(json!({ "title": "  " })),
        "le titre d'un nœud ne peut pas être vide ; rien n'a été changé"
    );
    assert!(edit(json!({ "title": "a\nb" })).contains("tient sur une seule ligne"));
    assert!(edit(json!({ "title": 3 })).starts_with("rien à changer"));
    assert_eq!(text(&session, "p.md"), MAP);
    assert!(session.list_versions("p.md").unwrap().is_empty());
}

#[test]
fn a_missing_node_or_a_bad_path_or_a_note_that_is_not_a_map_is_refused() {
    let session = opened(&[("p.md", MAP), ("n.md", "# Note\n")]);

    assert!(
        failed(
            &session,
            "edit_mind_map_node",
            json!({ "path": "p.md", "node": "0.9", "title": "x" })
        )
        .starts_with("le nœud « 0.9 » n'existe pas dans la carte (5 nœuds)")
    );
    assert_eq!(
        failed(
            &session,
            "edit_mind_map_node",
            json!({ "path": "p.md", "title": "x" })
        ),
        "il manque « node »"
    );
    assert_eq!(
        failed(
            &session,
            "edit_mind_map_node",
            json!({ "path": "n.md", "node": "0", "title": "x" })
        ),
        "cette note n'est pas une carte mentale"
    );
    assert_eq!(text(&session, "p.md"), MAP);
}

#[test]
fn a_node_is_colored_with_a_color_of_the_palette_and_the_tool_gives_it_back() {
    let session = opened(&[("p.md", MAP)]);

    let result = done(
        &session,
        "color_mind_map_node",
        json!({ "path": "p.md", "node": "1", "color": " Turquoise " }),
    );

    assert_eq!(
        result,
        json!({ "path": "p.md", "node": "1", "title": "Calendrier", "color": "turquoise" })
    );
    assert!(text(&session, "p.md").ends_with("- Calendrier <!-- couleur: turquoise -->\n"));
}

#[test]
fn the_color_none_removes_the_color_of_a_node() {
    let session = opened(&[("p.md", MAP)]);

    let result = done(
        &session,
        "color_mind_map_node",
        json!({ "path": "p.md", "node": "0", "color": "aucune" }),
    );

    assert_eq!(result["color"], "aucune");
    assert!(text(&session, "p.md").contains("- Clients\n  - Artisans"));
}

#[test]
fn a_free_color_an_unknown_name_or_a_missing_color_is_refused_with_the_palette() {
    let session = opened(&[("p.md", MAP)]);
    let color = |arguments: serde_json::Value| failed(&session, "color_mind_map_node", arguments);

    for name in ["#dc2626", "pourpre", "red", ""] {
        let error = color(json!({ "path": "p.md", "node": "0", "color": name }));
        assert!(
            error.starts_with(&format!(
                "couleur inconnue : « {name} » ; les couleurs de la palette sont rouge, orange"
            )),
            "{error}"
        );
    }
    assert_eq!(
        color(json!({ "path": "p.md", "node": "0" })),
        "il manque « color »"
    );
    assert!(
        color(json!({ "path": "p.md", "node": "8", "color": "rouge" })).contains("n'existe pas")
    );
    assert_eq!(text(&session, "p.md"), MAP);
    assert!(session.list_versions("p.md").unwrap().is_empty());
}

#[test]
fn a_change_keeps_a_version_and_the_index_follows_the_new_title() {
    let session = opened(&[("p.md", MAP)]);

    done(
        &session,
        "edit_mind_map_node",
        json!({ "path": "p.md", "node": "1", "title": "Échéances" }),
    );

    let versions = session.list_versions("p.md").unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(session.read_version("p.md", &versions[0].id).unwrap(), MAP);
    let found = done(&session, "search_notes", json!({ "query": "échéances" }));
    assert_eq!(found[0]["node"], "1");
    let gone = done(&session, "search_notes", json!({ "query": "calendrier" }));
    assert_eq!(gone, json!([]));
}
