//! Les outils de la carte mentale pour les IA (fiche 0080) : la lire en arbre, et un outil par
//! geste de l'interface pour la modifier. Ils appellent les mêmes règles que l'écran (domaine
//! `mind_map_editing`) par le cas d'usage de l'interface ; le garde-fou du web retient ceux qui
//! changent la carte.

use domain::mind_map::NodePath;
use domain::mind_map_reading::{MAX_READ_MAP_CHARACTERS, OutlineNode, ReadableMindMap};
use serde::Serialize;
use serde_json::Value;

use super::{required, written};
use crate::session::Session;

/// La place d'un nœud racine, telle que l'IA la lit.
#[derive(Debug, Serialize)]
struct PlaceText {
    x: f64,
    y: f64,
}

/// Un nœud, tel que l'IA le lit : son chemin dans la carte, son titre, sa couleur, son détail.
#[derive(Debug, Serialize)]
struct NodeText {
    node: String,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
    #[serde(skip_serializing_if = "String::is_empty")]
    detail: String,
    /// Seulement pour un nœud racine.
    #[serde(skip_serializing_if = "Option::is_none")]
    place: Option<PlaceText>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    children: Vec<NodeText>,
}

impl From<OutlineNode> for NodeText {
    fn from(node: OutlineNode) -> Self {
        Self {
            node: node.path.to_string(),
            title: node.title,
            color: node.color,
            detail: node.detail,
            place: node.place.map(|place| PlaceText {
                x: place.x,
                y: place.y,
            }),
            children: node.children.into_iter().map(Self::from).collect(),
        }
    }
}

/// La carte mentale, telle que l'IA la lit.
#[derive(Debug, Serialize)]
struct MindMapText {
    path: String,
    title: String,
    roots: Vec<NodeText>,
    /// Le nombre de nœuds donnés.
    nodes: usize,
    /// Le nombre de nœuds de la carte entière.
    total_nodes: usize,
    truncated: bool,
    /// Pourquoi et de combien la carte est coupée, dit à l'IA ; rien si elle ne l'est pas.
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

/// Ce que la réponse dit quand la carte est coupée.
fn cut_message(read: &ReadableMindMap) -> String {
    let last = read
        .last
        .as_ref()
        .map(ToString::to_string)
        .unwrap_or_default();
    format!(
        "la carte est coupée : {} nœuds sur {} sont donnés (la limite est de \
         {MAX_READ_MAP_CHARACTERS} caractères d'arbre) ; les nœuds qui suivent le nœud {last} \
         dans l'ordre du fichier ne sont pas donnés, mais les chemins donnés restent valables : \
         cherchez un autre nœud avec search_notes, qui rend son chemin (`node`)",
        read.shown, read.total
    )
}

impl Session {
    /// La carte mentale `path` en arbre : au plus [`MAX_READ_MAP_CHARACTERS`] caractères, et la
    /// réponse dit si elle est coupée.
    pub(super) fn tool_read_mind_map(&self, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        let (title, read) = self.read_mind_map_outline(path).map_err(|e| e.message)?;
        let message = read.truncated().then(|| cut_message(&read));
        written(&MindMapText {
            path: path.to_owned(),
            title,
            nodes: read.shown,
            total_nodes: read.total,
            truncated: read.truncated(),
            roots: read.roots.into_iter().map(NodeText::from).collect(),
            message,
        })
    }
}

/// Le chemin d'un nœud tel que l'IA l'a écrit.
#[expect(dead_code, reason = "servira aux outils de geste")]
fn node_path(arguments: &Value, field: &str) -> Result<NodePath, String> {
    NodePath::parse(required(arguments, field)?).map_err(|error| error.to_string())
}
