//! La carte mentale telle que l'interface la reçoit et la renvoie (fiche 0050).

use domain::mind_map::{MindMap, MindNode, Place};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Un nœud de la carte.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MindNodeItem {
    /// Son titre, sur une ligne.
    pub title: String,
    /// Sa couleur, un nom de la palette.
    pub color: Option<String>,
    /// Les lignes de son détail.
    pub detail: Vec<String>,
    /// Ses enfants.
    pub children: Vec<MindNodeItem>,
}

/// La place d'un nœud racine, en points.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct PlaceItem {
    /// Position horizontale du coin haut gauche.
    pub x: f64,
    /// Position verticale du coin haut gauche.
    pub y: f64,
}

/// Une carte mentale : ses nœuds racines et leur place.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MindMapItem {
    /// Les nœuds racines.
    pub roots: Vec<MindNodeItem>,
    /// La place de chaque nœud racine, dans le même ordre.
    pub places: Vec<PlaceItem>,
}

impl From<MindNode> for MindNodeItem {
    fn from(node: MindNode) -> Self {
        Self {
            title: node.title,
            color: node.color,
            detail: node.detail,
            children: node.children.into_iter().map(Self::from).collect(),
        }
    }
}

impl From<MindNodeItem> for MindNode {
    fn from(item: MindNodeItem) -> Self {
        Self {
            title: item.title,
            color: item.color,
            detail: item.detail,
            children: item.children.into_iter().map(Self::from).collect(),
        }
    }
}

impl From<MindMap> for MindMapItem {
    fn from(map: MindMap) -> Self {
        Self {
            roots: map.roots.into_iter().map(MindNodeItem::from).collect(),
            places: map
                .places
                .into_iter()
                .map(|place| PlaceItem {
                    x: place.x,
                    y: place.y,
                })
                .collect(),
        }
    }
}

impl From<MindMapItem> for MindMap {
    fn from(item: MindMapItem) -> Self {
        let roots: Vec<MindNode> = item.roots.into_iter().map(MindNode::from).collect();
        let places = (0..roots.len())
            .map(|rank| {
                item.places
                    .get(rank)
                    .map_or(Place::default_of(rank), |place| Place {
                        x: place.x,
                        y: place.y,
                    })
            })
            .collect();
        Self { roots, places }
    }
}
