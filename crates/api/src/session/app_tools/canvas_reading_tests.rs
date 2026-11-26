//! L'outil `read_canvas`, joué par son protocole sur des faux (fiche 0079) : un canvas en données,
//! sa taille bornée, ses refus.

use serde_json::{Value, json};

use super::tests::{found, notes_workspace, opened, refused};
use super::workspaces_tests::world;
use crate::session::Session;

/// Un groupe, trois cartes texte (une de couleur hors palette), un fichier, une page, deux flèches.
pub(super) const BOARD: &str = r##"{"nodes":[
{"id":"g","type":"group","x":0,"y":0,"width":500,"height":400,"label":"Phase","color":"4"},
{"id":"a","type":"text","text":"Un","x":10,"y":10,"width":100,"height":50,"color":"1"},
{"id":"b","type":"text","text":"Deux","x":600,"y":10,"width":100,"height":50,"color":"#FF5733"},
{"id":"c","type":"file","file":"n.md","subpath":"#T","x":0,"y":500,"width":400,"height":300},
{"id":"d","type":"link","url":"https://a.fr","x":900,"y":0,"width":400,"height":300,"color":"#2563eb"}],
"edges":[{"id":"e1","fromNode":"a","toNode":"b","label":"vers"},
{"id":"e2","fromNode":"b","fromSide":"bottom","toNode":"c","toSide":"top","fromEnd":"arrow","toEnd":"none"}],
"tags":["x"],"inconnu":7}"##;

pub(super) fn board() -> Session {
    opened(&[("board.canvas", BOARD), ("n.md", "# N")])
}

fn read(session: &Session, path: &str) -> Value {
    let tools = session.open_tools(notes_workspace()).unwrap();
    found(
        session,
        tools.key().as_str(),
        "read_canvas",
        json!({ "path": path }),
    )
}

fn unread(session: &Session, path: &str) -> String {
    let tools = session.open_tools(notes_workspace()).unwrap();
    refused(
        session,
        tools.key().as_str(),
        "read_canvas",
        json!({ "path": path }),
    )
}

#[test]
fn a_canvas_is_read_as_cards_arrows_groups_and_tags_not_as_json() {
    let read = read(&board(), "board.canvas");

    assert_eq!(
        read,
        json!({
            "path": "board.canvas",
            "title": "board.canvas",
            "tags": ["x"],
            "card_count": 5,
            "arrow_count": 2,
            "truncated": false,
            "cards": [
                { "id": "g", "type": "group", "x": 0, "y": 0, "width": 500, "height": 400,
                  "color": "vert", "label": "Phase", "members": ["a"] },
                { "id": "a", "type": "text", "x": 10, "y": 10, "width": 100, "height": 50,
                  "color": "rouge", "text": "Un" },
                { "id": "b", "type": "text", "x": 600, "y": 10, "width": 100, "height": 50,
                  "color": null, "other_color": "#FF5733", "text": "Deux" },
                { "id": "c", "type": "file", "x": 0, "y": 500, "width": 400, "height": 300,
                  "color": null, "file": "n.md", "subpath": "#T" },
                { "id": "d", "type": "link", "x": 900, "y": 0, "width": 400, "height": 300,
                  "color": "bleu", "url": "https://a.fr" }
            ],
            "arrows": [
                { "id": "e1", "from": "a", "to": "b", "from_side": "right", "to_side": "left",
                  "from_end": "none", "to_end": "arrow", "sense": "single", "label": "vers",
                  "color": null },
                { "id": "e2", "from": "b", "to": "c", "from_side": "bottom", "to_side": "top",
                  "from_end": "arrow", "to_end": "none", "sense": null, "color": null }
            ]
        })
    );
}

#[test]
fn an_empty_canvas_is_read_without_cards_and_a_group_lists_the_cards_in_its_frame() {
    let session = opened(&[("v.canvas", "{}")]);
    let read = read(&session, "v.canvas");

    assert_eq!(read["cards"], json!([]));
    assert_eq!(read["arrows"], json!([]));
    assert_eq!(read["tags"], json!([]));
    assert_eq!(read["card_count"], 0);
    assert_eq!(read["truncated"], false);
    assert!(read.get("message").is_none());
}

#[test]
fn reading_a_canvas_writes_nothing_and_keeps_no_version() {
    let session = board();

    read(&session, "board.canvas");

    assert_eq!(session.read_note("board.canvas").unwrap().content, BOARD);
    assert!(session.list_versions("board.canvas").unwrap().is_empty());
}

#[test]
fn a_note_and_an_invalid_canvas_and_a_missing_one_are_refused_with_the_message_of_the_interface() {
    let session = opened(&[("n.md", "# N"), ("bad.canvas", "pas du json")]);

    assert_eq!(unread(&session, "n.md"), "ce fichier n'est pas un canvas");
    assert!(unread(&session, "bad.canvas").starts_with("ce fichier n'est pas un canvas valide"));
    assert!(unread(&session, "absent.canvas").contains("absent.canvas"));
    assert!(unread(&session, "../x.canvas").contains("invalide"));
    let tools = session.open_tools(notes_workspace()).unwrap();
    assert_eq!(
        refused(&session, tools.key().as_str(), "read_canvas", json!({})),
        "il manque « path »"
    );
}

fn many_cards(count: usize, text: &str) -> String {
    let cards: Vec<String> = (0..count)
        .map(|i| {
            format!(
                r#"{{"id":"n{i}","type":"text","text":"{text}","x":{i},"y":0,"width":10,"height":10}}"#
            )
        })
        .collect();
    format!(r#"{{"nodes":[{}]}}"#, cards.join(","))
}

#[test]
fn a_canvas_of_exactly_the_limit_of_cards_is_read_whole() {
    let session = opened(&[("m.canvas", &many_cards(150, ""))]);

    let read = read(&session, "m.canvas");

    assert_eq!(read["cards"].as_array().unwrap().len(), 150);
    assert_eq!(read["card_count"], 150);
    assert_eq!(read["truncated"], false);
    assert!(read.get("message").is_none());
}

#[test]
fn more_cards_than_the_limit_are_cut_and_the_message_says_how_many() {
    let session = opened(&[("m.canvas", &many_cards(151, ""))]);

    let read = read(&session, "m.canvas");

    assert_eq!(read["cards"].as_array().unwrap().len(), 150);
    assert_eq!(read["cards"][149]["id"], "n149");
    assert_eq!(read["card_count"], 151);
    assert_eq!(read["truncated"], true);
    let message = read["message"].as_str().unwrap();
    assert!(message.contains("150 cartes sur 151 sont données (la limite est de 150)"));
    assert!(!message.contains("flèches sur"));
    assert!(!message.contains("texte(s) de carte"));
}

fn many_arrows(count: usize) -> String {
    let arrows: Vec<String> = (0..count)
        .map(|i| format!(r#"{{"id":"f{i}","fromNode":"a","toNode":"b"}}"#))
        .collect();
    format!(
        r#"{{"nodes":[{{"id":"a","type":"text","text":"","x":0,"y":0,"width":1,"height":1}},{{"id":"b","type":"text","text":"","x":9,"y":0,"width":1,"height":1}}],"edges":[{}]}}"#,
        arrows.join(",")
    )
}

#[test]
fn arrows_are_cut_at_their_limit_and_the_message_says_so() {
    let session = opened(&[
        ("a.canvas", &many_arrows(150)),
        ("b.canvas", &many_arrows(151)),
    ]);

    let whole = read(&session, "a.canvas");
    let cut = read(&session, "b.canvas");

    assert_eq!(whole["arrows"].as_array().unwrap().len(), 150);
    assert_eq!(whole["truncated"], false);
    assert_eq!(cut["arrows"].as_array().unwrap().len(), 150);
    assert_eq!(cut["arrow_count"], 151);
    assert_eq!(cut["truncated"], true);
    let message = cut["message"].as_str().unwrap();
    assert!(message.contains("150 flèches sur 151 sont données (la limite est de 150)"));
    assert!(!message.contains("cartes sur"));
    assert!(!message.contains("texte(s) de carte"));
}

#[test]
fn the_texts_of_the_cards_share_a_budget_of_characters_and_a_cut_text_is_marked() {
    // Deux cartes de 12 000 caractères : la première tient, la seconde est coupée à 8 000.
    let text = "é".repeat(12_000);
    let session = opened(&[("t.canvas", &many_cards(2, &text))]);

    let read = read(&session, "t.canvas");

    let first = &read["cards"][0];
    let second = &read["cards"][1];
    assert_eq!(first["text"].as_str().unwrap().chars().count(), 12_000);
    assert!(first.get("text_truncated").is_none());
    assert_eq!(second["text"].as_str().unwrap().chars().count(), 8_000);
    assert_eq!(second["text_truncated"], true);
    assert_eq!(read["truncated"], true);
    let message = read["message"].as_str().unwrap();
    assert!(message.contains("1 texte(s) de carte sont coupés"));
    assert!(message.contains("20000 caractères de texte pour tout le canvas"));
    assert!(message.contains("`text_truncated`"));
}

#[test]
fn texts_that_exactly_fill_the_budget_are_not_cut() {
    let text = "a".repeat(10_000);
    let session = opened(&[("t.canvas", &many_cards(2, &text))]);

    let read = read(&session, "t.canvas");

    assert_eq!(read["cards"][1]["text"].as_str().unwrap().len(), 10_000);
    assert_eq!(read["truncated"], false);
}

#[test]
fn a_canvas_is_read_in_another_workspace_without_changing_the_open_one() {
    let world = world();
    world.allow(&["Notes", "Travail"]);
    application::NoteStore::write(
        &*world.notes,
        &domain::NotePath::parse("c.canvas").unwrap(),
        BOARD,
    )
    .unwrap();

    let read = world.found(
        "read_canvas",
        json!({ "path": "c.canvas", "workspace": "Notes" }),
    );

    assert_eq!(read["card_count"], 5);
    assert_eq!(world.opened_name(), "Travail");
    assert!(
        world
            .refused("read_canvas", json!({ "path": "c.canvas" }))
            .contains("c.canvas")
    );
}
