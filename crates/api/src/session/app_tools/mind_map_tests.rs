//! L'outil `read_mind_map`, joué par son protocole sur des faux (fiche 0080) : la carte en arbre,
//! ses refus dits à l'IA, la limite de taille toujours dite.

use serde_json::{Value, json};

use super::tests::{found, notes_workspace, opened, refused};
use super::workspaces_tests::world;
use crate::session::Session;

pub(super) const MAP: &str = "---
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
  - [[Grands comptes]]
- Calendrier
";

/// Lit la carte pendant un tour ; rend ce que l'outil rend, lu en JSON.
fn read(session: &Session, path: &str) -> Value {
    let tools = session.open_tools(notes_workspace()).unwrap();
    found(
        session,
        tools.key().as_str(),
        "read_mind_map",
        json!({ "path": path }),
    )
}

/// La lecture échoue ; rend pourquoi.
fn unread(session: &Session, arguments: Value) -> String {
    let tools = session.open_tools(notes_workspace()).unwrap();
    refused(session, tools.key().as_str(), "read_mind_map", arguments)
}

#[test]
fn a_map_is_given_as_a_tree_with_the_path_of_each_node() {
    let session = opened(&[("p.md", MAP)]);

    let result = read(&session, "p.md");

    assert_eq!(
        result,
        json!({
            "path": "p.md",
            "title": "Lancement",
            "nodes": 5,
            "total_nodes": 5,
            "truncated": false,
            "roots": [
                {
                    "node": "0", "title": "Clients", "color": "bleu",
                    "place": { "x": 0.0, "y": 0.0 },
                    "children": [
                        {
                            "node": "0.0", "title": "Artisans",
                            "detail": "Premiers essais.\n\n- appeler",
                            "children": [{ "node": "0.0.0", "title": "Plombiers" }]
                        },
                        { "node": "0.1", "title": "[[Grands comptes]]" }
                    ]
                },
                { "node": "1", "title": "Calendrier", "place": { "x": 40.5, "y": 320.0 } }
            ]
        })
    );
}

#[test]
fn an_empty_map_has_no_root() {
    let session = opened(&[("p.md", "---\ntype: carte-mentale\n---\n# Vide\n")]);

    let result = read(&session, "p.md");

    assert_eq!(result["roots"], json!([]));
    assert_eq!(
        (&result["nodes"], &result["total_nodes"]),
        (&json!(0), &json!(0))
    );
    assert_eq!(result["truncated"], false);
    assert!(result.get("message").is_none());
}

#[test]
fn reading_a_map_writes_nothing_and_keeps_no_version() {
    let session = opened(&[("p.md", MAP)]);

    read(&session, "p.md");

    assert_eq!(session.read_note("p.md").unwrap().content, MAP);
    assert!(session.list_versions("p.md").unwrap().is_empty());
}

#[test]
fn a_map_over_the_limit_is_cut_and_the_answer_says_how() {
    let list: String = (0..1500).map(|rank| format!("- {rank:0>60}\n")).collect();
    let text = format!("---\ntype: carte-mentale\n---\n# Grande\n\n{list}");
    let session = opened(&[("g.md", &text)]);

    let result = read(&session, "g.md");

    assert_eq!(result["truncated"], true);
    assert_eq!(result["total_nodes"], 1500);
    let shown = result["nodes"].as_u64().unwrap();
    assert!(shown > 400 && shown < 1500, "{shown}");
    assert_eq!(result["roots"].as_array().unwrap().len() as u64, shown);
    assert_eq!(
        result["message"],
        format!(
            "la carte est coupée : {shown} nœuds sur 1500 sont donnés (la limite est de 50000 \
             caractères d'arbre) ; les nœuds qui suivent le nœud {} dans l'ordre du fichier ne \
             sont pas donnés, mais les chemins donnés restent valables : cherchez un autre nœud \
             avec search_notes, qui rend son chemin (`node`)",
            shown - 1
        )
    );
}

#[test]
fn a_note_that_is_not_a_map_a_missing_note_and_a_bad_path_are_refused() {
    let session = opened(&[("n.md", "# Note\n\n- un\n")]);

    assert_eq!(
        unread(&session, json!({ "path": "n.md" })),
        "cette note n'est pas une carte mentale"
    );
    assert_eq!(
        unread(&session, json!({ "path": "absente.md" })),
        "la note « absente.md » n'existe pas"
    );
    assert_eq!(
        unread(&session, json!({ "path": "../x.md" })),
        session.read_note("../x.md").unwrap_err().message
    );
    assert_eq!(unread(&session, json!({})), "il manque « path »");
}

#[test]
fn a_map_is_read_in_another_workspace_without_changing_the_open_one() {
    let world = world();
    world.allow(&["Notes", "Travail"]);
    let open = world.opened_name();
    let other = if open == "Notes" { "Travail" } else { "Notes" };
    world.found(
        "create_mind_map",
        json!({ "title": "Plan", "content": "- Un\n  - Deux", "workspace": other }),
    );

    let result = world.found(
        "read_mind_map",
        json!({ "path": "plan.md", "workspace": other.to_lowercase() }),
    );

    assert_eq!(result["title"], "Plan");
    assert_eq!(result["roots"][0]["children"][0]["node"], "0.0");
    let missing = world.refused("read_mind_map", json!({ "path": "plan.md" }));
    assert_eq!(missing, "la note « plan.md » n'existe pas");
    assert_eq!(world.opened_name(), open);
}

#[test]
fn a_map_is_not_read_in_a_workspace_that_is_not_allowed() {
    let world = world();
    world.allow(&["Travail"]);

    let error = world.refused(
        "read_mind_map",
        json!({ "path": "plan.md", "workspace": "Notes" }),
    );

    assert_eq!(
        error,
        "aucun espace de travail autorisé ne s'appelle « Notes » ; ceux que les IA peuvent \
         utiliser : « Travail »"
    );
}
