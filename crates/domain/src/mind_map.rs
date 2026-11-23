//! Carte mentale (spécification `doc/specs/carte-mentale.md`, fiche 0050) : une note dont
//! l'en-tête porte `type: carte-mentale`, faite d'un titre et d'une liste à puces dont chaque
//! puce est un nœud.
//!
//! ```text
//! ---
//! type: carte-mentale
//! racines: [{x: 0, y: 0}, {x: 40.5, y: 320}]
//! ---
//! # Lancement du produit
//!
//! - Clients <!-- couleur: bleu -->
//!   > Premiers essais en janvier.
//!   - Artisans
//! - Calendrier
//! ```
//!
//! Lire une carte donne ses nœuds racines et leur place ; l'écrire ne change que la liste et la
//! propriété `racines`, le reste de l'en-tête et le titre restant identiques.

use std::fmt;

use crate::front_matter::{split, with_key_line};
use crate::segments::Segment;
use crate::{ContentType, Modified, NotePath, NoteSummary};

/// Le nom de la clé de l'en-tête qui donne la place des nœuds racines.
const PLACES_KEY: &str = "racines";
const TITLE_MARK: &str = "# ";
const BULLET_MARKS: [char; 3] = ['-', '*', '+'];
const DETAIL_MARK: char = '>';
const COLOR_KEY: &str = "couleur";
const COMMENT_OPEN: &str = "<!--";
const COMMENT_CLOSE: &str = "-->";
/// Les espaces par niveau que l'application écrit.
const INDENT: &str = "  ";
/// Ce que vaut une tabulation dans un retrait.
const TAB_WIDTH: usize = 4;
/// L'écart vertical par défaut entre deux nœuds racines, en points.
const DEFAULT_ROW: f64 = 160.0;
/// Les 10 couleurs de la palette, dans l'ordre des menus.
pub const PALETTE: [&str; 10] = [
    "rouge",
    "orange",
    "jaune",
    "vert",
    "turquoise",
    "bleu",
    "violet",
    "rose",
    "marron",
    "ardoise",
];

/// La place d'un nœud racine : son coin haut gauche, en points, `y` croissant vers le bas.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Place {
    /// Position horizontale.
    pub x: f64,
    /// Position verticale.
    pub y: f64,
}

impl Place {
    /// La place par défaut du nœud racine de rang `rank`.
    #[must_use]
    pub fn default_of(rank: usize) -> Self {
        Self {
            x: 0.0,
            y: f64::from(u32::try_from(rank).unwrap_or(u32::MAX)) * DEFAULT_ROW,
        }
    }
}

/// Un nœud : une idée de la carte.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MindNode {
    /// Son titre, sur une ligne, Markdown de ligne accepté.
    pub title: String,
    /// Sa couleur, un nom de la palette.
    pub color: Option<String>,
    /// Les lignes de son détail (une ligne vide du détail est une chaîne vide).
    pub detail: Vec<String>,
    /// Ses enfants, dans l'ordre du fichier.
    pub children: Vec<MindNode>,
}

impl MindNode {
    /// Le nœud et tous ses descendants, dans l'ordre du fichier.
    #[must_use]
    pub fn descendants_count(&self) -> usize {
        self.children
            .iter()
            .map(|child| 1 + child.descendants_count())
            .sum()
    }
}

/// Le chemin d'un nœud : ses rangs depuis 0, séparés par des points (`1.0.2`).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub struct NodePath(pub Vec<usize>);

impl fmt::Display for NodePath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let ranks: Vec<String> = self.0.iter().map(ToString::to_string).collect();
        f.write_str(&ranks.join("."))
    }
}

/// Un nœud tel que l'index le garde : son chemin, son titre, son détail.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedNode {
    /// Son chemin dans la carte.
    pub path: NodePath,
    /// Son titre.
    pub title: String,
    /// Son détail, lignes jointes.
    pub detail: String,
}

/// Une carte mentale : ses nœuds racines et leur place.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct MindMap {
    /// Les nœuds racines, dans l'ordre du fichier.
    pub roots: Vec<MindNode>,
    /// La place de chaque nœud racine, dans le même ordre.
    pub places: Vec<Place>,
}

/// La note de texte `content` est une carte mentale : son en-tête le déclare.
#[must_use]
pub fn is_mind_map(content: &str) -> bool {
    crate::front_matter::declared_type(content) == Some("carte-mentale")
}

/// Le texte d'une carte neuve : l'en-tête et le titre, sans liste.
#[must_use]
pub fn new_mind_map(title: &str) -> String {
    format!(
        "---\ntype: carte-mentale\n---\n{TITLE_MARK}{}\n",
        title.trim()
    )
}

/// Le nom de la couleur de la palette que désigne `name` (espaces et majuscules ignorés).
#[must_use]
pub fn palette_name(name: &str) -> Option<&'static str> {
    let wanted = name.trim().to_lowercase();
    PALETTE.into_iter().find(|known| *known == wanted)
}

impl MindMap {
    /// La carte que dit `content` : lignes hors format ignorées.
    #[must_use]
    pub fn parse(content: &str) -> Self {
        let (yaml, body) = split(content);
        let roots = parse_list(list_of(body));
        let given = yaml.map(parse_places).unwrap_or_default();
        let places = (0..roots.len())
            .map(|rank| {
                let (x, y) = given.get(rank).copied().unwrap_or((None, None));
                let default = Place::default_of(rank);
                Place {
                    x: x.unwrap_or(default.x),
                    y: y.unwrap_or(default.y),
                }
            })
            .collect();
        Self { roots, places }
    }

    /// Le texte du fichier une fois cette carte enregistrée sur `original` : la liste et la
    /// propriété `racines` remplacées, le reste de l'en-tête et le titre inchangés.
    #[must_use]
    pub fn written_on(&self, original: &str) -> String {
        let places = (!self.roots.is_empty()).then(|| places_line(&self.places));
        let with_places = with_key_line(original, places_key_lines, places.as_deref());
        let (_, body) = split(&with_places);
        let head = &with_places[..with_places.len() - body.len()];
        let title = title_line(body);
        let mut out = String::from(head);
        if let Some(title) = title {
            out.push_str(title);
            out.push('\n');
        }
        if !self.roots.is_empty() {
            if title.is_some() {
                out.push('\n');
            }
            for root in &self.roots {
                write_node(&mut out, root, 0);
            }
        }
        out
    }

    /// Les nœuds, chacun avec son chemin, dans l'ordre du fichier.
    #[must_use]
    pub fn indexed_nodes(&self) -> Vec<IndexedNode> {
        let mut nodes = Vec::new();
        for (rank, root) in self.roots.iter().enumerate() {
            collect(root, &mut vec![rank], &mut nodes);
        }
        nodes
    }
}

/// Le résumé d'un nœud tel que l'index le garde : son titre, le chemin et la date de sa carte, le
/// type nœud, la carte pour conteneur et son chemin de nœud.
#[must_use]
pub fn node_summary(
    map: &NotePath,
    title: &str,
    modified: Modified,
    node: &NodePath,
) -> NoteSummary {
    NoteSummary::indexed(map.clone(), title.to_owned(), modified, false, Vec::new())
        .of_type(ContentType::Node, Some(map.clone()))
        .of_node(node.to_string())
}

/// Les nœuds de la carte `map` de texte `content`, tels que l'index les garde : chacun avec son
/// résumé ([`node_summary`]) et son texte pour la recherche (son titre puis son détail). Aucun si
/// la note n'est pas une carte mentale.
#[must_use]
pub fn indexed_node_entries(map: &NoteSummary, content: &str) -> Vec<(NoteSummary, String)> {
    if map.content_type() != ContentType::MindMap {
        return Vec::new();
    }
    MindMap::parse(content)
        .indexed_nodes()
        .into_iter()
        .map(|node| {
            let summary = node_summary(map.path(), &node.title, map.modified(), &node.path);
            let text = format!("{}\n{}", node.title, node.detail);
            (summary, text)
        })
        .collect()
}

/// Ce que la recherche par les mots lit d'une carte mentale elle-même : son titre et ses
/// étiquettes (ses nœuds sont trouvés à part).
#[must_use]
pub fn searchable_text(map: &NoteSummary) -> String {
    let mut text = map.title().to_owned();
    for tag in map.tags() {
        text.push('\n');
        text.push_str(tag);
    }
    text
}

/// Les segments de la carte titrée `map_title` de texte `content` : un par nœud, son titre puis
/// son détail, sous le titre de la carte.
#[must_use]
pub fn segments(map_title: &str, content: &str) -> Vec<Segment> {
    MindMap::parse(content)
        .indexed_nodes()
        .into_iter()
        .map(|node| Segment::of_node(map_title, &node.title, &node.detail, node.path.to_string()))
        .collect()
}

fn collect(node: &MindNode, path: &mut Vec<usize>, out: &mut Vec<IndexedNode>) {
    out.push(IndexedNode {
        path: NodePath(path.clone()),
        title: node.title.clone(),
        detail: node.detail.join("\n"),
    });
    for (rank, child) in node.children.iter().enumerate() {
        path.push(rank);
        collect(child, path, out);
        path.pop();
    }
}

/// Combien de lignes, à partir de la première, portent la propriété `racines` : elle et les
/// lignes en retrait ou en liste qui la suivent.
fn places_key_lines(lines: &[&str]) -> usize {
    let carries = |line: &str| {
        line.strip_prefix(PLACES_KEY)
            .is_some_and(|rest| rest.trim_start_matches([' ', '\t']).starts_with(':'))
    };
    if !lines.first().is_some_and(|line| carries(line)) {
        return 0;
    }
    1 + lines[1..]
        .iter()
        .take_while(|line| line.starts_with([' ', '\t']) || line.starts_with("- "))
        .count()
}

fn places_line(places: &[Place]) -> String {
    let items: Vec<String> = places
        .iter()
        .map(|place| format!("{{x: {}, y: {}}}", number(place.x), number(place.y)))
        .collect();
    format!("{PLACES_KEY}: [{}]", items.join(", "))
}

/// Un nombre écrit sans décimale s'il est entier, sinon arrondi au dixième.
fn number(value: f64) -> String {
    let rounded = (value * 10.0).round() / 10.0;
    if rounded == 0.0 {
        "0".to_owned()
    } else if rounded.fract() == 0.0 {
        format!("{rounded:.0}")
    } else {
        format!("{rounded:.1}")
    }
}

/// La ligne du titre `# …` du corps, avant la première puce.
fn title_line(body: &str) -> Option<&str> {
    for line in body.lines() {
        let line = line.trim_end_matches('\r');
        if bullet_text(line.trim_start_matches([' ', '\t'])).is_some() {
            return None;
        }
        if line.starts_with(TITLE_MARK) {
            return Some(line);
        }
    }
    None
}

/// Le corps à partir de la première puce.
fn list_of(body: &str) -> &str {
    let mut offset = 0;
    for piece in body.split_inclusive('\n') {
        if bullet_text(
            piece
                .trim_start_matches([' ', '\t'])
                .trim_end_matches(['\r', '\n']),
        )
        .is_some()
        {
            return &body[offset..];
        }
        offset += piece.len();
    }
    ""
}

/// Le texte d'une puce (sans son retrait) : après `-`, `*` ou `+` et un espace ou une
/// tabulation, s'il n'est pas fait que d'espaces.
fn bullet_text(line: &str) -> Option<&str> {
    let rest = line.strip_prefix(BULLET_MARKS)?;
    let text = rest.strip_prefix([' ', '\t'])?;
    (!text.trim().is_empty()).then_some(text)
}

fn indent_of(line: &str) -> (usize, &str) {
    let mut width = 0;
    for (at, c) in line.char_indices() {
        match c {
            ' ' => width += 1,
            '\t' => width += TAB_WIDTH,
            _ => return (width, &line[at..]),
        }
    }
    (width, "")
}

fn parse_list(list: &str) -> Vec<MindNode> {
    let mut roots: Vec<MindNode> = Vec::new();
    // La chaîne du dernier nœud : le retrait de chacun et son rang chez son parent.
    let mut chain: Vec<(usize, usize)> = Vec::new();
    for line in list.lines() {
        let (indent, rest) = indent_of(line.trim_end_matches('\r'));
        if let Some(text) = bullet_text(rest) {
            while chain.last().is_some_and(|(top, _)| *top >= indent) {
                chain.pop();
            }
            let node = node_of(text);
            let siblings = siblings_at(&mut roots, &chain);
            siblings.push(node);
            chain.push((indent, siblings.len() - 1));
        } else if let Some(text) = rest.strip_prefix(DETAIL_MARK) {
            let owner = chain.iter().rposition(|(top, _)| *top < indent);
            if let Some(owner) = owner {
                let text = text.strip_prefix(' ').unwrap_or(text);
                if let Some(node) = node_at(&mut roots, &chain[..=owner]) {
                    node.detail.push(text.to_owned());
                }
            }
        }
    }
    roots
}

fn siblings_at<'a>(
    roots: &'a mut Vec<MindNode>,
    chain: &[(usize, usize)],
) -> &'a mut Vec<MindNode> {
    let mut siblings = roots;
    for (_, rank) in chain {
        siblings = &mut siblings[*rank].children;
    }
    siblings
}

fn node_at<'a>(roots: &'a mut Vec<MindNode>, chain: &[(usize, usize)]) -> Option<&'a mut MindNode> {
    let (last, parents) = chain.split_last()?;
    siblings_at(roots, parents).get_mut(last.1)
}

fn node_of(text: &str) -> MindNode {
    let text = text.trim();
    let (title, color) = split_color(text);
    MindNode {
        title: title.to_owned(),
        color,
        ..MindNode::default()
    }
}

/// Le titre sans son commentaire de couleur, et la couleur si le nom est de la palette.
fn split_color(text: &str) -> (&str, Option<String>) {
    if let Some(body) = text.strip_suffix(COMMENT_CLOSE)
        && let Some(open) = body.rfind(COMMENT_OPEN)
        && let Some((key, name)) = body[open + COMMENT_OPEN.len()..].split_once(':')
        && key.trim().eq_ignore_ascii_case(COLOR_KEY)
    {
        return (body[..open].trim(), palette_name(name).map(str::to_owned));
    }
    (text, None)
}

fn write_node(out: &mut String, node: &MindNode, depth: usize) {
    let indent = INDENT.repeat(depth);
    out.push_str(&format!("{indent}- {}", node.title));
    if let Some(color) = &node.color {
        out.push_str(&format!(
            " {COMMENT_OPEN} {COLOR_KEY}: {color} {COMMENT_CLOSE}"
        ));
    }
    out.push('\n');
    for line in &node.detail {
        if line.is_empty() {
            out.push_str(&format!("{indent}{INDENT}{DETAIL_MARK}\n"));
        } else {
            out.push_str(&format!("{indent}{INDENT}{DETAIL_MARK} {line}\n"));
        }
    }
    for child in &node.children {
        write_node(out, child, depth + 1);
    }
}

type Coordinates = (Option<f64>, Option<f64>);

/// Les positions de la propriété `racines` de l'en-tête : une par élément de la liste, avec
/// les valeurs qui manquent ou ne sont pas des nombres à `None`.
fn parse_places(yaml: &str) -> Vec<Coordinates> {
    let Some(value) = yaml.lines().find_map(|line| {
        let rest = line.strip_prefix(PLACES_KEY)?;
        rest.trim_start_matches([' ', '\t']).strip_prefix(':')
    }) else {
        return Vec::new();
    };
    let Some(list) = value
        .trim()
        .strip_prefix('[')
        .and_then(|v| v.strip_suffix(']'))
    else {
        return Vec::new();
    };
    let mut items = Vec::new();
    let (mut depth, mut start) = (0_i32, 0);
    for (at, c) in list.char_indices() {
        match c {
            '{' => depth += 1,
            '}' => depth -= 1,
            ',' if depth == 0 => {
                items.push(&list[start..at]);
                start = at + 1;
            }
            _ => {}
        }
    }
    items.push(&list[start..]);
    if items.iter().all(|item| item.trim().is_empty()) {
        return Vec::new();
    }
    items
        .into_iter()
        .map(|item| parse_place(item.trim()))
        .collect()
}

fn parse_place(item: &str) -> Coordinates {
    let Some(inner) = item.strip_prefix('{').and_then(|v| v.strip_suffix('}')) else {
        return (None, None);
    };
    let (mut x, mut y) = (None, None);
    for field in inner.split(',') {
        if let Some((key, value)) = field.split_once(':') {
            let value = value.trim().parse::<f64>().ok().filter(|v| v.is_finite());
            match key.trim() {
                "x" => x = x.or(value),
                "y" => y = y.or(value),
                _ => {}
            }
        }
    }
    (x, y)
}

#[cfg(test)]
#[path = "mind_map_tests.rs"]
mod tests;
