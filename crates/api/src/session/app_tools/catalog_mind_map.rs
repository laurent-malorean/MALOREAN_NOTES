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
