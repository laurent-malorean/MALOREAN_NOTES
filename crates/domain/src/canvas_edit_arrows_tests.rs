//! Les gestes sur les flèches et les groupes d'un canvas (fiche 0079).

use super::tests::{base, frame, said, text_card};
use super::*;
use crate::canvas::{ArrowEnd, Side};

fn arrow(from: &str, to: &str) -> NewArrow {
    NewArrow {
        from: from.into(),
        to: to.into(),
        from_side: None,
        to_side: None,
        sense: None,
        label: None,
        color: None,
    }
}

#[test]
fn an_arrow_is_added_with_the_sides_deduced_from_the_positions_and_a_head_at_its_end() {
    let mut canvas = base();
    let id = canvas.add_arrow(arrow("a", "b")).unwrap();
    let added = canvas.arrows.last().unwrap();
    assert_eq!(added.id, id);
    assert_eq!((added.from.as_str(), added.to.as_str()), ("a", "b"));
    assert_eq!(added.from_side, Some(Side::Right));
    assert_eq!(added.to_side, Some(Side::Left));
    assert_eq!(ArrowSense::of(added), Some(ArrowSense::Single));
    assert_eq!(
        (added.color.as_deref(), added.label.as_deref()),
        (None, None)
    );
    let down = canvas.add_arrow(arrow("a", "c")).unwrap();
    let down = canvas.arrows.iter().find(|a| a.id == down).unwrap();
    assert_eq!(
        (down.from_side, down.to_side),
        (Some(Side::Bottom), Some(Side::Top))
    );
}

#[test]
fn an_arrow_takes_the_sides_the_sense_the_label_and_the_color_that_are_given() {
    let mut canvas = base();
    let id = canvas
        .add_arrow(NewArrow {
            from_side: Some(Side::Top),
            to_side: Some(Side::Bottom),
            sense: Some(ArrowSense::Both),
            label: Some("lien".into()),
            color: Some(ColorChoice::parse("rouge").unwrap()),
            ..arrow("a", "b")
        })
        .unwrap();
    let added = canvas.arrows.iter().find(|a| a.id == id).unwrap();
    assert_eq!(
        (added.from_side, added.to_side),
        (Some(Side::Top), Some(Side::Bottom))
    );
    assert_eq!(ArrowSense::of(added), Some(ArrowSense::Both));
    assert_eq!(added.label.as_deref(), Some("lien"));
    assert_eq!(added.color.as_deref(), Some("1"));
    let only_one = canvas
        .add_arrow(NewArrow {
            from_side: Some(Side::Left),
            label: Some(String::new()),
            ..arrow("a", "b")
        })
        .unwrap();
    let only_one = canvas.arrows.iter().find(|a| a.id == only_one).unwrap();
    assert_eq!(
        (only_one.from_side, only_one.to_side),
        (Some(Side::Left), Some(Side::Left))
    );
    assert_eq!(only_one.label, None);
}

#[test]
fn an_arrow_between_unknown_or_identical_cards_is_refused() {
    let mut canvas = base();
    let before = canvas.clone();
    assert!(said(canvas.add_arrow(arrow("a", "zz"))).contains("la carte « zz »"));
    assert!(said(canvas.add_arrow(arrow("zz", "a"))).contains("la carte « zz »"));
    assert!(said(canvas.add_arrow(arrow("a", "a"))).contains("deux cartes différentes"));
    assert_eq!(canvas, before);
}

#[test]
fn the_sense_the_label_and_the_color_of_an_arrow_change() {
    let mut canvas = base();
    canvas
        .change_arrow(
            "e1",
            ArrowChange {
                sense: Some(ArrowSense::None),
                label: Some(String::new()),
                color: Some(ColorChoice::parse("jaune").unwrap()),
                ..ArrowChange::default()
            },
        )
        .unwrap();
    let e1 = canvas.arrows.iter().find(|a| a.id == "e1").unwrap();
    assert_eq!(ArrowSense::of(e1), Some(ArrowSense::None));
    assert_eq!(e1.label, None);
    assert_eq!(e1.color.as_deref(), Some("3"));
    canvas
        .change_arrow(
            "e1",
            ArrowChange {
                label: Some("neuf".into()),
                sense: Some(ArrowSense::Both),
                color: Some(ColorChoice::Without),
                ..ArrowChange::default()
            },
        )
        .unwrap();
    let e1 = canvas.arrows.iter().find(|a| a.id == "e1").unwrap();
    assert_eq!(e1.label.as_deref(), Some("neuf"));
    assert_eq!(ArrowSense::of(e1), Some(ArrowSense::Both));
    assert_eq!(e1.color, None);
}

#[test]
fn an_end_of_an_arrow_is_reconnected_with_a_side_deduced_unless_it_is_given() {
    let mut canvas = base();
    canvas
        .change_arrow(
            "e1",
            ArrowChange {
                to: Some("c".into()),
                ..ArrowChange::default()
            },
        )
        .unwrap();
    let e1 = canvas.arrows.iter().find(|a| a.id == "e1").unwrap();
    assert_eq!((e1.from.as_str(), e1.to.as_str()), ("a", "c"));
    assert_eq!(e1.from_side, None);
    assert_eq!(e1.to_side, Some(Side::Top));

    canvas
        .change_arrow(
            "e1",
            ArrowChange {
                from: Some("d".into()),
                to_side: Some(Side::Right),
                ..ArrowChange::default()
            },
        )
        .unwrap();
    let e1 = canvas.arrows.iter().find(|a| a.id == "e1").unwrap();
    assert_eq!((e1.from.as_str(), e1.to.as_str()), ("d", "c"));
    assert_eq!(e1.from_side, Some(Side::Left));
    assert_eq!(e1.to_side, Some(Side::Right));

    canvas
        .change_arrow(
            "e2",
            ArrowChange {
                from_side: Some(Side::Left),
                ..ArrowChange::default()
            },
        )
        .unwrap();
    let e2 = canvas.arrows.iter().find(|a| a.id == "e2").unwrap();
    assert_eq!(
        (e2.from_side, e2.to_side),
        (Some(Side::Left), Some(Side::Top))
    );
    assert_eq!(e2.from_end, ArrowEnd::Arrow);
}

#[test]
fn a_change_of_an_arrow_that_is_refused_changes_nothing() {
    let mut canvas = base();
    let before = canvas.clone();
    let to = |id: &str| ArrowChange {
        to: Some(id.into()),
        ..ArrowChange::default()
    };
    assert!(said(canvas.change_arrow("zz", to("a"))).contains("la flèche « zz » n'existe pas"));
    assert!(said(canvas.change_arrow("e1", to("zz"))).contains("la carte « zz »"));
    assert!(said(canvas.change_arrow("e1", to("a"))).contains("deux cartes différentes"));
    let from = ArrowChange {
        from: Some("b".into()),
        ..ArrowChange::default()
    };
    assert!(said(canvas.change_arrow("e1", from)).contains("deux cartes différentes"));
    assert!(said(canvas.change_arrow("e1", ArrowChange::default())).contains("rien à changer"));
    assert_eq!(canvas, before);
    let refused = said(canvas.remove_arrow("zz"));
    assert!(refused.contains("(flèches : e1, e2)"), "{refused}");
}

#[test]
fn an_arrow_is_removed() {
    let mut canvas = base();
    canvas.remove_arrow("e1").unwrap();
    assert_eq!(canvas.arrows.len(), 1);
    assert_eq!(canvas.arrows[0].id, "e2");
}

#[test]
fn an_empty_group_is_added_under_the_other_cards_with_the_size_of_a_new_group() {
    let mut canvas = base();
    let id = canvas
        .add_group(NewGroup {
            place: GroupPlace::At {
                x: 7,
                y: 8,
                width: None,
                height: None,
            },
            label: Some("Idées".into()),
            color: Some(ColorChoice::parse("turquoise").unwrap()),
        })
        .unwrap();
    let group = &canvas.cards[0];
    assert_eq!(group.id, id);
    assert_eq!(
        group.kind,
        CardKind::Group {
            label: Some("Idées".into()),
            background: None,
            background_style: None
        }
    );
    assert_eq!(
        (group.x, group.y, group.width, group.height),
        (7, 8, 400, 300)
    );
    assert_eq!(group.color.as_deref(), Some("5"));
    let sized = canvas
        .add_group(NewGroup {
            place: GroupPlace::At {
                x: 0,
                y: 0,
                width: Some(30),
                height: Some(40),
            },
            label: Some(String::new()),
            color: None,
        })
        .unwrap();
    assert_eq!(frame(&canvas, &sized), (0, 0, 30, 40));
    assert_eq!(
        canvas.card(&sized).unwrap().kind,
        CardKind::Group {
            label: None,
            background: None,
            background_style: None
        }
    );
}

#[test]
fn a_group_around_cards_is_their_bounds_plus_the_margin_of_the_interface() {
    let mut canvas = base();
    let id = canvas
        .add_group(NewGroup {
            place: GroupPlace::Around(vec!["a".into(), "b".into()]),
            label: None,
            color: None,
        })
        .unwrap();
    assert_eq!(frame(&canvas, &id), (-10, -10, 730, 90));
    assert_eq!(canvas.cards[0].id, id);
    let members: Vec<&str> = canvas
        .members_of(&id)
        .iter()
        .map(|card| card.id.as_str())
        .collect();
    assert_eq!(members, ["a", "b"]);
}

#[test]
fn a_group_that_is_refused_changes_nothing() {
    let mut canvas = base();
    let before = canvas.clone();
    let around = |ids: &[&str]| NewGroup {
        place: GroupPlace::Around(ids.iter().map(|id| (*id).to_owned()).collect()),
        label: None,
        color: None,
    };
    assert!(said(canvas.add_group(around(&["a", "zz"]))).contains("la carte « zz »"));
    assert!(said(canvas.add_group(around(&[]))).contains("« cards » est vide"));
    let at = |width, x| NewGroup {
        place: GroupPlace::At {
            x,
            y: 0,
            width,
            height: None,
        },
        label: None,
        color: None,
    };
    assert!(said(canvas.add_group(at(Some(0), 0))).contains("la largeur"));
    assert!(said(canvas.add_group(at(None, LIMIT + 1))).contains("la position x"));
    assert_eq!(canvas, before);
}

#[test]
fn the_name_and_the_color_of_a_group_change() {
    let mut canvas = base();
    canvas
        .change_group(
            "g",
            Some("Neuf".into()),
            Some(ColorChoice::parse("ardoise").unwrap()),
        )
        .unwrap();
    let group = canvas.card("g").unwrap();
    assert!(matches!(&group.kind, CardKind::Group { label: Some(l), .. } if l == "Neuf"));
    assert_eq!(group.color.as_deref(), Some("#64748b"));
    canvas.change_group("g", Some(String::new()), None).unwrap();
    assert!(matches!(
        &canvas.card("g").unwrap().kind,
        CardKind::Group { label: None, .. }
    ));
    assert_eq!(canvas.card("g").unwrap().color.as_deref(), Some("#64748b"));
    canvas
        .change_group("g", None, Some(ColorChoice::Without))
        .unwrap();
    assert_eq!(canvas.card("g").unwrap().color, None);
}

#[test]
fn a_change_of_a_group_that_is_refused_changes_nothing() {
    let mut canvas = base();
    let before = canvas.clone();
    assert!(said(canvas.change_group("a", Some("x".into()), None)).contains("n'est pas un groupe"));
    assert!(said(canvas.change_group("zz", Some("x".into()), None)).contains("n'existe pas"));
    assert!(said(canvas.change_group("g", None, None)).contains("rien à changer"));
    assert_eq!(canvas, before);
}

#[test]
fn the_unknown_properties_and_the_tags_survive_every_gesture() {
    let mut canvas = base();
    canvas.add_card(text_card(0, 0)).unwrap();
    canvas.move_card("a", 3, 3).unwrap();
    canvas.remove_card("d").unwrap();
    let written = canvas.to_text();
    assert!(written.contains(r#""inconnu":7"#));
    assert!(written.contains(r#""tags":["x"]"#));
    assert_eq!(Canvas::parse(&written).unwrap().cards.len(), 5);
}
