//! Modifier une carte mentale (fiche 0080) : les gestes de l'interface (ajouter un nœud enfant,
//! frère ou racine, changer le texte ou la couleur d'un nœud, déplacer ou supprimer une branche),
//! avec les règles de l'écran (`ui/src/state/mind-map.ts`) écrites en Rust pour que les IA les
//! jouent à l'identique. Règles pures : rien n'est écrit ici.

use std::fmt;

use crate::mind_map::{MindMap, MindNode, NodePath, PALETTE, Place, palette_name};

/// Le nom qui retire la couleur d'un nœud (le choix « Sans couleur » du menu).
pub const NO_COLOR: &str = "aucune";

/// Où un nœud déplacé est déposé : les dépôts du glisser-déposer (spécification § 7.2).
#[derive(Debug, Clone, PartialEq)]
pub enum NodeDrop {
    /// Il devient le dernier enfant de la cible.
    Child(NodePath),
    /// Il devient le frère de la cible, juste au-dessus.
    Before(NodePath),
    /// Il devient le frère de la cible, juste en dessous.
    After(NodePath),
    /// Il devient un nœud racine, posé à la place donnée (la place par défaut sinon) ; un nœud
    /// racine est seulement déplacé : sa place est alors exigée.
    Root(Option<Place>),
}

/// Pourquoi un geste sur une carte est refusé ; rien n'est alors changé.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefusedMindMapEdit {
    /// Le texte n'est pas un chemin de nœud.
    InvalidPath(String),
    /// Aucun nœud à ce chemin.
    NoSuchNode {
        /// Le chemin demandé.
        path: NodePath,
        /// Le nombre de nœuds de la carte.
        nodes: usize,
    },
    /// Le titre d'un nœud est vide.
    EmptyTitle,
    /// Le titre d'un nœud tient sur plusieurs lignes.
    MultilineTitle,
    /// Ni titre ni détail à changer.
    NothingToChange,
    /// Un nom de couleur qui n'est pas dans la palette.
    UnknownColor(String),
    /// Un nœud déposé dans sa propre branche ou sur lui-même.
    IntoOwnBranch,
    /// Un nœud racine déposé sur le fond sans place.
    RootNeedsPlace,
}

impl fmt::Display for RefusedMindMapEdit {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPath(text) => write!(
                f,
                "chemin de nœud invalide : « {text} » ; un chemin est fait des rangs depuis 0 \
                 séparés par des points (`0` le premier nœud racine, `0.1` son deuxième enfant, \
                 `1.0.2`) : read_mind_map donne celui de chaque nœud"
            ),
            Self::NoSuchNode { path, nodes } => write!(
                f,
                "le nœud « {path} » n'existe pas dans la carte ({nodes} nœud{}) : relisez la \
                 carte avec read_mind_map, les chemins se renumérotent après un ajout, un \
                 déplacement ou une suppression ; rien n'a été changé",
                if *nodes > 1 { "s" } else { "" }
            ),
            Self::EmptyTitle => {
                f.write_str("le titre d'un nœud ne peut pas être vide ; rien n'a été changé")
            }
            Self::MultilineTitle => f.write_str(
                "le titre d'un nœud tient sur une seule ligne : mettez le reste dans son détail \
                 (detail) ; rien n'a été changé",
            ),
            Self::NothingToChange => f.write_str(
                "rien à changer : donnez le nouveau titre (title) ou le nouveau détail (detail) du \
                 nœud",
            ),
            Self::UnknownColor(name) => write!(
                f,
                "couleur inconnue : « {name} » ; les couleurs de la palette sont {}, et « {NO_COLOR} » \
                 retire la couleur ; rien n'a été changé",
                PALETTE.join(", ")
            ),
            Self::IntoOwnBranch => f.write_str(
                "un nœud ne se déplace ni sur lui-même ni dans sa propre branche ; rien n'a été \
                 changé",
            ),
            Self::RootNeedsPlace => f.write_str(
                "un nœud racine déplacé sur le fond a besoin de sa nouvelle place : donnez place_x \
                 et place_y ; rien n'a été changé",
            ),
        }
    }
}

impl std::error::Error for RefusedMindMapEdit {}

impl NodePath {
    /// Le chemin que dit `text` (`1.0.2`) : des rangs depuis 0 séparés par des points.
    ///
    /// # Errors
    ///
    /// [`RefusedMindMapEdit::InvalidPath`] si `text` n'en est pas un.
    pub fn parse(text: &str) -> Result<Self, RefusedMindMapEdit> {
        let invalid = || RefusedMindMapEdit::InvalidPath(text.to_owned());
        let ranks = text
            .trim()
            .split('.')
            .map(|rank| {
                let digits = !rank.is_empty() && rank.bytes().all(|b| b.is_ascii_digit());
                digits
                    .then(|| rank.parse().ok())
                    .flatten()
                    .ok_or_else(invalid)
            })
            .collect::<Result<Vec<usize>, _>>()?;
        Ok(Self(ranks))
    }

    /// Le chemin `inner` est dans la branche de ce chemin (ou est ce chemin).
    #[must_use]
    pub fn contains(&self, inner: &Self) -> bool {
        inner.0.starts_with(&self.0)
    }

    /// Le rang du nœud chez son parent (le dernier du chemin).
    fn rank(&self) -> usize {
        self.0.last().copied().unwrap_or(0)
    }

    /// Le chemin du parent (vide pour un nœud racine).
    fn above(&self) -> &[usize] {
        &self.0[..self.0.len().saturating_sub(1)]
    }

    /// Ce chemin une fois la branche `removed` retirée : s'il suit `removed` dans la même
    /// fratrie, son rang à ce niveau recule d'un.
    fn after_removal_of(&self, removed: &Self) -> Self {
        let depth = removed.0.len() - 1;
        let same_parent = self.0.len() > depth && self.0[..depth] == removed.0[..depth];
        if !same_parent || self.0[depth] <= removed.0[depth] {
            return self.clone();
        }
        let mut ranks = self.0.clone();
        ranks[depth] -= 1;
        Self(ranks)
    }
}

/// Un nœud neuf : son titre (une ligne, non vide) et son détail (lignes séparées par des retours à
/// la ligne ; vide pour aucun).
///
/// # Errors
///
/// [`RefusedMindMapEdit::EmptyTitle`] ou [`RefusedMindMapEdit::MultilineTitle`].
pub fn new_node(title: &str, detail: &str) -> Result<MindNode, RefusedMindMapEdit> {
    Ok(MindNode {
        title: checked_title(title)?,
        detail: detail_lines(detail),
        ..MindNode::default()
    })
}

/// Le titre rogné, qui tient sur une ligne et n'est pas vide.
fn checked_title(title: &str) -> Result<String, RefusedMindMapEdit> {
    let title = title.trim();
    if title.is_empty() {
        return Err(RefusedMindMapEdit::EmptyTitle);
    }
    if title.contains(['\n', '\r']) {
        return Err(RefusedMindMapEdit::MultilineTitle);
    }
    Ok(title.to_owned())
}

/// Les lignes d'un détail écrit d'un bloc : séparées par des retours à la ligne, ni retour ni
/// ligne vide en fin de détail.
fn detail_lines(detail: &str) -> Vec<String> {
    let mut lines: Vec<String> = detail
        .replace("\r\n", "\n")
        .split('\n')
        .map(str::to_owned)
        .collect();
    while lines.last().is_some_and(|line| line.trim().is_empty()) {
        lines.pop();
    }
    lines
}

/// La couleur que dit `name` : `None` pour « aucune », sinon une couleur de la palette.
fn checked_color(name: &str) -> Result<Option<String>, RefusedMindMapEdit> {
    if name.trim().eq_ignore_ascii_case(NO_COLOR) {
        return Ok(None);
    }
    palette_name(name)
        .map(|known| Some(known.to_owned()))
        .ok_or_else(|| RefusedMindMapEdit::UnknownColor(name.trim().to_owned()))
}

impl MindMap {
    /// Le nœud à ce chemin, s'il existe.
    #[must_use]
    pub fn node(&self, path: &NodePath) -> Option<&MindNode> {
        let (first, rest) = path.0.split_first()?;
        let mut node = self.roots.get(*first)?;
        for rank in rest {
            node = node.children.get(*rank)?;
        }
        Some(node)
    }

    /// Le nombre de nœuds de la carte.
    #[must_use]
    pub fn nodes_count(&self) -> usize {
        self.roots
            .iter()
            .map(|root| 1 + root.descendants_count())
            .sum()
    }

    fn missing(&self, path: &NodePath) -> RefusedMindMapEdit {
        RefusedMindMapEdit::NoSuchNode {
            path: path.clone(),
            nodes: self.nodes_count(),
        }
    }

    /// Le nœud à ce chemin, ou le refus qui dit qu'il n'existe pas.
    fn existing_mut(&mut self, path: &NodePath) -> Result<&mut MindNode, RefusedMindMapEdit> {
        let missing = self.missing(path);
        let siblings = self.siblings_mut(path.above()).ok_or(missing.clone())?;
        siblings.get_mut(path.rank()).ok_or(missing)
    }

    /// Les enfants du nœud `above` (les nœuds racines si vide), s'il existe.
    fn siblings_mut(&mut self, above: &[usize]) -> Option<&mut Vec<MindNode>> {
        let mut siblings = &mut self.roots;
        for rank in above {
            siblings = &mut siblings.get_mut(*rank)?.children;
        }
        Some(siblings)
    }

    /// Le nœud inséré au rang `rank` des enfants de `above` ; entre nœuds racines, sa place est
    /// insérée aussi (`place`, la place par défaut de son rang sinon). Rend son chemin.
    fn insert_at(
        &mut self,
        above: &[usize],
        rank: usize,
        node: MindNode,
        place: Option<Place>,
    ) -> Result<NodePath, RefusedMindMapEdit> {
        let missing = self.missing(&NodePath(above.to_vec()));
        let siblings = self.siblings_mut(above).ok_or(missing)?;
        let rank = rank.min(siblings.len());
        siblings.insert(rank, node);
        if above.is_empty() {
            self.places
                .insert(rank, place.unwrap_or_else(|| Place::default_of(rank)));
        }
        let mut ranks = above.to_vec();
        ranks.push(rank);
        Ok(NodePath(ranks))
    }

    /// Le nœud ajouté comme dernier enfant de `parent` (la touche Tab). Rend son chemin.
    ///
    /// # Errors
    ///
    /// [`RefusedMindMapEdit::NoSuchNode`] si `parent` n'existe pas.
    pub fn add_child(
        &mut self,
        parent: &NodePath,
        node: MindNode,
    ) -> Result<NodePath, RefusedMindMapEdit> {
        let count = self.existing_mut(parent)?.children.len();
        self.insert_at(&parent.0, count, node, None)
    }

    /// Le nœud ajouté juste sous `path`, chez le même parent (la touche Entrée) ; entre nœuds
    /// racines, il prend la place par défaut de son rang. Rend son chemin.
    ///
    /// # Errors
    ///
    /// [`RefusedMindMapEdit::NoSuchNode`] si `path` n'existe pas.
    pub fn add_sibling(
        &mut self,
        path: &NodePath,
        node: MindNode,
    ) -> Result<NodePath, RefusedMindMapEdit> {
        self.existing_mut(path)?;
        self.insert_at(path.above(), path.rank() + 1, node, None)
    }

    /// Un nœud racine ajouté à la fin (le double-clic sur le fond), posé à `place` (la place par
    /// défaut de son rang sinon). Rend son chemin.
    pub fn add_root(&mut self, node: MindNode, place: Option<Place>) -> NodePath {
        let rank = self.roots.len();
        self.roots.push(node);
        self.places
            .push(place.unwrap_or_else(|| Place::default_of(rank)));
        NodePath(vec![rank])
    }

    /// Le titre et/ou le détail du nœud changés (la saisie, F2) ; ce qui n'est pas donné reste,
    /// ses enfants et sa couleur aussi.
    ///
    /// # Errors
    ///
    /// [`RefusedMindMapEdit::NothingToChange`] sans titre ni détail ; un titre refusé ;
    /// [`RefusedMindMapEdit::NoSuchNode`] si le nœud n'existe pas.
    pub fn change_text(
        &mut self,
        path: &NodePath,
        title: Option<&str>,
        detail: Option<&str>,
    ) -> Result<(), RefusedMindMapEdit> {
        if title.is_none() && detail.is_none() {
            return Err(RefusedMindMapEdit::NothingToChange);
        }
        let title = title.map(checked_title).transpose()?;
        let node = self.existing_mut(path)?;
        if let Some(title) = title {
            node.title = title;
        }
        if let Some(detail) = detail {
            node.detail = detail_lines(detail);
        }
        Ok(())
    }

    /// La couleur du nœud changée : un nom de la palette, ou « aucune » pour la retirer.
    ///
    /// # Errors
    ///
    /// [`RefusedMindMapEdit::UnknownColor`] si le nom n'est pas de la palette ;
    /// [`RefusedMindMapEdit::NoSuchNode`] si le nœud n'existe pas.
    pub fn recolor(&mut self, path: &NodePath, color: &str) -> Result<(), RefusedMindMapEdit> {
        let color = checked_color(color)?;
        self.existing_mut(path)?.color = color;
        Ok(())
    }

    /// La branche du nœud supprimée (la touche Suppr) ; rend combien de nœuds sont partis, lui
    /// compris.
    ///
    /// # Errors
    ///
    /// [`RefusedMindMapEdit::NoSuchNode`] si le nœud n'existe pas.
    pub fn remove(&mut self, path: &NodePath) -> Result<usize, RefusedMindMapEdit> {
        let removed = 1 + self.existing_mut(path)?.descendants_count();
        if let Some(siblings) = self.siblings_mut(path.above()) {
            siblings.remove(path.rank());
        }
        if path.0.len() == 1 {
            self.places.remove(path.rank());
        }
        Ok(removed)
    }

    /// La branche `from` déposée en `drop` (le glisser-déposer) ; rend le nouveau chemin du nœud.
    ///
    /// # Errors
    ///
    /// [`RefusedMindMapEdit::NoSuchNode`] si le nœud ou sa cible n'existe pas ;
    /// [`RefusedMindMapEdit::IntoOwnBranch`] si la cible est dans sa branche ;
    /// [`RefusedMindMapEdit::RootNeedsPlace`] pour un nœud racine déposé sur le fond sans place.
    pub fn move_branch(
        &mut self,
        from: &NodePath,
        drop: NodeDrop,
    ) -> Result<NodePath, RefusedMindMapEdit> {
        let moving = self.existing_mut(from)?.clone();
        match drop {
            NodeDrop::Root(place) => self.move_to_root(from, moving, place),
            NodeDrop::Child(target) => {
                let target = self.target_of_move(from, &target)?;
                self.remove(from)?;
                self.add_child(&target, moving)
            }
            NodeDrop::Before(target) => self.move_beside(from, moving, &target, 0),
            NodeDrop::After(target) => self.move_beside(from, moving, &target, 1),
        }
    }

    /// La cible d'un dépôt sur un nœud, une fois la branche `from` retirée : refusée si elle
    /// n'existe pas ou si elle est dans la branche déplacée.
    fn target_of_move(
        &mut self,
        from: &NodePath,
        target: &NodePath,
    ) -> Result<NodePath, RefusedMindMapEdit> {
        self.existing_mut(target)?;
        if from.contains(target) {
            return Err(RefusedMindMapEdit::IntoOwnBranch);
        }
        Ok(target.after_removal_of(from))
    }

    /// La branche déposée sur le fond : un nœud racine est seulement déplacé, un autre devient
    /// un nœud racine.
    fn move_to_root(
        &mut self,
        from: &NodePath,
        moving: MindNode,
        place: Option<Place>,
    ) -> Result<NodePath, RefusedMindMapEdit> {
        if from.0.len() > 1 {
            self.remove(from)?;
            return Ok(self.add_root(moving, place));
        }
        let place = place.ok_or(RefusedMindMapEdit::RootNeedsPlace)?;
        self.places[from.rank()] = place;
        Ok(from.clone())
    }

    /// La branche déposée en frère de `target`, `after` rangs plus bas que lui (0 : au-dessus,
    /// 1 : en dessous). Un nœud racine déplacé entre nœuds racines garde sa place.
    fn move_beside(
        &mut self,
        from: &NodePath,
        moving: MindNode,
        target: &NodePath,
        after: usize,
    ) -> Result<NodePath, RefusedMindMapEdit> {
        let target = self.target_of_move(from, target)?;
        let own = (from.0.len() == 1).then(|| self.places[from.rank()]);
        self.remove(from)?;
        self.insert_at(target.above(), target.rank() + after, moving, own)
    }
}

#[cfg(test)]
#[path = "mind_map_editing_tests.rs"]
mod tests;
