# Canvas

Douze outils, les **outils du canvas** : créer un canvas vide, le lire comme des données, et un outil par geste de l'interface pour le changer (cartes, flèches, groupes). Un canvas (fichier `.canvas`) ne se lit ni ne se change comme une note : `read_note` et `replace_in_note` le refusent et renvoient vers ces outils.

Le format d'un canvas (JSON Canvas, identifiants, couleurs, propriétés inconnues gardées) est décrit dans [`doc/format/canvas.md`](../format/canvas.md).

Règles communes aux dix gestes :

- **Les règles de l'interface** : le canvas est lu, sa version d'avant est gardée dans l'historique des versions (`list_versions` et `restore_version` annulent un changement), le geste est appliqué, puis le canvas est enregistré comme par l'interface (fusion si le fichier a changé entre-temps) ; l'index suit et le canvas ouvert à l'écran se met à jour. Un geste refusé n'écrit rien.
- **Les identifiants** sont ceux du format (16 chiffres hexadécimaux), donnés par `read_canvas` ; ils ne sont jamais réutilisés.
- **Une couleur** est un nom exact de la palette de l'application : rouge, orange, jaune, vert, turquoise, bleu, violet, rose, marron, ardoise ; `aucune` retire la couleur. Jamais un hexadécimal. Sinon : « « … » n'est pas une couleur de la palette : rouge, orange, …, ou « aucune » pour retirer la couleur ».
- **Positions et tailles** sont des entiers de -1 000 000 000 à 1 000 000 000 ; une taille vaut au moins 1. `x`, `y` désignent le coin haut gauche, l'axe `y` vers le bas.
- **Un groupe** est une carte de type `group` ; les cartes qui en font partie sont celles entièrement dans son cadre.
- Les étiquettes d'un canvas (propriété `tags` à la racine du fichier) se changent avec [`add_tags` et `remove_tags`](etiquettes-et-epingles.md).
- Les onze outils qui écrivent (`create_canvas` et les dix gestes) sont **retenus par le garde-fou du web** ; `read_canvas` ne l'est pas.
- Erreurs communes aux gestes : « il manque « path » » ; « ce fichier n'est pas un canvas » ; canvas introuvable ; carte ou flèche introuvable (l'erreur donne la liste des identifiants) ; un nombre qui n'est pas entier (« « x » doit être un nombre entier ») ; un texte qui n'en est pas un (« « label » doit être un texte »).

Tous les outils de cette page acceptent le paramètre facultatif `workspace` ([règles communes](README.md#règles-communes)).

## `create_canvas`

Crée un canvas vide, comme « Nouveau canvas » de l'interface : nom du fichier tiré du titre en kebab-case avec l'extension `.canvas` (sans écraser un autre canvas), dans `folder`, créé avec ses parents s'il n'existe pas. On le remplit ensuite avec `add_canvas_card`, `add_canvas_arrow` et `add_canvas_group`, jamais en écrivant le fichier.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `title` | texte | oui | Le titre du canvas, dont le nom du fichier est tiré ; non vide. |
| `folder` | texte | non | Le dossier depuis l'espace de travail ; la racine si absent ; créé avec ses parents s'il manque. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, le chemin du canvas créé.

**Erreurs** : « il manque « title » » ; dossier invalide ou refusé (rien n'est créé) ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "create_canvas", "arguments": {"title": "Parcours client", "folder": "Projets"}}
```

Réponse :

```json
{"path": "Projets/parcours-client.canvas"}
```

## `read_canvas`

Lit un canvas comme des données, jamais le JSON du fichier. Les propriétés inconnues du fichier ne sont pas montrées (elles sont gardées à l'écriture). Taille bornée : 150 cartes, 150 flèches et 20 000 caractères de texte de cartes pour tout le canvas ; au-delà, la lecture est coupée et le dit. Les cartes et flèches données se changent normalement.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du canvas : `dossier/nom.canvas`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** :

- `path` ; `title` (le nom du fichier, extension comprise) ; `tags` (les étiquettes) ;
- `card_count` et `arrow_count` : les totaux du canvas entier ;
- `cards` : les cartes, du fond au premier plan ; chacune avec :
  - `id`, `type` (`text`, `file`, `link` ou `group`), `x`, `y`, `width`, `height` ;
  - `color` : le nom dans la palette, ou `null` ; `other_color` : la valeur écrite d'une couleur hors palette (canvas venu d'ailleurs) ;
  - pour une carte texte : `text` (Markdown), et `text_truncated` s'il est coupé ;
  - pour une carte de fichier : `file` (note, canvas ou média de l'espace) et `subpath` (son ancre, s'il y en a une) ;
  - pour une carte de page web : `url` ;
  - pour un groupe : `label` (son nom) et `members` (les identifiants des cartes entièrement dans son cadre) ;
- `arrows` : les flèches ; chacune avec `id`, `from` et `to` (identifiants de cartes), `from_side` et `to_side` (`top`, `right`, `bottom`, `left`, ou `null`), `from_end` et `to_end` (`none` ou `arrow`), `sense` (`none`, `single`, `both`, ou `null` pour une pointe au seul départ), `label`, `color` et `other_color` ;
- `truncated` ; `message` : seulement si la lecture est coupée, ce qui manque (cartes, flèches, textes coupés).

**Erreurs** : « il manque « path » » ; « ce fichier n'est pas un canvas » ; canvas introuvable.

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "read_canvas", "arguments": {"path": "Projets/parcours-client.canvas"}}
```

Réponse :

```json
{"path": "Projets/parcours-client.canvas", "title": "parcours-client.canvas", "tags": ["client"],
 "card_count": 2, "arrow_count": 1,
 "cards": [{"id": "6f0c2a9e41b7d385", "type": "text", "x": 0, "y": 0, "width": 250, "height": 60, "color": "bleu", "text": "Premier contact"},
           {"id": "a14e9b03c7d26f58", "type": "file", "x": 400, "y": 0, "width": 400, "height": 300, "color": null, "file": "Clients/acme.md"}],
 "arrows": [{"id": "3c8d1e7f02a9b645", "from": "6f0c2a9e41b7d385", "to": "a14e9b03c7d26f58", "from_side": "right", "to_side": "left",
             "from_end": "none", "to_end": "arrow", "sense": "single", "color": null}],
 "truncated": false}
```

## `add_canvas_card`

Ajoute une carte au premier plan, comme l'interface : une carte texte, une carte de fichier ou une carte de page web. Un groupe s'ajoute avec `add_canvas_group`. Sans `width` ni `height`, la carte a la taille d'une carte neuve de l'interface : 250 × 60 pour un texte, 400 × 300 pour un fichier ou une page web.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du canvas. |
| `type` | texte | oui | `text`, `file` ou `link`. |
| `x` | entier | oui | La position horizontale du coin haut gauche. |
| `y` | entier | oui | La position verticale du coin haut gauche. |
| `text` | texte | non | Pour `text` : le texte en Markdown ; vide si absent. |
| `file` | texte | pour `file` | Le fichier depuis la racine de l'espace : une note, un canvas, une image ou un PDF qui existe. |
| `url` | texte | pour `link` | L'adresse, en `http://`, `https://` ou `mailto:`. |
| `width` | entier | non | La largeur ; celle d'une carte neuve de son type si absente. |
| `height` | entier | non | La hauteur ; celle d'une carte neuve de son type si absente. |
| `color` | texte | non | Une couleur de la palette, ou `aucune`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `card`, la carte comme `read_canvas` la donne, avec son nouvel `id`.

**Erreurs** : celles des gestes ; « il manque « type » », « il manque « x » »… ; type inconnu : « « … » n'est pas un type de carte : « text », « file » ou « link » (un groupe s'ajoute avec add_canvas_group) » ; fichier absent ; adresse invalide ; position ou taille hors limites ; couleur hors palette.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "add_canvas_card", "arguments": {"path": "Projets/parcours-client.canvas", "type": "link",
 "x": 900, "y": 0, "url": "https://exemple.fr/offre", "color": "vert"}}
```

Réponse :

```json
{"path": "Projets/parcours-client.canvas", "card": {"id": "d2b7f4a91e06c835", "type": "link", "x": 900, "y": 0,
 "width": 400, "height": 300, "color": "vert", "url": "https://exemple.fr/offre"}}
```

## `change_canvas_card`

Change une carte : son `text` (carte texte), son `url` (carte de page web), son `file` (carte de fichier ; l'ancre est alors retirée) ou sa `color`, au moins l'un. Un champ qui ne va pas avec le type de la carte est refusé et l'erreur nomme le type ; un groupe se change avec `change_canvas_group`.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du canvas. |
| `id` | texte | oui | L'identifiant de la carte. |
| `text` | texte | non | Le nouveau texte d'une carte texte ; vide pour l'effacer. |
| `url` | texte | non | La nouvelle adresse d'une carte de page web. |
| `file` | texte | non | Le nouveau fichier d'une carte de fichier, depuis la racine de l'espace. |
| `color` | texte | non | Une couleur de la palette, ou `aucune`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `card`.

**Erreurs** : celles des gestes ; aucun champ donné : « rien à changer : donnez au moins l'un de « text », « url », « file », « color » » ; champ qui ne va pas avec le type ; fichier absent ; adresse invalide ; couleur hors palette.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "change_canvas_card", "arguments": {"path": "Projets/parcours-client.canvas", "id": "6f0c2a9e41b7d385",
 "text": "Premier contact\n\n*salon ou site*"}}
```

Réponse :

```json
{"path": "Projets/parcours-client.canvas", "card": {"id": "6f0c2a9e41b7d385", "type": "text", "x": 0, "y": 0,
 "width": 250, "height": 60, "color": "bleu", "text": "Premier contact\n\n*salon ou site*"}}
```

## `move_canvas_card`

Déplace une carte : `x` et `y` sont la nouvelle position de son coin haut gauche. Pour un groupe, les cartes qui en font partie suivent.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du canvas. |
| `id` | texte | oui | L'identifiant de la carte. |
| `x` | entier | oui | La nouvelle position horizontale. |
| `y` | entier | oui | La nouvelle position verticale. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `moved`, les identifiants des cartes déplacées, la carte demandée d'abord.

**Erreurs** : celles des gestes ; position hors limites.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "move_canvas_card", "arguments": {"path": "Projets/parcours-client.canvas", "id": "a14e9b03c7d26f58", "x": 400, "y": 200}}
```

Réponse :

```json
{"path": "Projets/parcours-client.canvas", "moved": ["a14e9b03c7d26f58"]}
```

## `resize_canvas_card`

Redimensionne une carte : son coin haut gauche ne bouge pas, aucune autre carte ne bouge. Un groupe rendu plus petit laisse sortir les cartes qui ne sont plus entièrement dans son cadre.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du canvas. |
| `id` | texte | oui | L'identifiant de la carte. |
| `width` | entier | oui | La nouvelle largeur, d'au moins 1. |
| `height` | entier | oui | La nouvelle hauteur, d'au moins 1. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `card`.

**Erreurs** : celles des gestes ; taille inférieure à 1 ou hors limites.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "resize_canvas_card", "arguments": {"path": "Projets/parcours-client.canvas", "id": "6f0c2a9e41b7d385", "width": 320, "height": 120}}
```

Réponse :

```json
{"path": "Projets/parcours-client.canvas", "card": {"id": "6f0c2a9e41b7d385", "type": "text", "x": 0, "y": 0,
 "width": 320, "height": 120, "color": "bleu", "text": "Premier contact"}}
```

## `remove_canvas_card`

Retire une carte, avec les flèches qui y touchent, comme l'interface. Pour un groupe, seul le cadre disparaît : les cartes qui en faisaient partie restent.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du canvas. |
| `id` | texte | oui | L'identifiant de la carte. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `removed` (l'identifiant de la carte) et `removed_arrows` (ceux des flèches retirées avec elle).

**Erreurs** : celles des gestes.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "remove_canvas_card", "arguments": {"path": "Projets/parcours-client.canvas", "id": "a14e9b03c7d26f58"}}
```

Réponse :

```json
{"path": "Projets/parcours-client.canvas", "removed": "a14e9b03c7d26f58", "removed_arrows": ["3c8d1e7f02a9b645"]}
```

## `add_canvas_arrow`

Ajoute une flèche entre deux cartes différentes (un groupe compris). Sans `sense`, une pointe à l'arrivée ; sans côté, il est déduit des positions des cartes. `label` est écrit au milieu de la ligne.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du canvas. |
| `from` | texte | oui | L'identifiant de la carte de départ. |
| `to` | texte | oui | L'identifiant de la carte d'arrivée. |
| `from_side` | texte | non | `top`, `right`, `bottom` ou `left` : le côté de départ (au milieu du côté) ; déduit si absent. |
| `to_side` | texte | non | Le côté d'arrivée, mêmes valeurs ; déduit si absent. |
| `sense` | texte | non | `none` (un trait), `single` (une pointe vers la carte d'arrivée, le défaut) ou `both` (une pointe à chaque bout). |
| `label` | texte | non | L'étiquette de la flèche ; vide : aucune. |
| `color` | texte | non | Une couleur de la palette, ou `aucune`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `arrow`, la flèche comme `read_canvas` la donne, avec son nouvel `id`.

**Erreurs** : celles des gestes ; « il manque « from » » ou « il manque « to » » ; même carte aux deux bouts ; côté inconnu (« « … » n'est pas un côté (« from_side ») : « top », « right », « bottom » ou « left » ») ; sens inconnu ; couleur hors palette.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "add_canvas_arrow", "arguments": {"path": "Projets/parcours-client.canvas",
 "from": "6f0c2a9e41b7d385", "to": "d2b7f4a91e06c835", "label": "relance à J+7"}}
```

Réponse :

```json
{"path": "Projets/parcours-client.canvas", "arrow": {"id": "9e2a6c0d4b81f73e", "from": "6f0c2a9e41b7d385",
 "to": "d2b7f4a91e06c835", "from_side": "right", "to_side": "left", "from_end": "none", "to_end": "arrow",
 "sense": "single", "label": "relance à J+7", "color": null}}
```

## `change_canvas_arrow`

Change une flèche, au moins un champ : `sense`, `label` (vide : la retire), `color`, ou une extrémité reconnectée (`from` ou `to`, une autre carte). Le côté de l'extrémité déplacée est déduit des positions, sauf si `from_side` ou `to_side` le donne.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du canvas. |
| `id` | texte | oui | L'identifiant de la flèche. |
| `sense` | texte | non | `none`, `single` ou `both`. |
| `label` | texte | non | La nouvelle étiquette ; vide pour la retirer. |
| `color` | texte | non | Une couleur de la palette, ou `aucune`. |
| `from` | texte | non | La nouvelle carte de départ. |
| `from_side` | texte | non | Le côté de départ : `top`, `right`, `bottom` ou `left`. |
| `to` | texte | non | La nouvelle carte d'arrivée. |
| `to_side` | texte | non | Le côté d'arrivée. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `arrow`.

**Erreurs** : celles des gestes ; aucun champ donné : « rien à changer : donnez au moins l'un de « sense », « label », « color », « from », « from_side », « to », « to_side » » ; même carte aux deux bouts ; côté ou sens inconnu ; couleur hors palette.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "change_canvas_arrow", "arguments": {"path": "Projets/parcours-client.canvas", "id": "9e2a6c0d4b81f73e",
 "sense": "both", "color": "rouge"}}
```

Réponse :

```json
{"path": "Projets/parcours-client.canvas", "arrow": {"id": "9e2a6c0d4b81f73e", "from": "6f0c2a9e41b7d385",
 "to": "d2b7f4a91e06c835", "from_side": "right", "to_side": "left", "from_end": "arrow", "to_end": "arrow",
 "sense": "both", "label": "relance à J+7", "color": "rouge"}}
```

## `remove_canvas_arrow`

Retire une flèche ; les cartes restent.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du canvas. |
| `id` | texte | oui | L'identifiant de la flèche. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `removed`, l'identifiant de la flèche.

**Erreurs** : celles des gestes.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "remove_canvas_arrow", "arguments": {"path": "Projets/parcours-client.canvas", "id": "9e2a6c0d4b81f73e"}}
```

Réponse :

```json
{"path": "Projets/parcours-client.canvas", "removed": "9e2a6c0d4b81f73e"}
```

## `add_canvas_group`

Ajoute un groupe (un cadre), sous les autres cartes. Soit `cards`, une liste d'identifiants de cartes : le groupe les entoure avec une marge de 20 ; soit `x` et `y` : un groupe vide à cet endroit, de 400 × 300 sans `width` ni `height`. Pas les deux.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du canvas. |
| `cards` | liste de textes | soit `cards`… | Les identifiants des cartes à entourer, non vide. |
| `x` | entier | …soit `x` et `y` | La position horizontale du coin haut gauche d'un groupe vide. |
| `y` | entier | …soit `x` et `y` | La position verticale du coin haut gauche d'un groupe vide. |
| `width` | entier | non | La largeur d'un groupe vide ; 400 si absente. |
| `height` | entier | non | La hauteur d'un groupe vide ; 300 si absente. |
| `label` | texte | non | Le nom du groupe. |
| `color` | texte | non | Une couleur de la palette, ou `aucune`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `card`, le groupe avec ses `members`.

**Erreurs** : celles des gestes ; `cards` avec `x`, `y`, `width` ou `height` : « donnez soit « cards » (le groupe entoure ces cartes), soit « x » et « y » (un groupe vide à cet endroit), pas les deux » ; ni l'un ni l'autre : « donnez soit « cards » (le groupe entoure ces cartes), soit « x » et « y » (un groupe vide à cet endroit) » ; `cards` qui n'est pas une liste de textes ; liste vide ; carte à entourer introuvable ; position ou taille hors limites ; couleur hors palette.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "add_canvas_group", "arguments": {"path": "Projets/parcours-client.canvas",
 "cards": ["6f0c2a9e41b7d385", "d2b7f4a91e06c835"], "label": "Avant-vente", "color": "violet"}}
```

Réponse :

```json
{"path": "Projets/parcours-client.canvas", "card": {"id": "07e5c9b2a1d48f36", "type": "group", "x": -20, "y": -20,
 "width": 1340, "height": 340, "color": "violet", "label": "Avant-vente",
 "members": ["6f0c2a9e41b7d385", "d2b7f4a91e06c835"]}}
```

## `change_canvas_group`

Change un groupe : son nom `label` (vide : le retire) et/ou sa `color`, au moins l'un. Sa position et sa taille se changent avec `move_canvas_card` et `resize_canvas_card`.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du canvas. |
| `id` | texte | oui | L'identifiant du groupe. |
| `label` | texte | non | Le nouveau nom ; vide pour le retirer. |
| `color` | texte | non | Une couleur de la palette, ou `aucune`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `card`.

**Erreurs** : celles des gestes ; aucun champ donné : « rien à changer : donnez au moins l'un de « label », « color » » ; la carte n'est pas un groupe ; couleur hors palette.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "change_canvas_group", "arguments": {"path": "Projets/parcours-client.canvas", "id": "07e5c9b2a1d48f36", "label": "Prospection"}}
```

Réponse :

```json
{"path": "Projets/parcours-client.canvas", "card": {"id": "07e5c9b2a1d48f36", "type": "group", "x": -20, "y": -20,
 "width": 1340, "height": 340, "color": "violet", "label": "Prospection",
 "members": ["6f0c2a9e41b7d385", "d2b7f4a91e06c835"]}}
```

## Références

- [0079](../decisions/0079-canvas-par-le-mcp.md) : le canvas par le MCP, lecture en données et gestes.
- [0087](../decisions/0087-creer-un-canvas-par-le-mcp.md) : créer un canvas par le MCP.
