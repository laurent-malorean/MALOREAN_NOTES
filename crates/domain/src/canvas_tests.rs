use super::*;

/// Le fichier de la spécification (§ 4 et 7.1) : un groupe, une carte texte, un fichier avec ancre, un lien web, une flèche.
const SPEC_EXAMPLE: &str = r##"{
	"nodes":[
		{"id":"d0a6f3b8e7c91524","type":"group","x":-40,"y":-60,"width":780,"height":400,"color":"4","label":"Phase 1"},
		{"id":"a3f9c2d41b7e8056","type":"text","text":"# Titre\n\nUn paragraphe avec un [[lien interne]].","x":0,"y":0,"width":260,"height":120},
		{"id":"b81e04c9d2f35a67","type":"file","file":"Notes/Projet.md","subpath":"#Objectifs","x":300,"y":0,"width":400,"height":300},
		{"id":"c5d7e1a09f284b36","type":"link","url":"https://jsoncanvas.org","x":0,"y":400,"width":400,"height":300,"color":"#FF5733"}
	],
	"edges":[
		{"id":"e94b7a2c6d1f8035","fromNode":"a3f9c2d41b7e8056","fromSide":"right","toNode":"b81e04c9d2f35a67","toSide":"left","label":"détaille"}
	]
}"##;

fn rewritten(text: &str) -> String {
    Canvas::parse(text).unwrap().to_text()
}

fn error(text: &str) -> String {
    Canvas::parse(text).unwrap_err().to_string()
}

#[test]
fn the_example_of_the_specification_is_read_and_written_back_identically() {
    let canvas = Canvas::parse(SPEC_EXAMPLE).unwrap();
    assert_eq!(canvas.cards.len(), 4);
    assert_eq!(canvas.cards[0].color.as_deref(), Some("4"));
    assert_eq!(canvas.cards[0].x, -40);
    assert_eq!(
        canvas.cards[2].kind,
        CardKind::File {
            file: "Notes/Projet.md".into(),
            subpath: Some("#Objectifs".into())
        }
    );
    assert_eq!(canvas.arrows[0].label.as_deref(), Some("détaille"));
    assert_eq!(canvas.to_text(), SPEC_EXAMPLE);
}

#[test]
fn an_empty_canvas_is_written_with_both_lists_and_no_final_newline() {
    assert_eq!(rewritten("{}"), "{\n\t\"nodes\":[],\n\t\"edges\":[]\n}");
    assert_eq!(
        Canvas::default().to_text(),
        "{\n\t\"nodes\":[],\n\t\"edges\":[]\n}"
    );
}

#[test]
fn fields_come_back_in_the_order_obsidian_writes_them() {
    let text = r##"{"nodes":[
{"label":"G","height":4,"width":3,"y":2,"x":1,"color":"2","type":"group","background":"img/a.png","backgroundStyle":"ratio","id":"g"},
{"color":"1","height":4,"width":3,"y":2,"x":1,"subpath":"#^bloc","file":"n.md","type":"file","id":"f"},
{"color":"1","height":4,"width":3,"y":2,"x":1,"text":"t","type":"text","id":"t"},
{"color":"1","height":4,"width":3,"y":2,"x":1,"url":"https://a.b","type":"link","id":"l"}
],"edges":[
{"label":"l","color":"3","toEnd":"none","fromEnd":"arrow","toSide":"left","toNode":"t","fromSide":"right","fromNode":"f","id":"e"}
]}"##;
    assert_eq!(
        rewritten(text),
        "{\n\t\"nodes\":[\n\
\t\t{\"id\":\"g\",\"type\":\"group\",\"backgroundStyle\":\"ratio\",\"x\":1,\"y\":2,\"width\":3,\"height\":4,\"color\":\"2\",\"label\":\"G\",\"background\":\"img/a.png\"},\n\
\t\t{\"id\":\"f\",\"type\":\"file\",\"file\":\"n.md\",\"subpath\":\"#^bloc\",\"x\":1,\"y\":2,\"width\":3,\"height\":4,\"color\":\"1\"},\n\
\t\t{\"id\":\"t\",\"type\":\"text\",\"text\":\"t\",\"x\":1,\"y\":2,\"width\":3,\"height\":4,\"color\":\"1\"},\n\
\t\t{\"id\":\"l\",\"type\":\"link\",\"url\":\"https://a.b\",\"x\":1,\"y\":2,\"width\":3,\"height\":4,\"color\":\"1\"}\n\
\t],\n\t\"edges\":[\n\
\t\t{\"id\":\"e\",\"fromNode\":\"f\",\"fromSide\":\"right\",\"toNode\":\"t\",\"toSide\":\"left\",\"fromEnd\":\"arrow\",\"toEnd\":\"none\",\"color\":\"3\",\"label\":\"l\"}\n\
\t]\n}"
    );
}

#[test]
fn arrow_ends_follow_the_table_of_the_specification() {
    let two = r#"{"id":"a","type":"text","text":"","x":0,"y":0,"width":1,"height":1},{"id":"b","type":"text","text":"","x":9,"y":0,"width":1,"height":1}"#;
    let edge = |ends: &str| {
        let text = format!(
            r#"{{"nodes":[{two}],"edges":[{{"id":"e","fromNode":"a","fromSide":"right","toNode":"b","toSide":"left"{ends}}}]}}"#
        );
        let written = rewritten(&text);
        let line = written.lines().nth(6).unwrap().to_owned();
        line.trim_start_matches('\t')
            .trim_end_matches(['}', ','])
            .strip_prefix(
                r#"{"id":"e","fromNode":"a","fromSide":"right","toNode":"b","toSide":"left""#,
            )
            .unwrap()
            .to_owned()
    };
    assert_eq!(edge(""), "");
    assert_eq!(edge(r#","toEnd":"arrow""#), "");
    assert_eq!(edge(r#","fromEnd":"none""#), "");
    assert_eq!(edge(r#","toEnd":"none""#), r#","toEnd":"none""#);
    assert_eq!(
        edge(r#","fromEnd":"arrow","toEnd":"arrow""#),
        r#","fromEnd":"arrow""#
    );
    assert_eq!(
        edge(r#","fromEnd":"none","toEnd":"none""#),
        r#","toEnd":"none""#
    );
    assert_eq!(
        edge(r#","fromEnd":"arrow","toEnd":"none""#),
        r#","fromEnd":"arrow","toEnd":"none""#
    );
}

#[test]
fn missing_sides_are_deduced_and_written() {
    let text = r#"{"nodes":[{"id":"a","type":"text","text":"","x":0,"y":0,"width":10,"height":10},{"id":"b","type":"text","text":"","x":100,"y":0,"width":10,"height":10}],"edges":[{"id":"e","fromNode":"a","toNode":"b"}]}"#;
    let canvas = Canvas::parse(text).unwrap();
    assert_eq!(canvas.arrows[0].from_side, None);
    let sided = canvas.clone().with_deduced_sides();
    assert_eq!(sided.arrows[0].from_side, Some(Side::Right));
    assert_eq!(sided.arrows[0].to_side, Some(Side::Left));
    assert!(
        canvas.to_text().contains(
            r#"{"id":"e","fromNode":"a","fromSide":"right","toNode":"b","toSide":"left"}"#
        )
    );
}

#[test]
fn sides_given_by_the_file_are_never_replaced_by_the_deduced_ones() {
    let text = r#"{"nodes":[{"id":"a","type":"text","text":"","x":0,"y":0,"width":10,"height":10},{"id":"b","type":"text","text":"","x":100,"y":0,"width":10,"height":10}],"edges":[{"id":"e","fromNode":"a","fromSide":"top","toNode":"b","toSide":"bottom"}]}"#;
    let canvas = Canvas::parse(text).unwrap().with_deduced_sides();
    assert_eq!(canvas.arrows[0].from_side, Some(Side::Top));
    assert_eq!(canvas.arrows[0].to_side, Some(Side::Bottom));
}

#[test]
fn sides_are_deduced_from_the_gap_between_the_centers() {
    let rect = |x, y| Rect {
        x,
        y,
        width: 10,
        height: 10,
    };
    let from = rect(0, 0);
    assert_eq!(deduce_sides(from, rect(50, 0)), (Side::Right, Side::Left));
    assert_eq!(deduce_sides(from, rect(-50, 0)), (Side::Left, Side::Right));
    assert_eq!(deduce_sides(from, rect(0, 50)), (Side::Bottom, Side::Top));
    assert_eq!(deduce_sides(from, rect(0, -50)), (Side::Top, Side::Bottom));
    assert_eq!(deduce_sides(from, rect(10, 20)), (Side::Bottom, Side::Top));
    assert_eq!(deduce_sides(from, rect(20, 10)), (Side::Right, Side::Left));
    assert_eq!(deduce_sides(from, rect(20, 20)), (Side::Right, Side::Left));
    assert_eq!(deduce_sides(from, from), (Side::Right, Side::Left));
}

#[test]
fn unknown_properties_are_kept_wherever_they_are() {
    let text = r#"{"version":2,"nodes":[{"id":"a","type":"text","text":"t","x":0,"y":0,"width":1,"height":1,"plugin":{"k":[1,2.50,null]},"url":"x"}],"edges":[{"id":"e","fromNode":"a","fromSide":"top","toNode":"a","toSide":"top","weight":3}],"zoom":1.5}"#;
    let canvas = Canvas::parse(text).unwrap();
    assert_eq!(canvas.extra.len(), 2);
    assert_eq!(
        rewritten(text),
        "{\n\t\"nodes\":[\n\t\t{\"id\":\"a\",\"type\":\"text\",\"text\":\"t\",\"x\":0,\"y\":0,\"width\":1,\"height\":1,\"plugin\":{\"k\":[1,2.50,null]},\"url\":\"x\"}\n\t],\n\t\"edges\":[\n\t\t{\"id\":\"e\",\"fromNode\":\"a\",\"fromSide\":\"top\",\"toNode\":\"a\",\"toSide\":\"top\",\"weight\":3}\n\t],\n\t\"version\":2,\n\t\"zoom\":1.5\n}"
    );
}

#[test]
fn a_color_outside_the_palette_is_kept_as_written() {
    let text = r##"{"nodes":[{"id":"a","type":"text","text":"","x":0,"y":0,"width":1,"height":1,"color":"#aBcDeF"},{"id":"b","type":"text","text":"","x":0,"y":0,"width":1,"height":1,"color":"7"}]}"##;
    let written = rewritten(text);
    assert!(written.contains(r##""color":"#aBcDeF""##));
    assert!(written.contains(r#""color":"7""#));
}

#[test]
fn text_with_accents_and_controls_is_written_like_json_stringify() {
    let text = r#"{"nodes":[{"id":"a","type":"text","text":"é \"q\" \\ \u0007 😀\n","x":0,"y":0,"width":1,"height":1}]}"#;
    assert!(rewritten(text).contains(r#""text":"é \"q\" \\ \u0007 😀\n""#));
}

#[test]
fn an_invalid_file_is_refused_with_the_reason() {
    assert!(error("pas du json").starts_with("ce fichier n'est pas un canvas valide : "));
    let frame = r#""x":0,"y":0,"width":1,"height":1"#;
    let card = |fields: &str| format!(r#"{{"nodes":[{{"id":"a",{fields}}}]}}"#);
    let cases: Vec<(String, &str)> = vec![
        ("[]".into(), "la racine n'est pas un objet"),
        (r#"{"nodes":{}}"#.into(), "« nodes » n'est pas un tableau"),
        (r#"{"edges":1}"#.into(), "« edges » n'est pas un tableau"),
        (r#"{"nodes":[1]}"#.into(), "une carte n'est pas un objet"),
        (r#"{"edges":[1]}"#.into(), "une flèche n'est pas un objet"),
        (
            r#"{"nodes":[{"type":"text"}]}"#.into(),
            "une carte n'a pas de « id »",
        ),
        (
            card(&format!(r#""type":"text",{frame}"#)),
            "n'a pas de « text »",
        ),
        (
            card(&format!(r#""type":"png","text":"",{frame}"#)),
            "type « png » inconnu",
        ),
        (card(r#""type":"text","text":"""#), "n'a pas de « x »"),
        (
            card(&format!(r#""type":"text","text":1,{frame}"#)),
            "« text » n'est pas un texte",
        ),
        (
            card(r#""type":"text","text":"","x":"0","y":0,"width":1,"height":1"#),
            "« x » n'est pas un nombre",
        ),
        (
            card(r#""type":"text","text":"","x":1.5,"y":0,"width":1,"height":1"#),
            "« x » n'est pas un entier",
        ),
        (
            card(&format!(
                r#""type":"file","file":"n.md","subpath":"Titre",{frame}"#
            )),
            "ne commence pas par #",
        ),
        (
            card(&format!(
                r#""type":"group","backgroundStyle":"tile",{frame}"#
            )),
            "style d'arrière-plan « tile » inconnu",
        ),
    ];
    for (text, reason) in cases {
        assert!(error(&text).contains(reason), "{reason}");
    }
}

#[test]
fn identifiers_and_arrow_ends_must_be_valid() {
    let node = |id: &str| {
        format!(r#"{{"id":"{id}","type":"text","text":"","x":0,"y":0,"width":1,"height":1}}"#)
    };
    let with_edge = |edge: &str| format!(r#"{{"nodes":[{}],"edges":[{edge}]}}"#, node("a"));
    let edge = |fields: &str| {
        with_edge(&format!(
            r#"{{"id":"e","fromNode":"a","toNode":"a",{fields}}}"#
        ))
    };
    let cases: Vec<(String, &str)> = vec![
        (
            format!(r#"{{"nodes":[{},{}]}}"#, node("a"), node("a")),
            "l'identifiant « a » est employé deux fois",
        ),
        (
            with_edge(r#"{"id":"a","fromNode":"a","toNode":"a"}"#),
            "employé deux fois",
        ),
        (
            with_edge(r#"{"id":"e","fromNode":"a","toNode":"z"}"#),
            "la flèche « e » désigne la carte « z », qui n'existe pas",
        ),
        (
            with_edge(r#"{"id":"e","fromNode":"z","toNode":"a"}"#),
            "désigne la carte « z »",
        ),
        (edge(r#""fromSide":"middle""#), "côté « middle » inconnu"),
        (edge(r#""toSide":"x""#), "côté « x » inconnu"),
        (edge(r#""toEnd":"dot""#), "extrémité « dot » inconnue"),
        (edge(r#""fromEnd":"dot""#), "extrémité « dot » inconnue"),
        (
            r#"{"edges":[{"id":"e","fromNode":"a"}]}"#.into(),
            "n'a pas de « toNode »",
        ),
    ];
    for (text, reason) in cases {
        assert!(error(&text).contains(reason), "{reason}");
    }
}

#[test]
fn a_group_owns_the_cards_entirely_inside_its_frame() {
    let card = |id: &str, kind: &str, x: i64, y: i64, w: i64, h: i64| {
        format!(
            r#"{{"id":"{id}","type":"{kind}","x":{x},"y":{y},"width":{w},"height":{h}{}}}"#,
            if kind == "text" { r#","text":"""# } else { "" }
        )
    };
    let text = format!(
        r#"{{"nodes":[{},{},{},{},{}]}}"#,
        card("g", "group", 0, 0, 100, 100),
        card("in", "text", 0, 0, 100, 100),
        card("edge", "text", 10, 10, 91, 50),
        card("out", "text", 200, 0, 10, 10),
        card("small", "group", 5, 5, 20, 20),
    );
    let canvas = Canvas::parse(&text).unwrap();
    let ids = |group: &str| -> Vec<&str> {
        canvas
            .members_of(group)
            .iter()
            .map(|c| c.id.as_str())
            .collect()
    };
    assert_eq!(ids("g"), ["in", "small"]);
    assert_eq!(ids("small"), Vec::<&str>::new());
    assert_eq!(ids("in"), Vec::<&str>::new());
    assert_eq!(ids("absent"), Vec::<&str>::new());
}

#[test]
fn a_canvas_is_searched_by_the_texts_it_shows() {
    let text = r##"{"nodes":[
{"id":"g","type":"group","x":0,"y":0,"width":1,"height":1,"label":"Phase 1"},
{"id":"t","type":"text","text":"# Idée\nun texte","x":0,"y":0,"width":1,"height":1},
{"id":"f","type":"file","file":"Notes/Projet.md","x":0,"y":0,"width":1,"height":1},
{"id":"l","type":"link","url":"https://jsoncanvas.org","x":0,"y":0,"width":1,"height":1},
{"id":"n","type":"group","x":0,"y":0,"width":1,"height":1}
],"edges":[{"id":"e","fromNode":"t","toNode":"f","label":"détaille"},{"id":"o","fromNode":"t","toNode":"f"}]}"##;
    assert_eq!(
        searchable_text(text),
        "Phase 1\n# Idée\nun texte\nNotes/Projet.md\nhttps://jsoncanvas.org\ndétaille"
    );
    assert_eq!(indexed_text("plan", "{}"), "plan\n");
    assert_eq!(searchable_text("pas du json"), "");
    assert_eq!(searchable_text("{}"), "");
}

#[test]
fn a_rectangle_contains_another_up_to_its_edges_only() {
    let outer = Rect {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
    };
    let at = |x, y, width, height| Rect {
        x,
        y,
        width,
        height,
    };
    assert!(outer.contains(&at(20, 30, 10, 10)));
    assert!(outer.contains(&at(50, 50, 50, 50)));
    assert!(!outer.contains(&at(51, 50, 50, 50)));
    assert!(!outer.contains(&at(50, 51, 50, 50)));
    let small = Rect {
        x: 2,
        y: 2,
        width: 3,
        height: 3,
    };
    assert!(small.contains(&at(2, 2, 3, 3)));
    assert!(!small.contains(&at(3, 3, 3, 3)));
    assert!(!small.contains(&at(3, 2, 3, 3)));
    assert!(!small.contains(&at(2, 3, 3, 3)));
}

#[test]
fn the_gap_between_centers_counts_widths_and_heights() {
    let from = Rect {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
    };
    let wide = Rect {
        x: 5,
        y: 100,
        width: 100,
        height: 10,
    };
    assert_eq!(deduce_sides(from, wide), (Side::Bottom, Side::Top));
}

#[test]
fn the_source_position_counts_in_the_gap_between_centers() {
    let rect = |x, y| Rect {
        x,
        y,
        width: 10,
        height: 10,
    };
    assert_eq!(
        deduce_sides(rect(100, 100), rect(200, 100)),
        (Side::Right, Side::Left)
    );
    assert_eq!(
        deduce_sides(rect(100, 100), rect(100, 200)),
        (Side::Bottom, Side::Top)
    );
}

fn words(tags: &[&str]) -> Vec<String> {
    tags.iter().map(|tag| (*tag).to_owned()).collect()
}

#[test]
fn the_tags_of_a_canvas_are_the_tags_property_of_the_root() {
    let canvas = Canvas::parse("{\n\t\"nodes\":[],\n\t\"edges\":[],\n\t\"tags\":[\"perso\",\"#idées\",\" \",\"perso\",3,\"loisirs\"]\n}").unwrap();
    assert_eq!(canvas.tags(), ["perso", "idées", "loisirs"]);
    assert!(Canvas::default().tags().is_empty());
    let not_a_list = Canvas::parse(r#"{"nodes":[],"edges":[],"tags":"perso"}"#).unwrap();
    assert!(not_a_list.tags().is_empty());
}

#[test]
fn tagging_a_canvas_writes_the_property_at_the_root_and_keeps_every_other_property() {
    let text = "{\n\t\"nodes\":[],\n\t\"edges\":[],\n\t\"malorean\":{\"vue\":1},\n\t\"tags\":[\"a\"],\n\t\"autre\":true\n}";
    let tagged = Canvas::parse(text)
        .unwrap()
        .with_tags(&words(&["b", "c d"]));
    assert_eq!(
        tagged.to_text(),
        "{\n\t\"nodes\":[],\n\t\"edges\":[],\n\t\"malorean\":{\"vue\":1},\n\t\"tags\":[\"b\",\"c d\"],\n\t\"autre\":true\n}"
    );
}

#[test]
fn a_canvas_without_the_property_gets_it_after_the_others_and_loses_it_without_tags() {
    let plain = "{\n\t\"nodes\":[],\n\t\"edges\":[],\n\t\"malorean\":{}\n}";
    let tagged = Canvas::parse(plain).unwrap().with_tags(&words(&["a"]));
    assert_eq!(
        tagged.to_text(),
        "{\n\t\"nodes\":[],\n\t\"edges\":[],\n\t\"malorean\":{},\n\t\"tags\":[\"a\"]\n}"
    );
    assert_eq!(tagged.with_tags(&[]).to_text(), plain);
    assert_eq!(
        Canvas::parse(plain).unwrap().with_tags(&[]).to_text(),
        plain
    );
}

#[test]
fn a_tags_property_that_is_not_a_list_is_replaced_by_the_list() {
    let canvas = Canvas::parse(r#"{"nodes":[],"edges":[],"tags":"perso"}"#).unwrap();
    assert_eq!(
        canvas.with_tags(&words(&["a"])).to_text(),
        "{\n\t\"nodes\":[],\n\t\"edges\":[],\n\t\"tags\":[\"a\"]\n}"
    );
}
