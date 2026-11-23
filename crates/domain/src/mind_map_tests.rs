use super::*;

const EXAMPLE: &str = "---
type: carte-mentale
tags: [projet, 2027]
racines: [{x: 0, y: 0}, {x: 40.5, y: 320}]
---
# Lancement du produit

- Clients <!-- couleur: bleu -->
  - Artisans
    > Premiers essais en janvier.
    >
    > - appeler **Martin**
    > - envoyer la plaquette
    - Plombiers
    - Électriciens <!-- couleur: vert -->
  - [[Grands comptes]]
- Calendrier <!-- couleur: orange -->
  - Bêta *fermée*
  - Lancement public
";

fn titles(nodes: &[MindNode]) -> Vec<&str> {
    nodes.iter().map(|n| n.title.as_str()).collect()
}

#[test]
fn the_example_is_read_as_its_tree() {
    let map = MindMap::parse(EXAMPLE);
    assert_eq!(titles(&map.roots), ["Clients", "Calendrier"]);
    assert_eq!(map.roots[0].color.as_deref(), Some("bleu"));
    let artisans = &map.roots[0].children[0];
    assert_eq!(titles(&artisans.children), ["Plombiers", "Électriciens"]);
    assert_eq!(
        artisans.detail,
        [
            "Premiers essais en janvier.",
            "",
            "- appeler **Martin**",
            "- envoyer la plaquette"
        ]
    );
    assert_eq!(map.roots[0].children[1].title, "[[Grands comptes]]");
    assert_eq!(artisans.children[1].color.as_deref(), Some("vert"));
    assert_eq!(map.roots[0].descendants_count(), 4);
}

#[test]
fn a_file_that_follows_the_application_writing_is_saved_byte_for_byte() {
    let map = MindMap::parse(EXAMPLE);
    assert_eq!(map.written_on(EXAMPLE), EXAMPLE);
}

#[test]
fn places_are_read_with_defaults() {
    let places = |racines: &str| {
        let text = format!("---\ntype: carte-mentale\n{racines}\n---\n# T\n\n- A\n- B\n- C\n");
        MindMap::parse(&text)
            .places
            .iter()
            .map(|p| (p.x, p.y))
            .collect::<Vec<_>>()
    };
    let defaults = vec![(0.0, 0.0), (0.0, 160.0), (0.0, 320.0)];
    assert_eq!(places(""), defaults);
    assert_eq!(places("racines: []"), defaults);
    assert_eq!(places("racines: 12"), defaults);
    assert_eq!(
        places("racines: [{x: 5, y: 6}, 3, {x: a}]"),
        [(5.0, 6.0), (0.0, 160.0), (0.0, 320.0)]
    );
    assert_eq!(
        places("racines: [{y: 7}, {x: 1}, {x: 2, y: 3}, {x: 9, y: 9}]"),
        [(0.0, 7.0), (1.0, 160.0), (2.0, 3.0)]
    );
    assert_eq!(places("racines: [{x: 1, y: 2}]")[1], (0.0, 160.0));
}

#[test]
fn depth_comes_from_the_indentation_compared_between_bullets() {
    let map = MindMap::parse("# T\n\n- A\n    - B\n  - C\n\t- D\n* E\n+ F\n   - G\n");
    assert_eq!(titles(&map.roots), ["A", "E", "F"]);
    assert_eq!(titles(&map.roots[0].children), ["B", "C"]);
    assert_eq!(titles(&map.roots[0].children[1].children), ["D"]);
    assert_eq!(titles(&map.roots[2].children), ["G"]);
    let shallower = MindMap::parse("# T\n\n  - A\n- B\n    - C\n  - D\n");
    assert_eq!(titles(&shallower.roots), ["A", "B"]);
    assert_eq!(titles(&shallower.roots[1].children), ["C", "D"]);
}

#[test]
fn lines_out_of_format_are_ignored_and_vanish_on_saving() {
    let text = "---\ntype: carte-mentale\n---\n# T\n\nUn paragraphe\n\n- A\n\n  du texte\n  > détail\n## Autre titre\n- \n- B\n\n```\ncode\n```\n> orphelin\n";
    let map = MindMap::parse(text);
    assert_eq!(titles(&map.roots), ["A", "B"]);
    assert_eq!(map.roots[0].detail, ["détail"]);
    assert_eq!(
        map.written_on(text),
        "---\ntype: carte-mentale\nracines: [{x: 0, y: 0}, {x: 0, y: 160}]\n---\n# T\n\n- A\n  > détail\n- B\n"
    );
}

#[test]
fn a_color_is_read_leniently_and_unknown_names_mean_no_color() {
    let map = MindMap::parse(
        "# T\n\n- A <!--   COULEUR :  Rouge-->\n- B <!-- couleur: fuchsia -->\n- C <!-- autre: x -->\n",
    );
    assert_eq!(map.roots[0].color.as_deref(), Some("rouge"));
    assert_eq!(map.roots[0].title, "A");
    assert_eq!(map.roots[1].color, None);
    assert_eq!(map.roots[1].title, "B");
    assert_eq!(map.roots[2].title, "C <!-- autre: x -->");
    assert_eq!(palette_name(" Turquoise "), Some("turquoise"));
}

#[test]
fn a_checkbox_or_a_hash_stays_in_the_title() {
    let map = MindMap::parse("# T\n\n- [ ] A faire\n- # B\n");
    assert_eq!(titles(&map.roots), ["[ ] A faire", "# B"]);
}

#[test]
fn saving_keeps_the_other_properties_and_the_title_and_replaces_places() {
    let text =
        "---\nracines: [{x: 1, y: 1}]\npinned: true\ntags:\n  - a\n---\n# Mon titre  \n\n- A\n";
    let mut map = MindMap::parse(text);
    map.places[0] = Place { x: 40.54, y: -3.0 };
    assert_eq!(
        map.written_on(text),
        "---\nracines: [{x: 40.5, y: -3}]\npinned: true\ntags:\n  - a\n---\n# Mon titre  \n\n- A\n"
    );
}

#[test]
fn an_empty_map_keeps_its_header_and_title_only() {
    let text = new_mind_map(" Idées ");
    assert_eq!(text, "---\ntype: carte-mentale\n---\n# Idées\n");
    assert!(is_mind_map(&text));
    let map = MindMap::parse(&text);
    assert!(map.roots.is_empty());
    assert_eq!(map.written_on(&text), text);
}

#[test]
fn a_map_without_title_is_written_without_one() {
    let text = "---\ntype: carte-mentale\n---\n- A\n";
    let map = MindMap::parse(text);
    assert_eq!(
        map.written_on(text),
        "---\ntype: carte-mentale\nracines: [{x: 0, y: 0}]\n---\n- A\n"
    );
}

#[test]
fn only_the_first_type_property_makes_a_mind_map() {
    assert!(!is_mind_map("# T"));
    assert!(!is_mind_map("---\ntype: note\n---\n"));
}

#[test]
fn nodes_are_indexed_with_their_path() {
    let nodes = MindMap::parse(EXAMPLE).indexed_nodes();
    assert_eq!(nodes.len(), 8);
    assert_eq!(nodes[1].path.to_string(), "0.0");
    assert_eq!(
        nodes[1].detail,
        "Premiers essais en janvier.\n\n- appeler **Martin**\n- envoyer la plaquette"
    );
    assert_eq!(nodes[7].path.to_string(), "1.1");
}
