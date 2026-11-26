//! Lire une carte mentale en arbre (fiche 0080) : ce que l'outil `read_mind_map` donne à une IA,
//! sans le texte du fichier. Règles pures : l'arbre des nœuds avec leur chemin, et la limite de
//! taille, toujours dite.

use crate::mind_map::{MindMap, MindNode, NodePath, Place};

/// Combien de caractères d'arbre au plus une lecture rend (titres et détails comptés, plus
/// [`NODE_STRUCTURE`] par nœud) : de quoi tenir sous la limite d'un résultat d'outil de Claude Code.
pub const MAX_READ_MAP_CHARACTERS: usize = 50_000;

/// Ce que la structure d'un nœud (son chemin, ses noms de champs) compte, en caractères.
pub const NODE_STRUCTURE: usize = 40;

/// Un nœud tel que l'IA le lit.
#[derive(Debug, Clone, PartialEq)]
pub struct OutlineNode {
    /// Son chemin dans la carte.
    pub path: NodePath,
    /// Son titre.
    pub title: String,
    /// Sa couleur, un nom de la palette.
    pub color: Option<String>,
    /// Son détail, lignes jointes par un retour à la ligne ; vide sans détail.
    pub detail: String,
    /// Sa place sur la carte, pour un nœud racine seulement.
    pub place: Option<Place>,
    /// Ses enfants donnés.
    pub children: Vec<OutlineNode>,
}

/// Une carte mentale lisible : ses nœuds racines, dans l'ordre du fichier, coupés à la limite.
#[derive(Debug, Clone, PartialEq)]
pub struct ReadableMindMap {
    /// Les nœuds racines donnés.
    pub roots: Vec<OutlineNode>,
    /// Le nombre de nœuds donnés.
    pub shown: usize,
    /// Le nombre de nœuds de la carte entière.
    pub total: usize,
    /// Le chemin du dernier nœud donné, dans l'ordre du fichier.
    pub last: Option<NodePath>,
}

impl ReadableMindMap {
    /// La carte est coupée : des nœuds ne sont pas donnés.
    #[must_use]
    pub const fn truncated(&self) -> bool {
        self.shown < self.total
    }
}

/// Ce qu'il reste à donner : la place libre, et si la limite est atteinte.
struct Budget {
    left: usize,
    shown: usize,
    last: Option<NodePath>,
    full: bool,
}

impl Budget {
    /// Prend le nœud s'il tient ; le premier est toujours pris, même plus gros que la limite.
    fn take(&mut self, node: &MindNode, path: &NodePath) -> bool {
        let detail: usize = node
            .detail
            .iter()
            .map(|line| line.chars().count() + 1)
            .sum();
        let cost = node.title.chars().count() + detail + NODE_STRUCTURE;
        if self.full || (self.shown > 0 && cost > self.left) {
            self.full = true;
            return false;
        }
        self.left = self.left.saturating_sub(cost);
        self.shown += 1;
        self.last = Some(path.clone());
        true
    }
}

impl MindMap {
    /// La carte en arbre, telle que l'IA la lit : au plus [`MAX_READ_MAP_CHARACTERS`] caractères,
    /// dans l'ordre du fichier.
    #[must_use]
    pub fn readable(&self) -> ReadableMindMap {
        let mut budget = Budget {
            left: MAX_READ_MAP_CHARACTERS,
            shown: 0,
            last: None,
            full: false,
        };
        let mut roots = Vec::new();
        for (rank, root) in self.roots.iter().enumerate() {
            let Some(mut outline) = outlined(root, &NodePath(vec![rank]), &mut budget) else {
                break;
            };
            outline.place = self.places.get(rank).copied();
            roots.push(outline);
        }
        ReadableMindMap {
            roots,
            shown: budget.shown,
            total: self.nodes_count(),
            last: budget.last,
        }
    }
}

fn outlined(node: &MindNode, path: &NodePath, budget: &mut Budget) -> Option<OutlineNode> {
    if !budget.take(node, path) {
        return None;
    }
    let mut children = Vec::new();
    for (rank, child) in node.children.iter().enumerate() {
        let mut child_path = path.0.clone();
        child_path.push(rank);
        match outlined(child, &NodePath(child_path), budget) {
            Some(outline) => children.push(outline),
            None => break,
        }
    }
    Some(OutlineNode {
        path: path.clone(),
        title: node.title.clone(),
        color: node.color.clone(),
        detail: node.detail.join("\n"),
        place: None,
        children,
    })
}

#[cfg(test)]
#[path = "mind_map_reading_tests.rs"]
mod tests;
