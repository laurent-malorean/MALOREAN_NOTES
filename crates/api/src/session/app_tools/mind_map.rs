//! Les outils de la carte mentale pour les IA (fiche 0080) : la lire en arbre, et un outil par
//! geste de l'interface pour la modifier. Ils appellent les mêmes règles que l'écran (domaine
//! `mind_map_editing`) par le cas d'usage de l'interface ; le garde-fou du web retient ceux qui
//! changent la carte.

use domain::app_tools::AppTool;
use domain::mind_map::{MindMap, NodePath, Place};
use domain::mind_map_editing::{NO_COLOR, NodeDrop, new_node};
use domain::mind_map_reading::{MAX_READ_MAP_CHARACTERS, OutlineNode, ReadableMindMap};
use serde::Serialize;
use serde_json::Value;

use super::{given, required, written};
use crate::session::Session;

/// Le nœud qu'un geste vient d'ajouter, de déplacer ou de changer : son chemin dans la carte
/// (qui peut avoir changé) et son titre.
#[derive(Debug, Serialize)]
struct TouchedNode {
    path: String,
    node: String,
    title: String,
    /// La couleur donnée (`aucune` si retirée), pour l'outil qui colore.
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<String>,
    /// Le nombre de nœuds supprimés, pour l'outil qui supprime.
    #[serde(skip_serializing_if = "Option::is_none")]
    deleted: Option<usize>,
}

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

/// L'outil est un geste qui change une carte mentale.
pub(super) const fn edits_a_mind_map(tool: AppTool) -> bool {
    matches!(
        tool,
        AppTool::AddMindMapChild
            | AppTool::AddMindMapSibling
            | AppTool::AddMindMapRoot
            | AppTool::EditMindMapNode
            | AppTool::ColorMindMapNode
            | AppTool::MoveMindMapNode
            | AppTool::DeleteMindMapNode
    )
}

/// Le chemin du nœud que l'IA désigne par `field`.
fn node_path(arguments: &Value, field: &str) -> Result<NodePath, String> {
    NodePath::parse(required(arguments, field)?).map_err(|error| error.to_string())
}

/// Un nombre facultatif de l'entrée : absent ou nul, rien ; sinon il faut un nombre.
fn number(arguments: &Value, field: &str) -> Result<Option<f64>, String> {
    match arguments.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_f64()
            .map(Some)
            .ok_or_else(|| format!("« {field} » doit être un nombre")),
    }
}

/// La place d'un nœud racine que l'IA donne (`place_x` et `place_y` vont ensemble), s'il y en a
/// une.
fn place_given(arguments: &Value) -> Result<Option<Place>, String> {
    match (number(arguments, "place_x")?, number(arguments, "place_y")?) {
        (None, None) => Ok(None),
        (Some(x), Some(y)) => Ok(Some(Place { x, y })),
        _ => Err("place_x et place_y vont ensemble : donnez les deux nombres, ou aucun".to_owned()),
    }
}

impl Session {
    /// Joue un outil de la carte mentale qui change la carte (fiche 0080).
    pub(super) fn call_mind_map_tool(
        &self,
        tool: AppTool,
        arguments: &Value,
    ) -> Result<String, String> {
        let path = required(arguments, "path")?;
        match tool {
            AppTool::AddMindMapChild | AppTool::AddMindMapSibling => {
                self.tool_add_node(path, arguments, tool == AppTool::AddMindMapChild)
            }
            AppTool::AddMindMapRoot => self.tool_add_root(path, arguments),
            AppTool::EditMindMapNode => self.tool_edit_node(path, arguments),
            AppTool::ColorMindMapNode => self.tool_color_node(path, arguments),
            AppTool::MoveMindMapNode => self.tool_move_node(path, arguments),
            AppTool::DeleteMindMapNode => self.tool_delete_node(path, arguments),
            _ => unreachable!("un outil qui n'est pas un geste de la carte est joué à part"),
        }
    }

    /// Un nœud ajouté à côté de `node` (frère) ou dessous (dernier enfant).
    fn tool_add_node(
        &self,
        path: &str,
        arguments: &Value,
        as_child: bool,
    ) -> Result<String, String> {
        let at = node_path(arguments, "node")?;
        let node = new_typed(arguments)?;
        let title = node.title.clone();
        let added = self
            .edit_mind_map(path, |map| {
                if as_child {
                    map.add_child(&at, node)
                } else {
                    map.add_sibling(&at, node)
                }
            })
            .map_err(|error| error.message)?;
        touched(path, &added, title)
    }

    /// Un nœud racine ajouté à la fin, à la place donnée ou par défaut.
    fn tool_add_root(&self, path: &str, arguments: &Value) -> Result<String, String> {
        let place = place_given(arguments)?;
        let node = new_typed(arguments)?;
        let title = node.title.clone();
        let added = self
            .edit_mind_map(path, |map| Ok(map.add_root(node, place)))
            .map_err(|error| error.message)?;
        touched(path, &added, title)
    }

    /// Le titre et/ou le détail d'un nœud changés.
    fn tool_edit_node(&self, path: &str, arguments: &Value) -> Result<String, String> {
        let at = node_path(arguments, "node")?;
        let (title, detail) = (arguments["title"].as_str(), arguments["detail"].as_str());
        let title = self
            .edit_mind_map(path, |map| {
                map.change_text(&at, title, detail)?;
                Ok(title_at(map, &at))
            })
            .map_err(|error| error.message)?;
        touched(path, &at, title)
    }

    /// La couleur d'un nœud changée.
    fn tool_color_node(&self, path: &str, arguments: &Value) -> Result<String, String> {
        let at = node_path(arguments, "node")?;
        let color = given(arguments, "color")?;
        let (title, colored) = self
            .edit_mind_map(path, |map| {
                map.recolor(&at, color)?;
                let colored = map.node(&at).and_then(|node| node.color.clone());
                Ok((title_at(map, &at), colored))
            })
            .map_err(|error| error.message)?;
        let mut touched = touched_node(path, &at, title);
        touched.color = Some(colored.unwrap_or_else(|| NO_COLOR.to_owned()));
        written(&touched)
    }

    /// Une branche déplacée.
    fn tool_move_node(&self, path: &str, arguments: &Value) -> Result<String, String> {
        let from = node_path(arguments, "node")?;
        let drop = drop_given(arguments)?;
        let (moved, title) = self
            .edit_mind_map(path, |map| {
                let title = title_at(map, &from);
                Ok((map.move_branch(&from, drop)?, title))
            })
            .map_err(|error| error.message)?;
        touched(path, &moved, title)
    }

    /// Une branche supprimée.
    fn tool_delete_node(&self, path: &str, arguments: &Value) -> Result<String, String> {
        let at = node_path(arguments, "node")?;
        let (deleted, title) = self
            .edit_mind_map(path, |map| {
                let title = title_at(map, &at);
                Ok((map.remove(&at)?, title))
            })
            .map_err(|error| error.message)?;
        let mut touched = touched_node(path, &at, title);
        touched.deleted = Some(deleted);
        written(&touched)
    }
}

/// Où l'IA dépose le nœud : `position` (`child`, `before`, `after` ou `root`), la cible `target`
/// des trois premiers, la place du dernier.
fn drop_given(arguments: &Value) -> Result<NodeDrop, String> {
    let position = required(arguments, "position")?;
    let place = place_given(arguments)?;
    if position != "root" && place.is_some() {
        return Err(
            "place_x et place_y ne servent qu'avec position root : sur un autre nœud, la place \
             vient de la cible"
                .to_owned(),
        );
    }
    match position {
        "child" => Ok(NodeDrop::Child(node_path(arguments, "target")?)),
        "before" => Ok(NodeDrop::Before(node_path(arguments, "target")?)),
        "after" => Ok(NodeDrop::After(node_path(arguments, "target")?)),
        "root" => Ok(NodeDrop::Root(place)),
        other => Err(format!(
            "position inconnue : « {other} » ; `child` (dernier enfant de target), `before` ou \
             `after` (frère de target, juste au-dessus ou en dessous) ou `root` (nœud racine)"
        )),
    }
}

/// Le nœud neuf que décrivent `title` et `detail` ; un titre vide reçoit le message de l'écran.
fn new_typed(arguments: &Value) -> Result<domain::mind_map::MindNode, String> {
    let detail = arguments["detail"].as_str().unwrap_or_default();
    new_node(given(arguments, "title")?, detail).map_err(|error| error.to_string())
}

fn touched_node(path: &str, node: &NodePath, title: String) -> TouchedNode {
    TouchedNode {
        path: path.to_owned(),
        node: node.to_string(),
        title,
        color: None,
        deleted: None,
    }
}

fn touched(path: &str, node: &NodePath, title: String) -> Result<String, String> {
    written(&touched_node(path, node, title))
}

/// Le titre du nœud à ce chemin.
fn title_at(map: &MindMap, path: &NodePath) -> String {
    map.node(path)
        .map(|node| node.title.clone())
        .unwrap_or_default()
}
