use super::*;

const MAP: &str = "---
type: carte-mentale
racines: [{x: 0, y: 0}, {x: 40.5, y: 320}]
---
# Carte

- Clients <!-- couleur: bleu -->
  - Artisans
    > Premiers essais.
    >
    > - appeler
    - Plombiers
- Calendrier
";

fn path(ranks: &[usize]) -> NodePath {
    NodePath(ranks.to_vec())
}

#[test]
fn a_map_is_read_as_a_tree_with_paths_titles_and_colors() {
    let read = MindMap::parse(MAP).readable();
    assert!(!read.truncated());
    assert_eq!((read.shown, read.total), (4, 4));
    assert_eq!(read.last, Some(path(&[1])));
    let clients = &read.roots[0];
    assert_eq!(clients.path, path(&[0]));
    assert_eq!(clients.title, "Clients");
    assert_eq!(clients.color.as_deref(), Some("bleu"));
    assert_eq!(read.roots[1].title, "Calendrier");
    assert_eq!(read.roots[1].color, None);
}

#[test]
fn the_children_of_a_node_carry_their_own_paths() {
    let read = MindMap::parse(MAP).readable();
    let artisans = &read.roots[0].children[0];
    assert_eq!(artisans.path, path(&[0, 0]));
    assert_eq!(artisans.children[0].path, path(&[0, 0, 0]));
}

#[test]
fn the_detail_is_joined_by_line_breaks_and_only_root_nodes_have_a_place() {
    let read = MindMap::parse(MAP).readable();
    let clients = &read.roots[0];
    assert_eq!(clients.detail, "");
    assert_eq!(clients.place, Some(Place { x: 0.0, y: 0.0 }));
    let artisans = &clients.children[0];
    assert_eq!(artisans.detail, "Premiers essais.\n\n- appeler");
    assert_eq!(artisans.place, None);
    assert_eq!(read.roots[1].place, Some(Place { x: 40.5, y: 320.0 }));
}

#[test]
fn an_empty_map_reads_as_no_node() {
    let read = MindMap::default().readable();
    assert!(read.roots.is_empty());
    assert_eq!((read.shown, read.total), (0, 0));
    assert_eq!(read.last, None);
    assert!(!read.truncated());
}

fn long_map(roots: usize, title: &str) -> MindMap {
    let list: String = (0..roots)
        .map(|rank| format!("- {title}{rank:04}\n"))
        .collect();
    MindMap::parse(&format!("---\ntype: carte-mentale\n---\n# T\n\n{list}"))
}

#[test]
fn a_map_that_fits_the_limit_exactly_is_given_whole() {
    // Chaque nœud coûte son titre (6 lettres et 4 chiffres : 10 caractères) plus la structure.
    let per_node = 10 + NODE_STRUCTURE;
    let fitting = MAX_READ_MAP_CHARACTERS / per_node;
    assert_eq!(
        MAX_READ_MAP_CHARACTERS % per_node,
        0,
        "limite multiple du coût"
    );
    let map = long_map(fitting, "abcdef");
    let read = map.readable();
    assert!(!read.truncated());
    assert_eq!(read.shown, fitting);
}

#[test]
fn a_map_over_the_limit_is_cut_in_file_order_and_says_where() {
    let per_node = 10 + NODE_STRUCTURE;
    let fitting = MAX_READ_MAP_CHARACTERS / per_node;
    let map = long_map(fitting + 1, "abcdef");
    let read = map.readable();
    assert!(read.truncated());
    assert_eq!((read.shown, read.total), (fitting, fitting + 1));
    assert_eq!(read.roots.len(), fitting);
    assert_eq!(read.last, Some(path(&[fitting - 1])));
}

#[test]
fn the_cut_stops_inside_a_branch_and_drops_everything_after_it() {
    let mut list = String::from("- Racine\n");
    for rank in 0..2000 {
        list.push_str(&format!("  - {rank:0>30}\n"));
    }
    list.push_str("- Autre\n");
    let map = MindMap::parse(&format!("---\ntype: carte-mentale\n---\n# T\n\n{list}"));
    let read = map.readable();
    assert!(read.truncated());
    assert_eq!(read.roots.len(), 1, "la racine suivante n'est pas donnée");
    let shown_children = read.roots[0].children.len();
    assert!(shown_children > 100 && shown_children < 2000);
    assert_eq!(read.shown, shown_children + 1);
    assert_eq!(read.last, Some(path(&[0, shown_children - 1])));
    assert_eq!(read.total, 2002);
}

#[test]
fn details_and_characters_are_counted_not_bytes() {
    // 2 000 lignes de détail de 30 « é » : 2 caractères par octet, mais 31 par ligne comptée.
    let detail: String = (0..2000)
        .map(|_| format!("    > {}\n", "é".repeat(30)))
        .collect();
    let map = MindMap::parse(&format!(
        "---\ntype: carte-mentale\n---\n# T\n\n- Gros\n{detail}- Petit\n"
    ));
    let read = map.readable();
    assert_eq!(
        read.shown, 1,
        "le premier nœud est donné même s'il dépasse la limite"
    );
    assert_eq!(read.roots[0].detail.lines().count(), 2000);
    assert!(read.truncated());
    assert_eq!(read.last, Some(path(&[0])));
}

#[test]
fn a_node_that_does_not_fit_the_rest_is_left_out_with_the_following_ones() {
    // Le premier nœud prend presque tout ; le second, trop gros pour le reste, n'est pas donné ;
    // le troisième, petit, ne l'est pas non plus (l'ordre du fichier est gardé).
    let big = "x".repeat(MAX_READ_MAP_CHARACTERS - 2 * NODE_STRUCTURE - 100);
    let medium = "y".repeat(200);
    let map = MindMap::parse(&format!(
        "---\ntype: carte-mentale\n---\n# T\n\n- {big}\n- {medium}\n- petit\n"
    ));
    let read = map.readable();
    assert_eq!((read.shown, read.total), (1, 3));
    assert_eq!(read.last, Some(path(&[0])));
}
