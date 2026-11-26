//! Les outils qui changent un canvas, joués par leur protocole sur des faux (fiche 0079) : chaque
//! geste, ses refus dits à l'IA, la version gardée, l'index, les propriétés inconnues.

use domain::canvas::{Canvas, CardKind};
use serde_json::{Value, json};

use super::canvas_reading_tests::{BOARD, board};
use super::tests::{found, notes_workspace, opened, paths, refused};
use super::workspaces_tests::world;
use crate::session::Session;

pub(super) fn done(session: &Session, tool: &str, arguments: Value) -> Value {
    let tools = session.open_tools(notes_workspace()).unwrap();
    found(session, tools.key().as_str(), tool, arguments)
}

pub(super) fn failed(session: &Session, tool: &str, arguments: Value) -> String {
    let tools = session.open_tools(notes_workspace()).unwrap();
    refused(session, tools.key().as_str(), tool, arguments)
}

pub(super) fn text(session: &Session) -> String {
    session.read_note("board.canvas").unwrap().content
}

pub(super) fn canvas(session: &Session) -> Canvas {
    Canvas::parse(&text(session)).unwrap()
}

fn frame(session: &Session, id: &str) -> (i64, i64, i64, i64) {
    let canvas = canvas(session);
    let card = canvas.card(id).unwrap();
    (card.x, card.y, card.width, card.height)
}

/// Le nombre de versions gardées du canvas.
fn versions(session: &Session) -> usize {
    session.list_versions("board.canvas").unwrap().len()
}

fn is_new_id(id: &Value) -> bool {
    let id = id.as_str().unwrap();
    id.len() == 16 && id.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f'))
}

#[test]
fn a_text_card_is_added_and_the_tool_gives_it_back_with_its_new_id() {
    let session = board();

    let result = done(
        &session,
        "add_canvas_card",
        json!({ "path": "board.canvas", "type": "text", "text": "Neuf", "x": 5, "y": -7, "color": "bleu" }),
    );

    assert_eq!(result["path"], "board.canvas");
    let card = &result["card"];
    assert!(is_new_id(&card["id"]));
    assert_eq!(card["type"], "text");
    assert_eq!(card["text"], "Neuf");
    assert_eq!(card["color"], "bleu");
    let id = card["id"].as_str().unwrap();
    assert_eq!(frame(&session, id), (5, -7, 250, 60));
    assert_eq!(canvas(&session).cards.last().unwrap().id, id);
    assert!(text(&session).contains(r##""color":"#2563eb""##));
}

#[test]
fn a_file_card_and_a_web_page_card_take_the_size_of_a_new_card() {
    let session = board();

    let file = done(
        &session,
        "add_canvas_card",
        json!({ "path": "board.canvas", "type": "file", "file": "n.md", "x": 1, "y": 2 }),
    );
    let page = done(
        &session,
        "add_canvas_card",
        json!({ "path": "board.canvas", "type": "link", "url": "https://exemple.fr", "x": 3, "y": 4,
                "width": 50, "height": 60 }),
    );

    assert_eq!(file["card"]["file"], "n.md");
    assert_eq!(page["card"]["url"], "https://exemple.fr");
    assert_eq!(
        frame(&session, file["card"]["id"].as_str().unwrap()),
        (1, 2, 400, 300)
    );
    assert_eq!(
        frame(&session, page["card"]["id"].as_str().unwrap()),
        (3, 4, 50, 60)
    );
}

#[test]
fn a_file_card_needs_a_file_of_the_workspace() {
    let session = board();

    let said = failed(
        &session,
        "add_canvas_card",
        json!({ "path": "board.canvas", "type": "file", "file": "absent.md", "x": 0, "y": 0 }),
    );

    assert!(
        said.contains("« absent.md » n'existe pas dans l'espace de travail"),
        "{said}"
    );
    assert_eq!(text(&session), BOARD);
}

#[test]
fn a_change_keeps_the_text_before_it_as_a_version_that_restores_it() {
    let session = board();

    done(
        &session,
        "add_canvas_card",
        json!({ "path": "board.canvas", "type": "text", "x": 0, "y": 0 }),
    );

    assert_eq!(versions(&session), 1);
    let version = session.list_versions("board.canvas").unwrap()[0].id.clone();
    assert_eq!(
        session.read_version("board.canvas", &version).unwrap(),
        BOARD
    );
    done(
        &session,
        "restore_version",
        json!({ "path": "board.canvas", "version": version }),
    );
    assert_eq!(text(&session), BOARD);
}

#[test]
fn the_search_index_follows_the_cards_an_ai_adds() {
    let session = board();

    done(
        &session,
        "add_canvas_card",
        json!({ "path": "board.canvas", "type": "text", "text": "marmelade", "x": 0, "y": 0 }),
    );

    let tools = session.open_tools(notes_workspace()).unwrap();
    let result = found(
        &session,
        tools.key().as_str(),
        "search_notes",
        json!({ "query": "marmelade" }),
    );
    assert_eq!(paths(&result), ["board.canvas"]);
}

#[test]
fn the_unknown_properties_the_tags_and_the_other_cards_survive_a_change() {
    let session = board();

    done(
        &session,
        "move_canvas_card",
        json!({ "path": "board.canvas", "id": "a", "x": 11, "y": 12 }),
    );

    let written = text(&session);
    assert!(written.contains(r#""inconnu":7"#));
    assert!(written.contains(r#""tags":["x"]"#));
    assert!(written.contains(r##""color":"#FF5733""##));
    assert_eq!(canvas(&session).cards.len(), 5);
}

#[test]
fn the_text_and_the_color_of_a_card_change_and_so_do_its_address_and_its_file() {
    let session = board();

    let changed = done(
        &session,
        "change_canvas_card",
        json!({ "path": "board.canvas", "id": "a", "text": "Autre", "color": "aucune" }),
    );
    done(
        &session,
        "change_canvas_card",
        json!({ "path": "board.canvas", "id": "d", "url": "https://b.fr" }),
    );
    done(
        &session,
        "change_canvas_card",
        json!({ "path": "board.canvas", "id": "c", "file": "n.md", "color": "violet" }),
    );

    assert_eq!(changed["card"]["text"], "Autre");
    assert_eq!(changed["card"]["color"], Value::Null);
    let after = canvas(&session);
    assert_eq!(
        after.card("d").unwrap().kind,
        CardKind::Link {
            url: "https://b.fr".into()
        }
    );
    assert_eq!(
        after.card("c").unwrap().kind,
        CardKind::File {
            file: "n.md".into(),
            subpath: None
        }
    );
    assert_eq!(after.card("c").unwrap().color.as_deref(), Some("6"));
}

#[test]
fn a_card_is_moved_with_the_cards_of_its_group() {
    let session = board();

    let moved = done(
        &session,
        "move_canvas_card",
        json!({ "path": "board.canvas", "id": "g", "x": 100, "y": 50 }),
    );

    assert_eq!(
        moved,
        json!({ "path": "board.canvas", "moved": ["g", "a"] })
    );
    assert_eq!(frame(&session, "g"), (100, 50, 500, 400));
    assert_eq!(frame(&session, "a"), (110, 60, 100, 50));
    assert_eq!(frame(&session, "b"), (600, 10, 100, 50));
}

#[test]
fn a_card_is_resized_from_its_corner_and_the_card_is_given_back() {
    let session = board();

    let resized = done(
        &session,
        "resize_canvas_card",
        json!({ "path": "board.canvas", "id": "b", "width": 120, "height": 70 }),
    );

    assert_eq!(resized["card"]["width"], 120);
    assert_eq!(resized["card"]["height"], 70);
    assert_eq!(frame(&session, "b"), (600, 10, 120, 70));
}

#[test]
fn a_card_is_removed_with_its_arrows_and_the_tool_names_them() {
    let session = board();

    let removed = done(
        &session,
        "remove_canvas_card",
        json!({ "path": "board.canvas", "id": "b" }),
    );

    assert_eq!(
        removed,
        json!({ "path": "board.canvas", "removed": "b", "removed_arrows": ["e1", "e2"] })
    );
    assert!(canvas(&session).arrows.is_empty());
    assert!(canvas(&session).card("b").is_none());
}

/// Ajoute une flèche de `a` à `d`, double sens, étiquetée et rouge ; rend sa description.
fn added_arrow(session: &Session) -> Value {
    done(
        session,
        "add_canvas_arrow",
        json!({ "path": "board.canvas", "from": "a", "to": "d", "sense": "both", "label": "lien", "color": "rouge" }),
    )["arrow"]
        .clone()
}

#[test]
fn an_arrow_is_added_with_its_sides_deduced_and_the_options_that_are_given() {
    let session = board();

    let arrow = added_arrow(&session);

    assert!(is_new_id(&arrow["id"]));
    assert_eq!(arrow["sense"], "both");
    assert_eq!(arrow["from_side"], "right");
    assert_eq!(arrow["to_side"], "left");
    assert_eq!(arrow["label"], "lien");
    assert_eq!(arrow["color"], "rouge");
    assert_eq!(canvas(&session).arrows.len(), 3);
}

#[test]
fn an_arrow_is_changed_reconnected_and_removed() {
    let session = board();
    let id = added_arrow(&session)["id"].as_str().unwrap().to_owned();

    let changed = done(
        &session,
        "change_canvas_arrow",
        json!({ "path": "board.canvas", "id": id, "sense": "none", "label": "", "to": "c", "from_side": "top" }),
    );
    let removed = done(
        &session,
        "remove_canvas_arrow",
        json!({ "path": "board.canvas", "id": id }),
    );

    let arrow = &changed["arrow"];
    assert_eq!(arrow["sense"], "none");
    assert_eq!(arrow["to"], "c");
    assert_eq!(arrow["from_side"], "top");
    assert_eq!(arrow["to_side"], "top");
    assert!(arrow.get("label").is_none());
    assert_eq!(removed, json!({ "path": "board.canvas", "removed": id }));
    assert_eq!(canvas(&session).arrows.len(), 2);
}

#[test]
fn a_group_is_added_around_cards_or_empty_and_changed() {
    let session = board();

    let around = done(
        &session,
        "add_canvas_group",
        json!({ "path": "board.canvas", "cards": ["a", "b"], "label": "Idées" }),
    );
    let empty = done(
        &session,
        "add_canvas_group",
        json!({ "path": "board.canvas", "x": 7, "y": 8, "color": "vert" }),
    );

    let around_id = around["card"]["id"].as_str().unwrap();
    assert_eq!(frame(&session, around_id), (-10, -10, 730, 90));
    assert_eq!(around["card"]["label"], "Idées");
    assert_eq!(around["card"]["members"], json!(["a", "b"]));
    let empty_id = empty["card"]["id"].as_str().unwrap();
    assert_eq!(frame(&session, empty_id), (7, 8, 400, 300));
    assert_eq!(empty["card"]["color"], "vert");
    assert_eq!(canvas(&session).cards[0].id, empty_id);

    let changed = done(
        &session,
        "change_canvas_group",
        json!({ "path": "board.canvas", "id": around_id, "label": "", "color": "ardoise" }),
    );
    assert_eq!(changed["card"]["color"], "ardoise");
    assert!(changed["card"].get("label").is_none());
}

fn refusals() -> [(&'static str, Value, &'static str); 6] {
    [
        (
            "move_canvas_card",
            json!({ "id": "zz", "x": 0, "y": 0 }),
            "la carte « zz » n'existe pas dans ce canvas (cartes : g, a, b, c, d)",
        ),
        (
            "remove_canvas_arrow",
            json!({ "id": "zz" }),
            "la flèche « zz » n'existe pas dans ce canvas (flèches : e1, e2)",
        ),
        (
            "change_canvas_card",
            json!({ "id": "a", "color": "fuchsia" }),
            "« fuchsia » n'est pas une couleur de la palette",
        ),
        (
            "change_canvas_card",
            json!({ "id": "a", "color": "#FF5733" }),
            "n'est pas une couleur de la palette",
        ),
        (
            "change_canvas_card",
            json!({ "id": "c", "text": "x" }),
            "la carte « c » est une carte fichier",
        ),
        (
            "change_canvas_card",
            json!({ "id": "g", "color": "rouge" }),
            "change_canvas_group",
        ),
    ]
}

fn more_refusals() -> [(&'static str, Value, &'static str); 6] {
    [
        (
            "change_canvas_group",
            json!({ "id": "a", "label": "x" }),
            "n'est pas un groupe",
        ),
        (
            "resize_canvas_card",
            json!({ "id": "a", "width": 0, "height": 5 }),
            "la largeur vaut 0",
        ),
        (
            "add_canvas_arrow",
            json!({ "from": "a", "to": "a" }),
            "deux cartes différentes",
        ),
        (
            "add_canvas_card",
            json!({ "type": "link", "url": "javascript:x", "x": 0, "y": 0 }),
            "n'est pas une adresse web",
        ),
        (
            "add_canvas_group",
            json!({ "cards": ["a", "zz"] }),
            "la carte « zz »",
        ),
        (
            "move_canvas_card",
            json!({ "id": "a", "x": 2_000_000_000_i64, "y": 0 }),
            "la position x",
        ),
    ]
}

#[test]
fn a_gesture_that_is_refused_changes_nothing_keeps_no_version_and_says_what_to_do() {
    let session = board();
    for (tool, mut arguments, expected) in refusals().into_iter().chain(more_refusals()) {
        arguments["path"] = json!("board.canvas");
        let said = failed(&session, tool, arguments);
        assert!(said.contains(expected), "{tool} : {said}");
    }
    assert_eq!(text(&session), BOARD);
    assert_eq!(versions(&session), 0);
}

fn mistakes() -> [(&'static str, Value, &'static str); 12] {
    [
        (
            "add_canvas_card",
            json!({ "type": "text", "y": 0 }),
            "il manque « x »",
        ),
        (
            "add_canvas_card",
            json!({ "x": 0, "y": 0 }),
            "il manque « type »",
        ),
        (
            "add_canvas_card",
            json!({ "type": "group", "x": 0, "y": 0 }),
            "« group » n'est pas un type de carte",
        ),
        (
            "add_canvas_card",
            json!({ "type": "file", "x": 0, "y": 0 }),
            "il manque « file »",
        ),
        (
            "add_canvas_card",
            json!({ "type": "text", "x": 1.5, "y": 0 }),
            "« x » doit être un nombre entier",
        ),
        (
            "change_canvas_card",
            json!({ "id": "a" }),
            "rien à changer : donnez au moins l'un de « text »",
        ),
        (
            "change_canvas_arrow",
            json!({ "id": "e1" }),
            "rien à changer",
        ),
        (
            "change_canvas_arrow",
            json!({ "id": "e1", "sense": "double" }),
            "« double » n'est pas un sens de flèche",
        ),
        (
            "change_canvas_arrow",
            json!({ "id": "e1", "to_side": "middle" }),
            "« middle » n'est pas un côté",
        ),
        ("add_canvas_group", json!({}), "donnez soit « cards »"),
        (
            "add_canvas_group",
            json!({ "cards": ["a"], "x": 1, "y": 2 }),
            "pas les deux",
        ),
        (
            "add_canvas_group",
            json!({ "x": 1 }),
            "donnez soit « cards »",
        ),
    ]
}

#[test]
fn what_the_ai_forgets_or_gets_wrong_is_named() {
    let session = board();
    for (tool, mut arguments, expected) in mistakes() {
        arguments["path"] = json!("board.canvas");
        let said = failed(&session, tool, arguments);
        assert!(said.contains(expected), "{tool} : {said}");
    }
    assert_eq!(text(&session), BOARD);
}

#[test]
fn a_note_and_an_invalid_canvas_are_refused_and_left_alone() {
    let session = opened(&[("n.md", "# N"), ("bad.canvas", "pas du json")]);

    let on_note = failed(
        &session,
        "add_canvas_card",
        json!({ "path": "n.md", "type": "text", "x": 0, "y": 0 }),
    );
    let on_bad = failed(
        &session,
        "remove_canvas_card",
        json!({ "path": "bad.canvas", "id": "a" }),
    );

    assert_eq!(on_note, "ce fichier n'est pas un canvas");
    assert!(on_bad.starts_with("ce fichier n'est pas un canvas valide"));
    assert_eq!(
        session.read_note("bad.canvas").unwrap().content,
        "pas du json"
    );
    assert_eq!(session.read_note("n.md").unwrap().content, "# N");
}

#[test]
fn a_canvas_is_changed_in_another_workspace_without_changing_the_open_one() {
    let world = world();
    world.allow(&["Notes", "Travail"]);
    application::NoteStore::write(
        &*world.notes,
        &domain::NotePath::parse("c.canvas").unwrap(),
        BOARD,
    )
    .unwrap();

    let added = world.found(
        "add_canvas_card",
        json!({ "path": "c.canvas", "type": "text", "text": "ailleurs", "x": 0, "y": 0, "workspace": "Notes" }),
    );

    assert_eq!(added["card"]["text"], "ailleurs");
    let written =
        application::NoteStore::read(&*world.notes, &domain::NotePath::parse("c.canvas").unwrap())
            .unwrap()
            .content;
    assert!(written.contains("ailleurs"));
    assert_eq!(world.opened_name(), "Travail");
}
