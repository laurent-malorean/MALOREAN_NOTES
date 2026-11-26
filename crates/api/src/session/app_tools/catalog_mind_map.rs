//! Ce que Claude lit des outils de la carte mentale (fiche 0080) : leur nom, ce qu'ils font, et ce
//! qu'ils attendent (schéma JSON de leur entrée), dans les mots de l'application.

use serde_json::{Value, json};

use super::catalog::{Described, input, text};

/// Le chemin d'une carte mentale, tel que les outils de la carte mentale l'attendent.
fn map_path() -> Value {
    text("Chemin de la carte mentale depuis l'espace de travail : `dossier/nom.md`.")
}

/// Le chemin d'un nœud, tel que les outils de la carte mentale l'attendent.
fn node_param(what: &str) -> Value {
    text(&format!(
        "Le chemin du nœud {what}, tel que `read_mind_map` le donne : `0` le premier nœud racine, \
         `0.1` son deuxième enfant, `1.0.2`."
    ))
}

/// Le titre d'un nœud neuf.
fn node_title() -> Value {
    text(
        "Le titre du nœud, sur une seule ligne, non vide ; Markdown de ligne permis (gras, lien `[[titre]]`…).",
    )
}

/// Le détail d'un nœud neuf.
fn node_detail() -> Value {
    text(
        "Le détail du nœud, facultatif : plusieurs lignes séparées par des retours à la ligne, Markdown permis.",
    )
}

/// La place d'un nœud racine : l'une de ses deux coordonnées.
fn place_param(axis: &str) -> Value {
    json!({
        "type": "number",
        "description": format!(
            "La position {axis} du coin haut gauche du nœud racine sur la carte, en points (le \
             bas est vers `y` croissant) ; donnez `place_x` et `place_y` ensemble, ou aucun pour \
             la place par défaut (x = 0, y = rang × 160)."
        ),
    })
}

pub(super) fn add_mind_map_child() -> Described {
    (
        "Ajoute un nœud comme dernier enfant d'un nœud d'une carte mentale (la touche Tab de \
         l'écran), avec les règles de MALOREAN Notes : la carte est réécrite selon son format \
         (la propriété `racines`, tenue par l'application, et le reste de l'en-tête sont \
         respectés), le texte d'avant est gardé dans l'historique des versions, l'index de \
         recherche suit ; l'écran affiche la carte à jour. Rend `path`, `node` (le chemin du \
         nœud ajouté) et `title`. Refusé, sans rien changer : titre vide ou sur plusieurs \
         lignes, nœud parent introuvable, note qui n'est pas une carte mentale.",
        input(
            json!({
                "path": map_path(),
                "node": node_param("parent"),
                "title": node_title(),
                "detail": node_detail(),
            }),
            &["path", "node", "title"],
        ),
    )
}

pub(super) fn add_mind_map_sibling() -> Described {
    (
        "Ajoute un nœud frère juste en dessous d'un nœud d'une carte mentale, chez le même parent \
         (la touche Entrée de l'écran) ; pour un nœud racine, c'est un nœud racine, posé à la \
         place par défaut de son rang (x = 0, y = rang × 160). Les nœuds frères suivants \
         changent de chemin. Même règles d'écriture qu'`add_mind_map_child`. Rend `path`, \
         `node` (le chemin du nœud ajouté) et `title`. Refusé, sans rien changer : titre vide ou \
         sur plusieurs lignes, nœud introuvable, note qui n'est pas une carte mentale.",
        input(
            json!({
                "path": map_path(),
                "node": node_param("à côté duquel ajouter"),
                "title": node_title(),
                "detail": node_detail(),
            }),
            &["path", "node", "title"],
        ),
    )
}

pub(super) fn add_mind_map_root() -> Described {
    (
        "Ajoute un nœud racine à la fin d'une carte mentale (le double-clic sur le fond de \
         l'écran) : la seule façon de commencer une carte vide. `place_x` et `place_y` disent où \
         le poser ; sans eux, il prend la place par défaut de son rang (x = 0, y = rang × 160). \
         Même règles d'écriture qu'`add_mind_map_child`. Rend `path`, `node` (le chemin du nœud \
         ajouté) et `title`. Refusé, sans rien changer : titre vide ou sur plusieurs lignes, \
         une seule des deux coordonnées, note qui n'est pas une carte mentale.",
        input(
            json!({
                "path": map_path(),
                "title": node_title(),
                "detail": node_detail(),
                "place_x": place_param("horizontale"),
                "place_y": place_param("verticale"),
            }),
            &["path", "title"],
        ),
    )
}

pub(super) fn edit_mind_map_node() -> Described {
    (
        "Change le titre et/ou le détail d'un nœud d'une carte mentale (la saisie de l'écran, \
         F2), avec les règles de MALOREAN Notes (voir `add_mind_map_child`). Ce que vous ne \
         donnez pas reste tel quel ; un `detail` vide efface le détail ; ses enfants et sa \
         couleur ne bougent pas, et son chemin non plus. Rend `path`, `node` et `title`. \
         Refusé, sans rien changer : ni `title` ni `detail` donné, titre vide ou sur plusieurs \
         lignes, nœud introuvable, note qui n'est pas une carte mentale.",
        input(
            json!({
                "path": map_path(),
                "node": node_param("à changer"),
                "title": text("Le nouveau titre, sur une seule ligne, non vide ; absent pour le garder."),
                "detail": text("Le nouveau détail, lignes séparées par des retours à la ligne ; vide pour l'effacer ; absent pour le garder."),
            }),
            &["path", "node"],
        ),
    )
}

pub(super) fn color_mind_map_node() -> Described {
    (
        "Change la couleur d'un nœud d'une carte mentale (le menu des couleurs de l'écran) : \
         l'une des 10 couleurs de la palette de l'application (rouge, orange, jaune, vert, \
         turquoise, bleu, violet, rose, marron, ardoise ; majuscules et espaces ignorés), ou \
         `aucune` pour retirer la couleur. Pas de couleur libre. Règles d'écriture d'`add_mind_map_child`. \
         Rend `path`, `node`, `title` et `color` (`aucune` si retirée). Refusé, sans rien \
         changer : couleur inconnue (l'erreur donne la palette), nœud introuvable, note qui \
         n'est pas une carte mentale.",
        input(
            json!({
                "path": map_path(),
                "node": node_param("à colorer"),
                "color": text("Un nom de la palette : `bleu`, ou `aucune` pour retirer la couleur."),
            }),
            &["path", "node", "color"],
        ),
    )
}

pub(super) fn move_mind_map_node() -> Described {
    (
        "Déplace un nœud d'une carte mentale avec toute sa branche (le glisser-déposer de \
         l'écran). `position` dit où : `child` (il devient le dernier enfant de `target`), \
         `before` ou `after` (il devient le frère de `target`, juste au-dessus ou en dessous) ou \
         `root` (il devient un nœud racine, posé à `place_x`, `place_y` ; sans eux, à la place \
         par défaut). Un nœud racine déposé avec `root` est seulement déplacé sur la carte : \
         `place_x` et `place_y` sont alors exigés. Un nœud racine déposé sur un autre nœud (ou \
         près de lui) garde sa place s'il reste nœud racine ; il la perd s'il devient enfant. Les \
         chemins des nœuds changent : relisez la carte avant de viser un autre nœud. Même règles \
         d'écriture qu'`add_mind_map_child`. Rend `path`, `node` (le nouveau chemin du nœud \
         déplacé) et `title`. Refusé, sans rien changer : nœud ou cible introuvable, dépôt sur \
         lui-même ou dans sa propre branche, `position` inconnue, `target` absent, note qui \
         n'est pas une carte mentale.",
        input(
            json!({
                "path": map_path(),
                "node": node_param("à déplacer"),
                "position": text("Où le déposer : `child`, `before`, `after` ou `root`."),
                "target": node_param("cible (pour `child`, `before` et `after`)"),
                "place_x": place_param("horizontale"),
                "place_y": place_param("verticale"),
            }),
            &["path", "node", "position"],
        ),
    )
}

pub(super) fn delete_mind_map_node() -> Described {
    (
        "Supprime un nœud d'une carte mentale avec toute sa branche (la touche Suppr de l'écran, \
         qui demande confirmation s'il a des descendants : ici rien ne la demande, soyez sûr). \
         Le texte d'avant est gardé dans l'historique des versions : l'utilisateur ou \
         `restore_version` peut le remettre. Les nœuds frères suivants changent de chemin : \
         relisez la carte avant de viser un autre nœud. Rend `path`, `node` (le chemin qu'avait \
         le nœud), `title` et `deleted` (le nombre de nœuds supprimés, lui compris). Refusé, sans \
         rien changer : nœud introuvable, note qui n'est pas une carte mentale.",
        input(
            json!({
                "path": map_path(),
                "node": node_param("à supprimer, avec sa branche"),
            }),
            &["path", "node"],
        ),
    )
}

pub(super) fn read_mind_map() -> Described {
    (
        "Lit une carte mentale (une note dont l'en-tête porte `type: carte-mentale`) en arbre, \
         pas en texte de fichier. Rend `path`, `title`, `roots` (les nœuds racines) et, pour \
         chaque nœud : `node` (son chemin dans la carte : `0` le premier nœud racine, `0.1` son \
         deuxième enfant, `1.0.2` : c'est ce chemin que les outils de modification attendent), \
         `title`, `color` (le nom de sa couleur de la palette : rouge, orange, jaune, vert, \
         turquoise, bleu, violet, rose, marron ou ardoise ; absent sans couleur), `detail` (son \
         détail, lignes séparées par des retours à la ligne ; absent sans détail), `children` \
         (ses enfants, dans l'ordre ; absent pour une feuille) et, pour un nœud racine, `place` \
         (`x`, `y` : sa position sur la carte). `nodes` et `total_nodes` comptent les nœuds donnés \
         et ceux de la carte. Au plus 50 000 caractères d'arbre : au-delà, la carte est coupée \
         dans l'ordre du fichier, `truncated` vaut true et `message` le dit. Les chemins se \
         renumérotent quand on ajoute, déplace ou supprime un nœud : relisez la carte avant de \
         viser un autre nœud après un tel changement. Les branches pliées à l'écran n'y sont pas \
         (elles ne sont pas dans le fichier). Pour la modifier : `add_mind_map_child`, \
         `add_mind_map_sibling`, `add_mind_map_root`, `edit_mind_map_node`, \
         `color_mind_map_node`, `move_mind_map_node`, `delete_mind_map_node`. Refusé si la note \
         n'est pas une carte mentale.",
        input(json!({ "path": map_path() }), &["path"]),
    )
}
