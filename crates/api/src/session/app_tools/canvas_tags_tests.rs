//! Les étiquettes d'un canvas par les outils `add_tags` et `remove_tags` (fiche 0079) : la propriété
//! `tags` de la racine du fichier, jamais un en-tête.

use serde_json::json;

use super::canvas_changing_tests::{canvas, done, failed, text};
use super::canvas_reading_tests::board;
use super::tests::opened;

#[test]
fn the_tags_of_a_canvas_are_added_and_removed_at_its_root_keeping_everything_else() {
    let session = board();

    let added = done(
        &session,
        "add_tags",
        json!({ "path": "board.canvas", "tags": ["idées", "x", "#projet"] }),
    );
    let removed = done(
        &session,
        "remove_tags",
        json!({ "path": "board.canvas", "tags": ["x"] }),
    );

    assert_eq!(
        added,
        json!({ "path": "board.canvas", "tags": ["x", "idées", "projet"] })
    );
    assert_eq!(
        removed,
        json!({ "path": "board.canvas", "tags": ["idées", "projet"] })
    );
    let written = text(&session);
    assert!(written.contains(r#""tags":["idées","projet"]"#));
    assert!(written.contains(r#""inconnu":7"#));
    assert!(!written.contains("---"));
    assert_eq!(canvas(&session).cards.len(), 5);
}

#[test]
fn removing_the_last_tag_of_a_canvas_removes_the_property_and_an_invalid_canvas_is_left_alone() {
    let session = opened(&[
        ("c.canvas", r#"{"tags":["a"]}"#),
        ("bad.canvas", "pas du json"),
    ]);

    let removed = done(
        &session,
        "remove_tags",
        json!({ "path": "c.canvas", "tags": ["a"] }),
    );
    let refused_on_invalid = failed(
        &session,
        "add_tags",
        json!({ "path": "bad.canvas", "tags": ["a"] }),
    );

    assert_eq!(removed, json!({ "path": "c.canvas", "tags": [] }));
    assert!(
        !session
            .read_note("c.canvas")
            .unwrap()
            .content
            .contains("tags")
    );
    assert!(refused_on_invalid.starts_with("ce fichier n'est pas un canvas valide"));
    assert_eq!(
        session.read_note("bad.canvas").unwrap().content,
        "pas du json"
    );
}
