//! Ce que l'IA lit des outils du canvas (fiche 0079) : leurs descriptions, dans les mots de
//! l'application (carte, flèche, groupe), et l'entrée qu'ils attendent.

use domain::mind_map::PALETTE;
use serde_json::{Value, json};

use super::{Described, folder, input, text};

fn canvas_path() -> Value {
    text("Chemin du canvas depuis l'espace de travail : `dossier/nom.canvas`.")
}

fn card_id() -> Value {
    text("L'identifiant de la carte, tel que `read_canvas` le donne.")
}

fn arrow_id() -> Value {
    text("L'identifiant de la flèche, tel que `read_canvas` le donne.")
}

fn integer(description: &str) -> Value {
    json!({ "type": "integer", "description": description })
}

fn color() -> Value {
    text(&format!(
        "Une couleur de la palette de l'application : {} ; `aucune` retire la couleur. Aucune \
         autre couleur (pas d'hexadécimal).",
        PALETTE.join(", ")
    ))
}

fn side(which: &str) -> Value {
    json!({
        "type": "string",
        "enum": ["top", "right", "bottom", "left"],
        "description": format!("Le côté {which} où la flèche s'accroche (au milieu du côté) ; déduit des positions des cartes si absent."),
    })
}

fn sense() -> Value {
    json!({
        "type": "string",
        "enum": ["none", "single", "both"],
        "description": "Le sens : `none` (un trait), `single` (une pointe vers la seconde carte, le défaut), `both` (une pointe à chaque bout).",
    })
}

pub(super) fn read_canvas() -> Described {
    (
        "Lit un canvas (fichier `.canvas`) comme des données, sans le JSON du fichier. Rend \
         `path`, `title` (le nom du fichier), `tags` (les étiquettes), `card_count` et \
         `arrow_count` (les totaux), `cards`, `arrows`, `truncated`. Chaque carte : `id`, `type` \
         (`text`, `file`, `link` ou `group`), `x`, `y` (le coin haut gauche, axe y vers le \
         bas), `width`, `height`, `color` (nom dans la palette de l'application) ou \
         `other_color` (valeur écrite d'une couleur hors palette, venue d'ailleurs), puis `text` \
         (carte texte, en Markdown), `file` et `subpath` (carte de fichier : note, canvas ou \
         média de l'espace), `url` (carte de page web), ou, pour un groupe, `label` (son nom) \
         et `members` (les identifiants des cartes entièrement dans son cadre). Chaque flèche : \
         `id`, `from` et `to` (identifiants de cartes), `from_side` et `to_side` (`top`, \
         `right`, `bottom`, `left`), `from_end` et `to_end` (`none` ou `arrow`), `sense` (`none`, \
         `single`, `both` ; vide pour une pointe au seul départ), `label`, `color`. Les cartes \
         sont du fond au premier plan. Borné : 150 cartes, 150 flèches et 20 000 caractères de \
         texte de cartes au plus ; au-delà, `truncated` vaut true et `message` dit ce qui \
         manque (jamais de coupure silencieuse). Refusé si le fichier n'est pas un canvas \
         valide.",
        input(json!({ "path": canvas_path() }), &["path"]),
    )
}

pub(super) fn create_canvas() -> Described {
    (
        "Crée un canvas vide (un fichier `.canvas`) comme le fait « Nouveau canvas » de MALOREAN \
         Notes : nom du fichier tiré du titre (sans écraser un autre canvas), dans `folder` (la \
         racine par défaut ; créé avec ses parents s'il n'existe pas). Le titre n'est pas vide. \
         Rend son chemin. Ensuite, le canvas se remplit avec `add_canvas_card`, \
         `add_canvas_arrow` et `add_canvas_group` (jamais en écrivant le fichier à la main), se \
         lit avec `read_canvas` et se change avec les autres outils du canvas.",
        input(
            json!({
                "title": text("Le titre du canvas, dont le nom du fichier est tiré."),
                "folder": folder(),
            }),
            &["title"],
        ),
    )
}

pub(super) fn add_canvas_card() -> Described {
    (
        "Ajoute une carte à un canvas, au premier plan, comme le fait l'interface. `type` : \
         `text` (carte texte, `text` en Markdown, vide permis), `file` (carte de fichier : \
         `file`, le chemin depuis la racine de l'espace d'une note, d'un canvas, d'une image ou \
         d'un PDF qui existe) ou `link` (carte de page web : `url` en `http://`, `https://` ou \
         `mailto:`). `x` et `y` : le coin haut gauche ; `width` et `height` facultatifs (carte \
         neuve de l'interface sans eux : 250 × 60 pour un texte, 400 × 300 pour un fichier ou \
         une page web). Un groupe s'ajoute avec `add_canvas_group`. Rend `path` et `card` (la \
         carte comme `read_canvas` la donne, avec son nouvel `id`). Le texte d'avant est gardé \
         dans l'historique des versions : `list_versions` et `restore_version` annulent le \
         changement. Refusé, sans rien changer, avec une erreur qui dit quoi faire : fichier \
         absent, adresse invalide, position ou taille hors limites (entiers de -1 000 000 000 à \
         1 000 000 000, taille d'au moins 1), couleur hors palette.",
        input(
            json!({
                "path": canvas_path(),
                "type": json!({ "type": "string", "enum": ["text", "file", "link"], "description": "Le type de carte." }),
                "x": integer("La position horizontale du coin haut gauche."),
                "y": integer("La position verticale du coin haut gauche."),
                "text": text("Le texte (Markdown) d'une carte texte ; vide si absent."),
                "file": text("Le fichier d'une carte de fichier, depuis la racine de l'espace : `Dossier/note.md`."),
                "url": text("L'adresse d'une carte de page web : `https://exemple.fr`."),
                "width": integer("La largeur ; celle d'une carte neuve de son type si absente."),
                "height": integer("La hauteur ; celle d'une carte neuve de son type si absente."),
                "color": color(),
            }),
            &["path", "type", "x", "y"],
        ),
    )
}

pub(super) fn change_canvas_card() -> Described {
    (
        "Change une carte d'un canvas : son `text` (carte texte), son `url` (carte de page web), \
         son `file` (carte de fichier : l'ancre est retirée) ou sa `color`, au moins l'un. Un \
         champ qui ne va pas avec le type de la carte est refusé et l'erreur nomme le type ; un \
         groupe se change avec `change_canvas_group`. Rend `path` et `card`. Le texte d'avant est \
         gardé dans l'historique des versions. Refusé, sans rien changer : carte introuvable (la \
         liste des identifiants est donnée), fichier absent, adresse invalide, couleur hors \
         palette.",
        input(
            json!({
                "path": canvas_path(),
                "id": card_id(),
                "text": text("Le nouveau texte d'une carte texte ; vide pour l'effacer."),
                "url": text("La nouvelle adresse d'une carte de page web."),
                "file": text("Le nouveau fichier d'une carte de fichier, depuis la racine de l'espace."),
                "color": color(),
            }),
            &["path", "id"],
        ),
    )
}

pub(super) fn move_canvas_card() -> Described {
    (
        "Déplace une carte d'un canvas : `x` et `y` sont la nouvelle position de son coin haut \
         gauche. Pour un groupe, les cartes qui en font partie (entièrement dans son cadre) \
         suivent. Rend `path` et `moved` (les identifiants des cartes déplacées, la carte \
         demandée d'abord). Le texte d'avant est gardé dans l'historique des versions. Refusé, \
         sans rien changer : carte introuvable, position hors limites.",
        input(
            json!({
                "path": canvas_path(),
                "id": card_id(),
                "x": integer("La nouvelle position horizontale du coin haut gauche."),
                "y": integer("La nouvelle position verticale du coin haut gauche."),
            }),
            &["path", "id", "x", "y"],
        ),
    )
}

pub(super) fn resize_canvas_card() -> Described {
    (
        "Redimensionne une carte d'un canvas : sa nouvelle `width` et sa nouvelle `height` ; son \
         coin haut gauche ne bouge pas et aucune autre carte ne bouge (une carte fait partie d'un \
         groupe quand elle est entièrement dans son cadre : un groupe plus petit en laisse \
         sortir). Rend `path` et `card`. Le texte d'avant est gardé dans l'historique des \
         versions. Refusé, sans rien changer : carte introuvable, taille inférieure à 1 ou hors \
         limites.",
        input(
            json!({
                "path": canvas_path(),
                "id": card_id(),
                "width": integer("La nouvelle largeur, d'au moins 1."),
                "height": integer("La nouvelle hauteur, d'au moins 1."),
            }),
            &["path", "id", "width", "height"],
        ),
    )
}

pub(super) fn remove_canvas_card() -> Described {
    (
        "Retire une carte d'un canvas, avec les flèches qui y touchent (comme l'interface). Pour \
         un groupe, seul le cadre disparaît : les cartes qui en faisaient partie restent. Rend \
         `path`, `removed` (l'identifiant de la carte) et `removed_arrows` (celui des flèches \
         retirées). Le texte d'avant est gardé dans l'historique des versions : `restore_version` \
         annule. Refusé : carte introuvable.",
        input(
            json!({ "path": canvas_path(), "id": card_id() }),
            &["path", "id"],
        ),
    )
}

pub(super) fn add_canvas_arrow() -> Described {
    (
        "Ajoute une flèche entre deux cartes différentes d'un canvas : `from` (départ) et `to` \
         (arrivée) sont des identifiants de cartes, un groupe compris. Sans `sense`, une pointe à \
         l'arrivée ; sans côté, ils sont déduits des positions. `label` est écrit au milieu de la \
         ligne. Rend `path` et `arrow` (la flèche comme `read_canvas` la donne, avec son nouvel \
         `id`). Le texte d'avant est gardé dans l'historique des versions. Refusé, sans rien \
         changer : carte introuvable, même carte aux deux bouts, couleur hors palette.",
        input(
            json!({
                "path": canvas_path(),
                "from": text("L'identifiant de la carte de départ."),
                "to": text("L'identifiant de la carte d'arrivée."),
                "from_side": side("de départ"),
                "to_side": side("d'arrivée"),
                "sense": sense(),
                "label": text("L'étiquette de la flèche ; vide : aucune."),
                "color": color(),
            }),
            &["path", "from", "to"],
        ),
    )
}

pub(super) fn change_canvas_arrow() -> Described {
    (
        "Change une flèche d'un canvas, au moins un champ : `sense`, `label` (vide : la retire), \
         `color`, ou une extrémité reconnectée (`from` ou `to`, une autre carte ; le côté de \
         l'extrémité déplacée est déduit des positions sauf si `from_side` ou `to_side` le \
         donne). Rend `path` et `arrow`. Le texte d'avant est gardé dans l'historique des \
         versions. Refusé, sans rien changer : flèche ou carte introuvable, même carte aux deux \
         bouts, couleur hors palette.",
        input(
            json!({
                "path": canvas_path(),
                "id": arrow_id(),
                "sense": sense(),
                "label": text("La nouvelle étiquette ; vide pour la retirer."),
                "color": color(),
                "from": text("La nouvelle carte de départ."),
                "from_side": side("de départ"),
                "to": text("La nouvelle carte d'arrivée."),
                "to_side": side("d'arrivée"),
            }),
            &["path", "id"],
        ),
    )
}

pub(super) fn remove_canvas_arrow() -> Described {
    (
        "Retire une flèche d'un canvas ; les cartes restent. Rend `path` et `removed` (son \
         identifiant). Le texte d'avant est gardé dans l'historique des versions. Refusé : \
         flèche introuvable.",
        input(
            json!({ "path": canvas_path(), "id": arrow_id() }),
            &["path", "id"],
        ),
    )
}

pub(super) fn add_canvas_group() -> Described {
    (
        "Ajoute un groupe (un cadre) à un canvas, sous les autres cartes. Soit `cards`, une \
         liste d'identifiants de cartes : le groupe les entoure avec une marge de 20 ; soit `x` \
         et `y` (le coin haut gauche) : un groupe vide, de 400 × 300 sans `width` et `height`. \
         Pas les deux. `label` est son nom, `color` sa couleur. Rend `path` et `card` (le \
         groupe, avec ses `members`). Le texte d'avant est gardé dans l'historique des \
         versions. Refusé, sans rien changer : carte à entourer introuvable, liste vide, \
         position ou taille hors limites, couleur hors palette.",
        input(
            json!({
                "path": canvas_path(),
                "cards": json!({ "type": "array", "items": { "type": "string" }, "description": "Les identifiants des cartes à entourer." }),
                "x": integer("La position horizontale du coin haut gauche d'un groupe vide."),
                "y": integer("La position verticale du coin haut gauche d'un groupe vide."),
                "width": integer("La largeur d'un groupe vide ; 400 si absente."),
                "height": integer("La hauteur d'un groupe vide ; 300 si absente."),
                "label": text("Le nom du groupe."),
                "color": color(),
            }),
            &["path"],
        ),
    )
}

pub(super) fn change_canvas_group() -> Described {
    (
        "Change un groupe d'un canvas : son nom `label` (vide : le retire) et/ou sa `color`, au \
         moins l'un. Pour changer sa position ou sa taille, utilisez `move_canvas_card` et \
         `resize_canvas_card`. Rend `path` et `card`. Le texte d'avant est gardé dans l'historique \
         des versions. Refusé, sans rien changer : la carte n'est pas un groupe, introuvable, \
         couleur hors palette.",
        input(
            json!({
                "path": canvas_path(),
                "id": text("L'identifiant du groupe, tel que `read_canvas` le donne."),
                "label": text("Le nouveau nom ; vide pour le retirer."),
                "color": color(),
            }),
            &["path", "id"],
        ),
    )
}
