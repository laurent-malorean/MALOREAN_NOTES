use super::*;

/// Trois nœuds racines : A (enfants A1, A2 ; A1 a A1a), B (enfant B1), C ; chacun a sa place.
const MAP: &str = "---
type: carte-mentale
racines: [{x: 0, y: 0}, {x: 10, y: 200}, {x: 20, y: 400}]
---
# Carte

- A <!-- couleur: bleu -->
  - A1
    - A1a
  - A2
- B
  - B1
- C
";

fn map() -> MindMap {
    MindMap::parse(MAP)
}

fn path(text: &str) -> NodePath {
    NodePath::parse(text).unwrap()
}

fn place(x: f64, y: f64) -> Place {
    Place { x, y }
}

/// Chaque nœud avec son chemin, dans l'ordre du fichier : `0 A`, `0.0 A1`…
fn outline(map: &MindMap) -> Vec<String> {
    map.indexed_nodes()
        .iter()
        .map(|node| format!("{} {}", node.path, node.title))
        .collect()
}

fn places(map: &MindMap) -> Vec<(f64, f64)> {
    map.places.iter().map(|p| (p.x, p.y)).collect()
}

fn node(title: &str) -> MindNode {
    new_node(title, "").unwrap()
}

#[test]
fn a_node_path_is_read_from_its_ranks() {
    assert_eq!(path("0"), NodePath(vec![0]));
    assert_eq!(path(" 1.0.12 "), NodePath(vec![1, 0, 12]));
    assert_eq!(path("1.0.2").to_string(), "1.0.2");
}

#[test]
fn a_text_that_is_not_a_path_is_refused_with_how_to_write_one() {
    for text in [
        "", ".", "1.", ".1", "a", "1..2", "-1", "1.+2", "1 .2", "0x1", "１",
    ] {
        let error = NodePath::parse(text).unwrap_err();
        assert_eq!(error, RefusedMindMapEdit::InvalidPath(text.to_owned()));
    }
    let said = NodePath::parse("x").unwrap_err().to_string();
    assert!(
        said.starts_with("chemin de nœud invalide : « x »"),
        "{said}"
    );
    assert!(said.contains("`1.0.2`") && said.contains("read_mind_map"));
    assert!(NodePath::parse("99999999999999999999999").is_err());
}

#[test]
fn a_branch_contains_its_own_path_and_its_descendants_only() {
    assert!(path("0").contains(&path("0")));
    assert!(path("0").contains(&path("0.1.2")));
    assert!(!path("0.1").contains(&path("0")));
    assert!(!path("0.1").contains(&path("0.2")));
    assert!(!path("1").contains(&path("0.1")));
}

#[test]
fn a_node_is_found_by_its_path_and_the_nodes_are_counted() {
    let map = map();
    assert_eq!(map.node(&path("0.0.0")).unwrap().title, "A1a");
    assert_eq!(map.node(&path("2")).unwrap().title, "C");
    assert!(map.node(&path("3")).is_none());
    assert!(map.node(&path("0.2")).is_none());
    assert!(map.node(&NodePath(vec![])).is_none());
    assert_eq!(map.nodes_count(), 7);
    assert_eq!(MindMap::default().nodes_count(), 0);
}

#[test]
fn a_new_node_has_a_trimmed_title_and_its_detail_lines() {
    let made = new_node("  Idée  ", "Une ligne\n\n  Retrait\n\n\n").unwrap();
    assert_eq!(made.title, "Idée");
    assert_eq!(made.detail, ["Une ligne", "", "  Retrait"]);
    assert_eq!(made.color, None);
    assert!(made.children.is_empty());
    assert!(new_node("T", "").unwrap().detail.is_empty());
    assert!(new_node("T", " \n ").unwrap().detail.is_empty());
    assert_eq!(new_node("T", "a\r\nb").unwrap().detail, ["a", "b"]);
}

#[test]
fn a_title_must_be_on_one_line_and_not_empty() {
    assert_eq!(new_node("", "x"), Err(RefusedMindMapEdit::EmptyTitle));
    assert_eq!(new_node("  \t", ""), Err(RefusedMindMapEdit::EmptyTitle));
    assert_eq!(
        new_node("a\nb", ""),
        Err(RefusedMindMapEdit::MultilineTitle)
    );
    assert_eq!(
        new_node("a\rb", ""),
        Err(RefusedMindMapEdit::MultilineTitle)
    );
    assert!(
        RefusedMindMapEdit::MultilineTitle
            .to_string()
            .contains("détail (detail)")
    );
    assert!(
        RefusedMindMapEdit::EmptyTitle
            .to_string()
            .contains("ne peut pas être vide")
    );
}

#[test]
fn a_child_is_added_last_under_its_parent() {
    let mut map = map();
    let added = map.add_child(&path("0.0"), node("A1b")).unwrap();
    assert_eq!(added, path("0.0.1"));
    assert_eq!(map.node(&added).unwrap().title, "A1b");
    assert_eq!(map.node(&path("0.0.0")).unwrap().title, "A1a");
    assert_eq!(places(&map).len(), 3);
    let leaf = map.add_child(&path("2"), node("C1")).unwrap();
    assert_eq!(leaf, path("2.0"));
}

#[test]
fn a_child_of_a_missing_node_is_refused_and_nothing_changes() {
    let mut map = map();
    let before = map.clone();
    let error = map.add_child(&path("5"), node("X")).unwrap_err();
    assert_eq!(
        error,
        RefusedMindMapEdit::NoSuchNode {
            path: path("5"),
            nodes: 7
        }
    );
    assert_eq!(map, before);
    let said = error.to_string();
    assert!(
        said.contains("« 5 »") && said.contains("(7 nœuds)"),
        "{said}"
    );
    assert!(said.contains("read_mind_map") && said.contains("rien n'a été changé"));
    let one = RefusedMindMapEdit::NoSuchNode {
        path: path("1"),
        nodes: 1,
    };
    assert!(one.to_string().contains("(1 nœud)"));
}

#[test]
fn a_sibling_is_added_right_below_a_child_node() {
    let mut map = map();
    let added = map.add_sibling(&path("0.0"), node("A1bis")).unwrap();
    assert_eq!(added, path("0.1"));
    assert_eq!(
        outline(&map)[..5],
        ["0 A", "0.0 A1", "0.0.0 A1a", "0.1 A1bis", "0.2 A2"]
    );
    assert_eq!(places(&map).len(), 3);
}

#[test]
fn a_sibling_of_a_root_node_is_a_root_node_inserted_with_its_default_place() {
    let mut map = map();
    let added = map.add_sibling(&path("0"), node("A bis")).unwrap();
    assert_eq!(added, path("1"));
    assert_eq!(outline(&map).iter().filter(|o| !o.contains('.')).count(), 4);
    assert_eq!(map.roots[1].title, "A bis");
    assert_eq!(
        places(&map),
        [(0.0, 0.0), (0.0, 160.0), (10.0, 200.0), (20.0, 400.0)]
    );
}

#[test]
fn a_sibling_of_a_missing_node_is_refused() {
    let mut map = map();
    let before = map.clone();
    assert!(map.add_sibling(&path("0.7"), node("X")).is_err());
    assert!(map.add_sibling(&path("9"), node("X")).is_err());
    assert_eq!(map, before);
}

#[test]
fn a_root_node_is_added_last_at_the_given_place_or_the_default_one() {
    let mut map = map();
    let at = map.add_root(node("D"), Some(place(5.5, 6.0)));
    assert_eq!(at, path("3"));
    let default = map.add_root(node("E"), None);
    assert_eq!(default, path("4"));
    assert_eq!(places(&map)[3..], [(5.5, 6.0), (0.0, 640.0)]);
    let mut empty = MindMap::default();
    assert_eq!(empty.add_root(node("Un"), None), path("0"));
    assert_eq!(places(&empty), [(0.0, 0.0)]);
}

#[test]
fn the_text_of_a_node_changes_without_touching_its_children_or_color() {
    let mut map = map();
    map.change_text(&path("0"), Some("  Alpha "), Some("l1\nl2"))
        .unwrap();
    let alpha = map.node(&path("0")).unwrap();
    assert_eq!(alpha.title, "Alpha");
    assert_eq!(alpha.detail, ["l1", "l2"]);
    assert_eq!(alpha.color.as_deref(), Some("bleu"));
    assert_eq!(alpha.children.len(), 2);
    map.change_text(&path("0"), Some("Beta"), None).unwrap();
    assert_eq!(map.node(&path("0")).unwrap().detail, ["l1", "l2"]);
    map.change_text(&path("0"), None, Some("seul")).unwrap();
    let alpha = map.node(&path("0")).unwrap();
    assert_eq!((alpha.title.as_str(), alpha.detail.len()), ("Beta", 1));
    map.change_text(&path("0"), None, Some("")).unwrap();
    assert!(map.node(&path("0")).unwrap().detail.is_empty());
}

#[test]
fn a_text_change_with_nothing_given_or_a_bad_title_or_a_missing_node_is_refused() {
    let mut map = map();
    let before = map.clone();
    assert_eq!(
        map.change_text(&path("0"), None, None),
        Err(RefusedMindMapEdit::NothingToChange)
    );
    assert_eq!(
        map.change_text(&path("0"), Some(" "), Some("x")),
        Err(RefusedMindMapEdit::EmptyTitle)
    );
    assert_eq!(
        map.change_text(&path("0"), Some("a\nb"), None),
        Err(RefusedMindMapEdit::MultilineTitle)
    );
    assert!(map.change_text(&path("0.5"), Some("x"), None).is_err());
    assert_eq!(map, before);
    let said = RefusedMindMapEdit::NothingToChange.to_string();
    assert!(said.contains("title") && said.contains("detail"), "{said}");
}

#[test]
fn a_color_of_the_palette_is_set_whatever_its_case_and_spaces() {
    let mut map = map();
    map.recolor(&path("1.0"), " Turquoise ").unwrap();
    assert_eq!(
        map.node(&path("1.0")).unwrap().color.as_deref(),
        Some("turquoise")
    );
    for name in PALETTE {
        map.recolor(&path("2"), name).unwrap();
        assert_eq!(map.node(&path("2")).unwrap().color.as_deref(), Some(name));
    }
}

#[test]
fn the_color_none_removes_the_color() {
    let mut map = map();
    map.recolor(&path("0"), "aucune").unwrap();
    assert_eq!(map.node(&path("0")).unwrap().color, None);
    map.recolor(&path("0"), "rose").unwrap();
    map.recolor(&path("0"), " AUCUNE ").unwrap();
    assert_eq!(map.node(&path("0")).unwrap().color, None);
}

#[test]
fn a_color_outside_the_palette_is_refused_with_the_palette() {
    let mut map = map();
    let before = map.clone();
    let error = map.recolor(&path("0"), " #ff0000 ").unwrap_err();
    assert_eq!(error, RefusedMindMapEdit::UnknownColor("#ff0000".into()));
    assert_eq!(
        error.to_string(),
        "couleur inconnue : « #ff0000 » ; les couleurs de la palette sont rouge, orange, jaune, \
         vert, turquoise, bleu, violet, rose, marron, ardoise, et « aucune » retire la couleur ; \
         rien n'a été changé"
    );
    assert!(map.recolor(&path("9"), "rouge").is_err());
    assert!(map.recolor(&path("9"), "pourpre").is_err());
    assert_eq!(map, before);
}

#[test]
fn a_child_branch_is_removed_with_its_descendants_and_counted() {
    let mut map = map();
    assert_eq!(map.remove(&path("0.0")).unwrap(), 2);
    assert_eq!(outline(&map), ["0 A", "0.0 A2", "1 B", "1.0 B1", "2 C"]);
    assert_eq!(places(&map).len(), 3);
}

#[test]
fn a_root_branch_is_removed_with_its_place() {
    let mut map = map();
    assert_eq!(map.remove(&path("0")).unwrap(), 4);
    assert_eq!(outline(&map), ["0 B", "0.0 B1", "1 C"]);
    assert_eq!(places(&map), [(10.0, 200.0), (20.0, 400.0)]);
    assert_eq!(map.remove(&path("1")).unwrap(), 1);
    assert_eq!(places(&map), [(10.0, 200.0)]);
}

#[test]
fn removing_a_missing_node_is_refused() {
    let mut map = map();
    let before = map.clone();
    assert!(map.remove(&path("0.9")).is_err());
    assert!(map.remove(&path("3")).is_err());
    assert_eq!(map, before);
}

#[test]
fn a_branch_dropped_on_the_middle_of_a_node_becomes_its_last_child() {
    let mut map = map();
    let moved = map
        .move_branch(&path("1"), NodeDrop::Child(path("0")))
        .unwrap();
    assert_eq!(moved, path("0.2"));
    assert_eq!(
        outline(&map),
        [
            "0 A",
            "0.0 A1",
            "0.0.0 A1a",
            "0.1 A2",
            "0.2 B",
            "0.2.0 B1",
            "1 C"
        ]
    );
    assert_eq!(places(&map), [(0.0, 0.0), (20.0, 400.0)]);
}

#[test]
fn a_target_that_follows_the_moved_node_in_its_family_moves_back_one_rank() {
    let mut map = map();
    // A (0) glisse dans C (2), qui devient 1 une fois A retiré.
    let moved = map
        .move_branch(&path("0"), NodeDrop::Child(path("2")))
        .unwrap();
    assert_eq!(moved, path("1.0"));
    assert_eq!(map.roots[1].title, "C");
    assert_eq!(map.roots[1].children[0].title, "A");
    let mut map = self::map();
    map.move_branch(&path("0.0"), NodeDrop::Child(path("0.1")))
        .unwrap();
    assert_eq!(outline(&map)[..3], ["0 A", "0.0 A2", "0.0.0 A1"]);
}

#[test]
fn a_target_deeper_under_a_following_sibling_moves_back_too() {
    let mut map = map();
    // A1 (0.0) glisse dans B1 (1.0) : les nœuds sous un autre parent ne bougent pas.
    let moved = map
        .move_branch(&path("0.0"), NodeDrop::Child(path("1.0")))
        .unwrap();
    assert_eq!(moved, path("1.0.0"));
    assert_eq!(map.roots[1].children[0].children[0].title, "A1");
    let mut map = self::map();
    // A (0) glisse dans B1 (1.0) : B devient 0, la cible 0.0.
    let moved = map
        .move_branch(&path("0"), NodeDrop::Child(path("1.0")))
        .unwrap();
    assert_eq!(moved, path("0.0.0"));
    let mut map = self::map();
    // B (1) glisse sur A1a (0.0.0) : le chemin de la cible ne change pas.
    map.move_branch(&path("1"), NodeDrop::Child(path("0.0.0")))
        .unwrap();
    assert_eq!(map.roots[0].children[0].children[0].children[0].title, "B");
}

#[test]
fn a_branch_dropped_on_the_top_or_bottom_quarter_becomes_a_sibling_above_or_below() {
    let mut above = map();
    let moved = above
        .move_branch(&path("0.1"), NodeDrop::Before(path("0.0")))
        .unwrap();
    assert_eq!(moved, path("0.0"));
    assert_eq!(
        outline(&above)[..4],
        ["0 A", "0.0 A2", "0.1 A1", "0.1.0 A1a"]
    );
    let mut below = map();
    let moved = below
        .move_branch(&path("0.0"), NodeDrop::After(path("0.1")))
        .unwrap();
    assert_eq!(moved, path("0.1"));
    assert_eq!(
        outline(&below)[..4],
        ["0 A", "0.0 A2", "0.1 A1", "0.1.0 A1a"]
    );
    let mut other = map();
    let moved = other
        .move_branch(&path("0.1"), NodeDrop::After(path("1.0")))
        .unwrap();
    assert_eq!(moved, path("1.1"));
    let mut before_first = map();
    let moved = before_first
        .move_branch(&path("1.0"), NodeDrop::Before(path("0.0")))
        .unwrap();
    assert_eq!(moved, path("0.0"));
}

#[test]
fn a_root_node_dropped_beside_another_root_node_keeps_its_place() {
    let mut map = map();
    let moved = map
        .move_branch(&path("0"), NodeDrop::After(path("2")))
        .unwrap();
    assert_eq!(moved, path("2"));
    assert_eq!(
        map.roots
            .iter()
            .map(|r| r.title.as_str())
            .collect::<Vec<_>>(),
        ["B", "C", "A"]
    );
    assert_eq!(places(&map), [(10.0, 200.0), (20.0, 400.0), (0.0, 0.0)]);
    let mut map = self::map();
    map.move_branch(&path("2"), NodeDrop::Before(path("0")))
        .unwrap();
    assert_eq!(places(&map), [(20.0, 400.0), (0.0, 0.0), (10.0, 200.0)]);
}

#[test]
fn a_child_dropped_beside_a_root_node_becomes_a_root_node_with_the_default_place() {
    let mut map = map();
    let moved = map
        .move_branch(&path("0.1"), NodeDrop::After(path("1")))
        .unwrap();
    assert_eq!(moved, path("2"));
    assert_eq!(map.roots[2].title, "A2");
    assert_eq!(
        places(&map),
        [(0.0, 0.0), (10.0, 200.0), (0.0, 320.0), (20.0, 400.0)]
    );
}

#[test]
fn a_root_node_dropped_as_a_child_loses_its_place() {
    let mut map = map();
    map.move_branch(&path("1"), NodeDrop::Child(path("2")))
        .unwrap();
    assert_eq!(places(&map), [(0.0, 0.0), (20.0, 400.0)]);
}

#[test]
fn a_child_dropped_on_the_background_becomes_a_root_node_where_it_is_dropped() {
    let mut map = map();
    let moved = map
        .move_branch(&path("0.0"), NodeDrop::Root(Some(place(7.0, 8.0))))
        .unwrap();
    assert_eq!(moved, path("3"));
    assert_eq!(map.roots[3].title, "A1");
    assert_eq!(map.roots[3].children[0].title, "A1a");
    assert_eq!(places(&map)[3], (7.0, 8.0));
    let mut map = self::map();
    map.move_branch(&path("1.0"), NodeDrop::Root(None)).unwrap();
    assert_eq!(places(&map)[3], (0.0, 480.0));
}

#[test]
fn a_root_node_dropped_on_the_background_is_only_moved_on_the_map() {
    let mut map = map();
    let moved = map
        .move_branch(&path("1"), NodeDrop::Root(Some(place(1.0, 2.0))))
        .unwrap();
    assert_eq!(moved, path("1"));
    assert_eq!(places(&map), [(0.0, 0.0), (1.0, 2.0), (20.0, 400.0)]);
    assert_eq!(outline(&map).len(), 7);
}

#[test]
fn a_root_node_dropped_on_the_background_without_a_place_is_refused() {
    let mut map = map();
    let before = map.clone();
    assert_eq!(
        map.move_branch(&path("1"), NodeDrop::Root(None)),
        Err(RefusedMindMapEdit::RootNeedsPlace)
    );
    assert_eq!(map, before);
    let said = RefusedMindMapEdit::RootNeedsPlace.to_string();
    assert!(
        said.contains("place_x") && said.contains("place_y"),
        "{said}"
    );
}

#[test]
fn a_drop_on_itself_or_in_its_own_branch_is_refused_and_nothing_changes() {
    let mut map = map();
    let before = map.clone();
    for drop in [
        NodeDrop::Child(path("0")),
        NodeDrop::Before(path("0")),
        NodeDrop::After(path("0")),
        NodeDrop::Child(path("0.0")),
        NodeDrop::After(path("0.0.0")),
    ] {
        assert_eq!(
            map.move_branch(&path("0"), drop),
            Err(RefusedMindMapEdit::IntoOwnBranch)
        );
    }
    assert_eq!(map, before);
    assert!(
        RefusedMindMapEdit::IntoOwnBranch
            .to_string()
            .contains("sa propre branche")
    );
}

#[test]
fn a_missing_node_or_target_is_refused_and_nothing_changes() {
    let mut map = map();
    let before = map.clone();
    assert!(
        map.move_branch(&path("7"), NodeDrop::Child(path("0")))
            .is_err()
    );
    assert!(
        map.move_branch(&path("0"), NodeDrop::Child(path("7")))
            .is_err()
    );
    assert!(
        map.move_branch(&path("0"), NodeDrop::Before(path("1.4")))
            .is_err()
    );
    assert!(map.move_branch(&path("0.4"), NodeDrop::Root(None)).is_err());
    assert_eq!(map, before);
}

#[test]
fn an_edited_map_is_written_in_the_format_of_the_application() {
    let mut map = map();
    map.add_child(&path("2"), new_node("C1", "détail\n\nsuite").unwrap())
        .unwrap();
    map.recolor(&path("2.0"), "vert").unwrap();
    assert_eq!(
        map.written_on(MAP),
        "---
type: carte-mentale
racines: [{x: 0, y: 0}, {x: 10, y: 200}, {x: 20, y: 400}]
---
# Carte

- A <!-- couleur: bleu -->
  - A1
    - A1a
  - A2
- B
  - B1
- C
  - C1 <!-- couleur: vert -->
    > détail
    >
    > suite
"
    );
}
