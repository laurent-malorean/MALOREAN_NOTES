use super::*;

const TEXT: &str = r##"{
	"nodes":[
		{"id":"g","type":"group","backgroundStyle":"repeat","x":-40,"y":-60,"width":780,"height":400,"color":"4","label":"Phase 1","background":"img/a.png"},
		{"id":"t","type":"text","text":"# Titre","x":0,"y":0,"width":260,"height":120,"color":"#2563EB","plugin":[1,2]},
		{"id":"f","type":"file","file":"Notes/Projet.md","subpath":"#Objectifs","x":300,"y":0,"width":400,"height":300,"color":"#FF5733"},
		{"id":"l","type":"link","url":"https://jsoncanvas.org","x":0,"y":400,"width":400,"height":300}
	],
	"edges":[
		{"id":"e","fromNode":"t","fromSide":"right","toNode":"f","toSide":"left","fromEnd":"arrow","toEnd":"none","color":"2","label":"détaille","w":1}
	],
	"version":2
}"##;

fn item() -> CanvasItem {
    Canvas::parse(TEXT).unwrap().into()
}

#[test]
fn a_canvas_goes_to_the_screen_and_comes_back_unchanged() {
    let back = Canvas::try_from(item()).unwrap();
    assert_eq!(back.to_text(), TEXT);
}

#[test]
fn the_screen_sees_the_palette_color_of_each_written_color() {
    let item = item();
    assert_eq!(item.cards[0].palette.as_deref(), Some("vert"));
    assert_eq!(item.cards[1].palette.as_deref(), Some("bleu"));
    assert_eq!(item.cards[2].palette, None);
    assert_eq!(item.cards[2].color.as_deref(), Some("#FF5733"));
    assert_eq!(item.arrows[0].palette.as_deref(), Some("orange"));
    assert_eq!(item.cards[0].kind, "group");
    assert_eq!(item.cards[0].background_style.as_deref(), Some("repeat"));
    assert_eq!(item.extra[0].json, "2");
    assert_eq!(item.cards[1].extra[0].json, "[1,2]");
}

#[test]
fn choosing_a_color_writes_the_preset_or_the_hexadecimal_and_removing_it_writes_nothing() {
    let mut item = item();
    item.cards[1].palette = Some("rouge".into());
    item.cards[2].palette = Some("rose".into());
    item.cards[0].color = None;
    item.cards[0].palette = None;
    item.arrows[0].palette = None;
    item.arrows[0].color = None;
    let back = Canvas::try_from(item).unwrap();
    assert_eq!(back.cards[1].color.as_deref(), Some("1"));
    assert_eq!(back.cards[2].color.as_deref(), Some("#ec6aa8"));
    assert_eq!(back.cards[0].color, None);
    assert_eq!(back.arrows[0].color, None);
}

#[test]
fn an_arrow_without_sides_is_shown_with_the_deduced_ones() {
    let canvas = Canvas::parse(
        r#"{"nodes":[{"id":"a","type":"text","text":"","x":0,"y":0,"width":1,"height":1},{"id":"b","type":"text","text":"","x":9,"y":0,"width":1,"height":1}],"edges":[{"id":"e","fromNode":"a","toNode":"b"}]}"#,
    )
    .unwrap();
    let item: CanvasItem = canvas.with_deduced_sides().into();
    assert_eq!(item.arrows[0].from_side, "right");
    assert_eq!(item.arrows[0].to_side, "left");
    let bare: CanvasArrowItem = Canvas::parse(
        r#"{"nodes":[{"id":"a","type":"text","text":"","x":0,"y":0,"width":1,"height":1}],"edges":[{"id":"e","fromNode":"a","toNode":"a"}]}"#,
    )
    .unwrap()
    .arrows
    .remove(0)
    .into();
    assert_eq!(bare.from_side, "right");
}

#[test]
fn positions_are_rounded_to_whole_numbers() {
    let mut item = item();
    item.cards[1].x = 10.4;
    item.cards[1].y = -10.6;
    let back = Canvas::try_from(item).unwrap();
    assert_eq!((back.cards[1].x, back.cards[1].y), (10, -11));
}

type Change = fn(&mut CanvasItem);

#[test]
fn a_card_or_arrow_the_file_cannot_hold_is_refused() {
    let cases: [(Change, &str); 8] = [
        (
            |i| i.cards[0].kind = "star".into(),
            "type de carte « star »",
        ),
        (|i| i.cards[1].text = None, "n'a pas de « text »"),
        (|i| i.cards[2].file = None, "n'a pas de « file »"),
        (|i| i.cards[3].url = None, "n'a pas de « url »"),
        (
            |i| i.cards[0].background_style = Some("tile".into()),
            "« tile »",
        ),
        (|i| i.cards[1].extra[0].json = "{".into(), "caractère"),
        (
            |i| i.arrows[0].from_side = "middle".into(),
            "côté « middle »",
        ),
        (|i| i.arrows[0].to_end = "dot".into(), "extrémité « dot »"),
    ];
    for (change, reason) in cases {
        let mut item = item();
        change(&mut item);
        let refused = Canvas::try_from(item).unwrap_err().to_string();
        assert!(refused.contains(reason), "{reason}");
    }
}

#[test]
fn the_three_background_styles_are_accepted() {
    for style in ["cover", "ratio", "repeat"] {
        let mut accepted = item();
        accepted.cards[0].background_style = Some(style.into());
        let back = Canvas::try_from(accepted).unwrap();
        assert!(
            back.to_text()
                .contains(&format!("\"backgroundStyle\":\"{style}\""))
        );
    }
}
