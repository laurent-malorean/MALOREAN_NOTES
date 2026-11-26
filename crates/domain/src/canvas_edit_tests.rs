use super::*;
use crate::canvas::ArrowEnd;
use crate::mind_map::PALETTE;

/// Un groupe (0, 0, 500, 400), une carte texte dedans, une carte texte dehors, un fichier, une page,
/// et deux flèches : a → b et b → c.
const BASE: &str = r##"{"nodes":[
{"id":"g","type":"group","x":0,"y":0,"width":500,"height":400,"label":"Phase"},
{"id":"a","type":"text","text":"Un","x":10,"y":10,"width":100,"height":50,"color":"1","inconnu":7},
{"id":"b","type":"text","text":"Deux","x":600,"y":10,"width":100,"height":50},
{"id":"c","type":"file","file":"n.md","subpath":"#T","x":0,"y":500,"width":400,"height":300},
{"id":"d","type":"link","url":"https://a.fr","x":900,"y":0,"width":400,"height":300}],
"edges":[{"id":"e1","fromNode":"a","toNode":"b","label":"vers"},
{"id":"e2","fromNode":"b","fromSide":"bottom","toNode":"c","toSide":"top","fromEnd":"arrow","toEnd":"none"}],
"tags":["x"]}"##;

pub(super) fn base() -> Canvas {
    Canvas::parse(BASE).unwrap()
}

pub(super) fn said<T: std::fmt::Debug>(result: Result<T, CanvasEditError>) -> String {
    result.unwrap_err().to_string()
}

pub(super) fn text_card(x: i64, y: i64) -> NewCard {
    NewCard {
        kind: CardKind::Text {
            text: "Neuf".into(),
        },
        x,
        y,
        width: None,
        height: None,
        color: None,
    }
}

pub(super) fn frame(canvas: &Canvas, id: &str) -> (i64, i64, i64, i64) {
    let card = canvas.card(id).unwrap();
    (card.x, card.y, card.width, card.height)
}

#[test]
fn a_fresh_id_is_sixteen_lowercase_hexadecimal_digits_and_never_one_already_taken() {
    let canvas = base();
    let id = canvas.fresh_id();
    assert_eq!(id.len(), 16);
    assert!(id.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f')));
    assert_ne!(canvas.fresh_id(), id);
    let taken = Canvas::parse(
        r#"{"nodes":[{"id":"0000000000000001","type":"text","text":"","x":0,"y":0,"width":1,"height":1}],
"edges":[{"id":"0000000000000002","fromNode":"0000000000000001","toNode":"0000000000000001"}]}"#,
    )
    .unwrap();
    let mut draws = [1, 2, 3, 4].into_iter();
    assert_eq!(
        taken.fresh_id_with(|| draws.next().unwrap()),
        "0000000000000003"
    );
}

fn written(name: &str) -> Option<String> {
    ColorChoice::parse(name).unwrap().written()
}

#[test]
fn a_color_is_written_as_the_interface_writes_it_and_none_writes_nothing() {
    assert_eq!(written("rouge").as_deref(), Some("1"));
    assert_eq!(written("bleu").as_deref(), Some("#2563eb"));
    assert_eq!(written("aucune"), None);
    for name in PALETTE {
        assert!(ColorChoice::parse(name).is_ok(), "{name}");
    }
}

#[test]
fn a_color_outside_the_palette_is_refused_with_the_names_that_are_allowed() {
    let refused = said(ColorChoice::parse("fuchsia"));
    assert!(refused.contains("« fuchsia » n'est pas une couleur de la palette"));
    for name in PALETTE {
        assert!(refused.contains(name), "{name}");
    }
    assert!(refused.contains("« aucune »"));
    assert!(ColorChoice::parse("#FF5733").is_err());
    assert!(ColorChoice::parse("1").is_err());
}

#[test]
fn the_sizes_of_a_new_card_are_the_ones_of_the_interface() {
    let ui = include_str!("../../../ui/src/state/canvas-model.ts");
    for (name, size) in [
        ("TEXT_SIZE", TEXT_SIZE),
        ("FILE_SIZE", FILE_SIZE),
        ("GROUP_SIZE", GROUP_SIZE),
    ] {
        let wanted = format!(
            "{name} = {{ width: {}, height: {} }};",
            size.width, size.height
        );
        assert!(ui.contains(&wanted), "{wanted}");
    }
    assert!(ui.contains(&format!("GROUP_MARGIN = {GROUP_MARGIN};")));
    assert_eq!((TEXT_SIZE.width, TEXT_SIZE.height), (250, 60));
    assert_eq!((FILE_SIZE.width, FILE_SIZE.height), (400, 300));
    assert_eq!((GROUP_SIZE.width, GROUP_SIZE.height), (400, 300));
    assert_eq!(GROUP_MARGIN, 20);
}

#[test]
fn the_three_senses_are_the_ones_of_the_menu_and_are_read_back_from_the_ends() {
    let canvas = base();
    assert_eq!(ArrowSense::of(&canvas.arrows[0]), Some(ArrowSense::Single));
    assert_eq!(ArrowSense::of(&canvas.arrows[1]), None);
    for (name, sense, ends) in [
        ("none", ArrowSense::None, (ArrowEnd::None, ArrowEnd::None)),
        (
            "single",
            ArrowSense::Single,
            (ArrowEnd::None, ArrowEnd::Arrow),
        ),
        ("both", ArrowSense::Both, (ArrowEnd::Arrow, ArrowEnd::Arrow)),
    ] {
        assert_eq!(ArrowSense::parse(name), Ok(sense));
        assert_eq!(sense.name(), name);
        assert_eq!(sense.ends(), ends);
    }
    let refused = said(ArrowSense::parse("double"));
    for expected in ["« double »", "none", "single", "both"] {
        assert!(refused.contains(expected), "{refused}");
    }
}

#[test]
fn a_text_card_is_added_in_front_with_the_size_of_a_new_card_and_a_new_id() {
    let mut canvas = base();
    let id = canvas.add_card(text_card(5, -7)).unwrap();
    let added = canvas.cards.last().unwrap();
    assert_eq!(added.id, id);
    assert_eq!(
        added.kind,
        CardKind::Text {
            text: "Neuf".into()
        }
    );
    assert_eq!(
        (added.x, added.y, added.width, added.height),
        (5, -7, 250, 60)
    );
    assert_eq!(added.color, None);
    assert!(added.extra.is_empty());
    assert_eq!(canvas.cards.len(), 6);
}

#[test]
fn a_file_card_and_a_web_page_card_are_400_by_300_and_their_sizes_and_color_can_be_given() {
    let mut canvas = base();
    let file = canvas
        .add_card(NewCard {
            kind: CardKind::File {
                file: " Notes/p.md ".into(),
                subpath: Some("#x".into()),
            },
            ..text_card(0, 0)
        })
        .unwrap();
    let page = canvas
        .add_card(NewCard {
            kind: CardKind::Link {
                url: " https://example.com ".into(),
            },
            width: Some(10),
            height: Some(20),
            color: Some(ColorChoice::parse("vert").unwrap()),
            ..text_card(1, 2)
        })
        .unwrap();
    assert_eq!(
        canvas.card(&file).unwrap().kind,
        CardKind::File {
            file: "Notes/p.md".into(),
            subpath: None
        }
    );
    assert_eq!(frame(&canvas, &file), (0, 0, 400, 300));
    assert_eq!(
        canvas.card(&page).unwrap().kind,
        CardKind::Link {
            url: "https://example.com".into()
        }
    );
    assert_eq!(frame(&canvas, &page), (1, 2, 10, 20));
    assert_eq!(canvas.card(&page).unwrap().color.as_deref(), Some("4"));
}

fn link_card(url: &str) -> NewCard {
    NewCard {
        kind: CardKind::Link { url: url.into() },
        ..text_card(0, 0)
    }
}

fn sized_card(width: Option<i64>, height: Option<i64>) -> NewCard {
    NewCard {
        width,
        height,
        ..text_card(0, 0)
    }
}

#[test]
fn a_card_with_a_wrong_kind_address_or_file_is_refused_and_changes_nothing() {
    let mut canvas = base();
    let before = canvas.clone();
    let group = NewCard {
        kind: CardKind::Group {
            label: None,
            background: None,
            background_style: None,
        },
        ..text_card(0, 0)
    };
    assert!(said(canvas.add_card(group)).contains("add_canvas_group"));
    for url in ["javascript:alert(1)", "https://a b", "", "ftp://x.fr"] {
        assert!(said(canvas.add_card(link_card(url))).contains("n'est pas une adresse web"));
    }
    let file = NewCard {
        kind: CardKind::File {
            file: "  ".into(),
            subpath: None,
        },
        ..text_card(0, 0)
    };
    assert!(said(canvas.add_card(file)).contains("chemin du fichier est vide"));
    assert_eq!(canvas, before);
}

#[test]
fn a_card_out_of_the_limits_is_refused_and_one_on_the_limits_is_added() {
    let mut canvas = base();
    let before = canvas.clone();
    assert!(said(canvas.add_card(text_card(LIMIT + 1, 0))).contains("la position x"));
    assert!(said(canvas.add_card(text_card(0, -LIMIT - 1))).contains("la position y"));
    assert!(said(canvas.add_card(sized_card(Some(0), None))).contains("la largeur vaut 0"));
    assert!(said(canvas.add_card(sized_card(None, Some(-5)))).contains("la hauteur vaut -5"));
    assert!(said(canvas.add_card(sized_card(Some(LIMIT + 1), None))).contains("la largeur"));
    assert_eq!(canvas, before);
    assert!(canvas.add_card(text_card(LIMIT, -LIMIT)).is_ok());
    assert!(canvas.add_card(sized_card(Some(LIMIT), Some(1))).is_ok());
}

fn text_change(value: &str) -> CardChange {
    CardChange {
        text: Some(value.into()),
        ..CardChange::default()
    }
}

fn url_change(value: &str) -> CardChange {
    CardChange {
        url: Some(value.into()),
        ..CardChange::default()
    }
}

fn file_change(value: &str) -> CardChange {
    CardChange {
        file: Some(value.into()),
        ..CardChange::default()
    }
}

fn colored(change: CardChange, name: &str) -> CardChange {
    CardChange {
        color: Some(ColorChoice::parse(name).unwrap()),
        ..change
    }
}

#[test]
fn the_text_and_the_color_of_a_text_card_change_and_its_other_properties_stay() {
    let mut canvas = base();
    canvas
        .change_card("a", colored(text_change("Autre"), "aucune"))
        .unwrap();
    canvas.change_card("b", text_change("")).unwrap();
    let a = canvas.card("a").unwrap();
    assert_eq!(
        a.kind,
        CardKind::Text {
            text: "Autre".into()
        }
    );
    assert_eq!(a.color, None);
    assert_eq!(a.extra.len(), 1);
    assert_eq!(
        canvas.card("b").unwrap().kind,
        CardKind::Text {
            text: String::new()
        }
    );
}

#[test]
fn the_address_of_a_web_page_card_and_the_file_of_a_file_card_change() {
    let mut canvas = base();
    canvas
        .change_card("d", colored(url_change(" https://b.fr "), "violet"))
        .unwrap();
    canvas.change_card("c", file_change("autre.md")).unwrap();
    assert_eq!(
        canvas.card("d").unwrap().kind,
        CardKind::Link {
            url: "https://b.fr".into()
        }
    );
    assert_eq!(canvas.card("d").unwrap().color.as_deref(), Some("6"));
    assert_eq!(
        canvas.card("c").unwrap().kind,
        CardKind::File {
            file: "autre.md".into(),
            subpath: None
        }
    );
}

#[test]
fn a_change_that_does_not_fit_the_card_is_refused_and_names_its_type() {
    let mut canvas = base();
    let before = canvas.clone();
    let refused = said(canvas.change_card("c", text_change("x")));
    assert!(
        refused.contains("la carte « c » est une carte fichier"),
        "{refused}"
    );
    assert!(refused.contains("« text » ne s'applique qu'à une carte texte"));
    let refused = said(canvas.change_card("a", url_change("https://x.fr")));
    assert!(refused.contains("carte texte") && refused.contains("« url »"));
    assert!(said(canvas.change_card("d", file_change("x.md"))).contains("carte page web"));
    assert!(said(canvas.change_card("a", file_change("x.md"))).contains("« file »"));
    let both = CardChange {
        url: Some("https://x.fr".into()),
        ..text_change("x")
    };
    assert!(said(canvas.change_card("a", both)).contains("« url »"));
    assert_eq!(canvas, before);
}

#[test]
fn a_change_with_nothing_to_change_a_bad_value_a_group_or_an_unknown_card_is_refused() {
    let mut canvas = base();
    let before = canvas.clone();
    let bad = said(canvas.change_card("d", url_change("pas une adresse")));
    assert!(bad.contains("adresse web"));
    assert!(said(canvas.change_card("c", file_change(" "))).contains("vide"));
    assert!(said(canvas.change_card("a", CardChange::default())).contains("rien à changer"));
    assert!(said(canvas.change_card("g", text_change("x"))).contains("change_canvas_group"));
    let unknown = said(canvas.change_card("zz", text_change("x")));
    assert!(unknown.contains("la carte « zz » n'existe pas"));
    assert_eq!(canvas, before);
}

#[test]
fn an_unknown_card_is_refused_with_the_ids_that_exist() {
    let mut canvas = base();
    let refused = said(canvas.move_card("zz", 0, 0));
    assert!(refused.contains("(cartes : g, a, b, c, d)"), "{refused}");
    assert!(refused.contains("read_canvas"));
    let many = Canvas::parse(&format!(
        r#"{{"nodes":[{}]}}"#,
        (0..12)
            .map(|i| format!(
                r#"{{"id":"n{i}","type":"text","text":"","x":0,"y":0,"width":1,"height":1}}"#
            ))
            .collect::<Vec<_>>()
            .join(",")
    ))
    .unwrap();
    let refused = said(many.clone().remove_card("zz"));
    assert!(refused.contains("n0, n1, n2, n3, n4, n5, n6, n7, n8, n9, … (12 au total)"));
    assert!(!refused.contains("n10"));
    let ten = Canvas::parse(&format!(
        r#"{{"nodes":[{}]}}"#,
        (0..10)
            .map(|i| format!(
                r#"{{"id":"n{i}","type":"text","text":"","x":0,"y":0,"width":1,"height":1}}"#
            ))
            .collect::<Vec<_>>()
            .join(",")
    ))
    .unwrap();
    assert!(!said(ten.clone().remove_card("zz")).contains("au total"));
}

#[test]
fn a_card_moves_to_its_new_corner_and_the_cards_of_a_group_follow_their_group() {
    let mut canvas = base();
    assert_eq!(canvas.move_card("b", 650, 20).unwrap(), ["b"]);
    assert_eq!(frame(&canvas, "b"), (650, 20, 100, 50));

    let moved = canvas.move_card("g", 100, -50).unwrap();

    assert_eq!(moved, ["g", "a"]);
    assert_eq!(frame(&canvas, "g"), (100, -50, 500, 400));
    assert_eq!(frame(&canvas, "a"), (110, -40, 100, 50));
    assert_eq!(frame(&canvas, "b"), (650, 20, 100, 50));
    assert_eq!(frame(&canvas, "c"), (0, 500, 400, 300));
}

#[test]
fn a_move_out_of_the_limits_changes_nothing() {
    let mut canvas = base();
    let before = canvas.clone();
    assert!(said(canvas.move_card("a", LIMIT + 1, 0)).contains("la position x"));
    assert!(said(canvas.move_card("a", 0, LIMIT + 1)).contains("la position y"));
    assert_eq!(canvas, before);
    assert!(canvas.move_card("a", -LIMIT, LIMIT).is_ok());
}

#[test]
fn a_card_is_resized_from_its_top_left_corner_and_moves_no_other_card() {
    let mut canvas = base();
    canvas.resize_card("g", 100, 90).unwrap();
    assert_eq!(frame(&canvas, "g"), (0, 0, 100, 90));
    assert_eq!(frame(&canvas, "a"), (10, 10, 100, 50));
    let before = canvas.clone();
    assert!(said(canvas.resize_card("a", 0, 5)).contains("la largeur vaut 0"));
    assert!(said(canvas.resize_card("a", 5, 0)).contains("la hauteur vaut 0"));
    assert!(said(canvas.resize_card("zz", 5, 5)).contains("n'existe pas"));
    assert_eq!(canvas, before);
    assert!(canvas.resize_card("a", 1, LIMIT).is_ok());
    assert_eq!(frame(&canvas, "a"), (10, 10, 1, LIMIT));
}

#[test]
fn a_card_is_removed_with_the_arrows_that_touch_it_and_a_group_leaves_its_cards() {
    let mut canvas = base();
    assert_eq!(canvas.remove_card("b").unwrap(), ["e1", "e2"]);
    assert!(canvas.card("b").is_none());
    assert!(canvas.arrows.is_empty());

    let mut canvas = base();
    assert_eq!(canvas.remove_card("g").unwrap(), Vec::<String>::new());
    assert!(canvas.card("a").is_some());
    assert_eq!(canvas.arrows.len(), 2);

    let mut canvas = base();
    assert_eq!(canvas.remove_card("c").unwrap(), ["e2"]);
    assert_eq!(canvas.arrows.len(), 1);
    assert_eq!(canvas.arrows[0].id, "e1");
}
