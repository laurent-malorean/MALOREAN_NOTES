# Carte mentale

Neuf outils : créer une carte mentale, la lire en arbre, et un outil par geste de l'écran pour la modifier (les **gestes de la carte mentale pour une IA**). Une carte ne s'écrit jamais à la main : `read_note` et `replace_in_note` la refusent et renvoient vers ces outils.

Le format d'une carte (en-tête `type: carte-mentale`, liste à puces, détails `> `, couleurs, propriété `racines`) est décrit dans [`doc/format/carte-mentale.md`](../format/carte-mentale.md).

Règles communes aux sept gestes :

- **Un nœud se désigne par son chemin** (`node`), tel que `read_mind_map` le donne : les rangs depuis 0 séparés par des points ; `0` est le premier nœud racine, `0.1` son deuxième enfant, `1.0.2`. Les chemins se renumérotent après un ajout, un déplacement ou une suppression : chaque geste rend le chemin du nœud touché, et l'IA relit la carte avant de viser un autre nœud.
- **Les règles de l'écran** : la carte est réécrite selon son format, la propriété `racines` est tenue par l'application (ne jamais y toucher), le reste de l'en-tête et le titre ne bougent pas ; le texte d'avant est gardé dans l'historique des versions (`restore_version` l'annule) ; l'index de recherche suit ; la carte ouverte à l'écran se met à jour.
- **Un titre de nœud** tient sur une seule ligne et n'est pas vide ; le Markdown de ligne y est permis (gras, lien `[[titre]]`…). Un **détail** peut tenir sur plusieurs lignes.
- **La palette** : rouge, orange, jaune, vert, turquoise, bleu, violet, rose, marron, ardoise ; `aucune` retire la couleur. Jamais une couleur libre.
- **Plier et déplier** n'ont pas d'outil : cet état n'est gardé que sur le Mac, les branches pliées sont dans le fichier comme les autres.
- Les étiquettes d'une carte se changent avec [`add_tags` et `remove_tags`](etiquettes-et-epingles.md).
- Les sept gestes sont **retenus par le garde-fou du web** ; `read_mind_map` ne l'est pas.
- Erreurs communes aux gestes, sans rien changer : « il manque « path » » ; « cette note n'est pas une carte mentale » ; note introuvable ; chemin de nœud mal écrit (« chemin de nœud invalide : « … » ; un chemin est fait des rangs depuis 0 séparés par des points… ») ; nœud absent (« le nœud « … » n'existe pas dans la carte (N nœuds) : relisez la carte avec read_mind_map… »).

Tous les outils de cette page acceptent le paramètre facultatif `workspace` ([règles communes](README.md#règles-communes)).

## `create_mind_map`

Crée une carte mentale selon les règles de l'application : titre `# title` en tête, nom du fichier tiré du titre (sans écraser une autre note), dans `folder`, créé avec ses parents s'il n'existe pas.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `title` | texte | oui | Le titre de la carte. |
| `folder` | texte | non | Le dossier depuis l'espace de travail ; la racine si absent ; créé avec ses parents s'il manque. |
| `content` | texte | non | La liste de départ, au format de la carte mentale : une puce `- ` par nœud, 2 espaces de retrait par niveau, `> texte` sous une puce pour son détail, ` <!-- couleur: rouge -->` au bout d'une puce pour sa couleur. Une carte vide si absent. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, le chemin de la carte créée.

**Erreurs** : « il manque « title » » ; dossier invalide ou refusé ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "create_mind_map", "arguments": {"title": "Salon 2027", "folder": "Projets",
 "content": "- Stand <!-- couleur: bleu -->\n  - Plan\n  - Mobilier\n- Communication\n  > Avant le 15 janvier"}}
```

Réponse :

```json
{"path": "Projets/salon-2027.md"}
```

## `read_mind_map`

Lit une carte mentale en arbre, pas en texte de fichier. Au plus 50 000 caractères d'arbre (titres et détails, plus 40 caractères par nœud pour sa structure) : au-delà, les nœuds qui suivent dans l'ordre du fichier ne sont pas donnés, et la réponse le dit ; les chemins donnés restent valables, et `search_notes` rend le chemin (`node`) d'un nœud manquant.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la carte : `dossier/nom.md`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** :

- `path`, `title` ;
- `roots` : les nœuds racines ; chaque nœud avec :
  - `node` : son chemin dans la carte ;
  - `title` ;
  - `color` : le nom de sa couleur de la palette ; absent sans couleur ;
  - `detail` : son détail, lignes séparées par des retours à la ligne ; absent sans détail ;
  - `place` : pour un nœud racine seulement, `x` et `y`, sa position sur la carte ;
  - `children` : ses enfants, dans l'ordre ; absent pour une feuille ;
- `nodes` et `total_nodes` : le nombre de nœuds donnés et celui de la carte entière ;
- `truncated` : `true` si la carte est coupée ;
- `message` : seulement si elle est coupée, combien de nœuds sont donnés et après quel nœud la suite manque.

**Erreurs** : « il manque « path » » ; « cette note n'est pas une carte mentale » ; note introuvable.

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "read_mind_map", "arguments": {"path": "Projets/salon-2027.md"}}
```

Réponse :

```json
{"path": "Projets/salon-2027.md", "title": "Salon 2027",
 "roots": [{"node": "0", "title": "Stand", "color": "bleu", "place": {"x": 0.0, "y": 0.0},
            "children": [{"node": "0.0", "title": "Plan"}, {"node": "0.1", "title": "Mobilier"}]},
           {"node": "1", "title": "Communication", "detail": "Avant le 15 janvier", "place": {"x": 0.0, "y": 160.0}}],
 "nodes": 4, "total_nodes": 4, "truncated": false}
```

## `add_mind_map_child`

Ajoute un nœud comme dernier enfant d'un nœud (la touche Tab de l'écran).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la carte. |
| `node` | texte | oui | Le chemin du nœud parent : `0.1`. |
| `title` | texte | oui | Le titre du nœud ajouté. |
| `detail` | texte | non | Son détail ; aucun si absent ou vide. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `node` (le chemin du nœud ajouté) et `title`.

**Erreurs** : celles des gestes ; « il manque « title » » ; titre vide (« le titre d'un nœud ne peut pas être vide ; rien n'a été changé ») ou sur plusieurs lignes (« le titre d'un nœud tient sur une seule ligne : mettez le reste dans son détail (detail) ; rien n'a été changé ») ; parent introuvable.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "add_mind_map_child", "arguments": {"path": "Projets/salon-2027.md", "node": "0", "title": "Éclairage"}}
```

Réponse :

```json
{"path": "Projets/salon-2027.md", "node": "0.2", "title": "Éclairage"}
```

## `add_mind_map_sibling`

Ajoute un nœud frère juste en dessous d'un nœud, chez le même parent (la touche Entrée de l'écran). Pour un nœud racine, le frère est un nœud racine, posé à la place par défaut de son rang (x = 0, y = rang × 160). Les frères suivants changent de chemin.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la carte. |
| `node` | texte | oui | Le chemin du nœud à côté duquel ajouter. |
| `title` | texte | oui | Le titre du nœud ajouté. |
| `detail` | texte | non | Son détail ; aucun si absent ou vide. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `node` (le chemin du nœud ajouté) et `title`.

**Erreurs** : les mêmes qu'`add_mind_map_child`.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "add_mind_map_sibling", "arguments": {"path": "Projets/salon-2027.md", "node": "0.0", "title": "Plan B",
 "detail": "Si l'allée centrale est prise"}}
```

Réponse :

```json
{"path": "Projets/salon-2027.md", "node": "0.1", "title": "Plan B"}
```

## `add_mind_map_root`

Ajoute un nœud racine à la fin de la carte (le double-clic sur le fond de l'écran) : la seule façon de commencer une carte vide. Sans `place_x` ni `place_y`, il prend la place par défaut de son rang (x = 0, y = rang × 160).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la carte. |
| `title` | texte | oui | Le titre du nœud racine. |
| `detail` | texte | non | Son détail. |
| `place_x` | nombre | non | La position horizontale de son coin haut gauche, en points. Avec `place_y`, ou aucun des deux. |
| `place_y` | nombre | non | La position verticale de son coin haut gauche, en points (le bas est vers `y` croissant). Avec `place_x`, ou aucun des deux. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `node` (le chemin du nœud ajouté) et `title`.

**Erreurs** : titre absent, vide ou sur plusieurs lignes ; une seule des deux coordonnées : « place_x et place_y vont ensemble : donnez les deux nombres, ou aucun » ; une coordonnée qui n'est pas un nombre : « « place_x » doit être un nombre ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "add_mind_map_root", "arguments": {"path": "Projets/salon-2027.md", "title": "Budget",
 "place_x": 600, "place_y": 0}}
```

Réponse :

```json
{"path": "Projets/salon-2027.md", "node": "2", "title": "Budget"}
```

## `edit_mind_map_node`

Change le titre et/ou le détail d'un nœud (la saisie de l'écran, F2). Ce qui n'est pas donné reste tel quel ; un `detail` vide efface le détail. Ses enfants, sa couleur et son chemin ne bougent pas.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la carte. |
| `node` | texte | oui | Le chemin du nœud à changer. |
| `title` | texte | non | Le nouveau titre, sur une ligne, non vide ; absent pour le garder. |
| `detail` | texte | non | Le nouveau détail ; vide pour l'effacer ; absent pour le garder. |
| `workspace` | texte | non | L'espace de travail visé. |

Au moins `title` ou `detail` est donné.

**Rend** : `path`, `node` et `title` (le titre du nœud après le changement).

**Erreurs** : celles des gestes ; ni `title` ni `detail` : « rien à changer : donnez le nouveau titre (title) ou le nouveau détail (detail) du nœud » ; titre vide ou sur plusieurs lignes.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "edit_mind_map_node", "arguments": {"path": "Projets/salon-2027.md", "node": "1",
 "detail": "Avant le 15 janvier\nAffiches et réseaux sociaux"}}
```

Réponse :

```json
{"path": "Projets/salon-2027.md", "node": "1", "title": "Communication"}
```

## `color_mind_map_node`

Change la couleur d'un nœud (le menu des couleurs de l'écran) : une couleur de la palette, majuscules et espaces ignorés, ou `aucune` pour la retirer.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la carte. |
| `node` | texte | oui | Le chemin du nœud à colorer. |
| `color` | texte | oui | Un nom de la palette (`bleu`), ou `aucune`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `node`, `title` et `color` (la couleur donnée, `aucune` si retirée).

**Erreurs** : celles des gestes ; « il manque « color » » ; couleur inconnue : « couleur inconnue : « … » ; les couleurs de la palette sont rouge, orange, jaune, vert, turquoise, bleu, violet, rose, marron, ardoise, et « aucune » retire la couleur ; rien n'a été changé ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "color_mind_map_node", "arguments": {"path": "Projets/salon-2027.md", "node": "2", "color": "vert"}}
```

Réponse :

```json
{"path": "Projets/salon-2027.md", "node": "2", "title": "Budget", "color": "vert"}
```

## `move_mind_map_node`

Déplace un nœud avec toute sa branche (le glisser-déposer de l'écran). `position` dit où :

- `child` : il devient le dernier enfant de `target` ;
- `before` ou `after` : il devient le frère de `target`, juste au-dessus ou en dessous ;
- `root` : il devient un nœud racine, posé à `place_x`, `place_y`, ou à la place par défaut sans eux. Un nœud déjà racine déposé avec `root` est seulement déplacé sur la carte : `place_x` et `place_y` sont alors exigés.

Un nœud racine déposé près d'un autre nœud garde sa place s'il reste nœud racine ; il la perd s'il devient enfant. Les chemins changent : relire la carte avant de viser un autre nœud.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la carte. |
| `node` | texte | oui | Le chemin du nœud à déplacer. |
| `position` | texte | oui | `child`, `before`, `after` ou `root`. |
| `target` | texte | pour `child`, `before`, `after` | Le chemin du nœud cible. |
| `place_x` | nombre | non | Avec `root` seulement : la position horizontale. Avec `place_y`, ou aucun. |
| `place_y` | nombre | non | Avec `root` seulement : la position verticale. Avec `place_x`, ou aucun. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `node` (le nouveau chemin du nœud déplacé) et `title`.

**Erreurs** : celles des gestes ; « il manque « position » » ; position inconnue : « position inconnue : « … » ; `child` (dernier enfant de target), `before` ou `after` (frère de target, juste au-dessus ou en dessous) ou `root` (nœud racine) » ; « il manque « target » » ; dépôt sur lui-même ou dans sa propre branche : « un nœud ne se déplace ni sur lui-même ni dans sa propre branche ; rien n'a été changé » ; `place_x` ou `place_y` avec une autre position que `root` : « place_x et place_y ne servent qu'avec position root : sur un autre nœud, la place vient de la cible » ; nœud racine déposé avec `root` sans place : « un nœud racine déplacé sur le fond a besoin de sa nouvelle place : donnez place_x et place_y ; rien n'a été changé ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "move_mind_map_node", "arguments": {"path": "Projets/salon-2027.md", "node": "2",
 "position": "child", "target": "0"}}
```

Réponse :

```json
{"path": "Projets/salon-2027.md", "node": "0.3", "title": "Budget"}
```

## `delete_mind_map_node`

Supprime un nœud avec toute sa branche (la touche Suppr de l'écran, qui demande confirmation s'il a des descendants ; ici rien ne la demande). Le texte d'avant est gardé dans l'historique des versions : l'utilisateur ou `restore_version` peut le remettre. Les frères suivants changent de chemin.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la carte. |
| `node` | texte | oui | Le chemin du nœud à supprimer, avec sa branche. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `node` (le chemin qu'avait le nœud), `title` et `deleted` (le nombre de nœuds supprimés, lui compris).

**Erreurs** : celles des gestes.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "delete_mind_map_node", "arguments": {"path": "Projets/salon-2027.md", "node": "0.1"}}
```

Réponse :

```json
{"path": "Projets/salon-2027.md", "node": "0.1", "title": "Mobilier", "deleted": 1}
```

## Références

- [0050](../decisions/0050-carte-mentale.md) : la carte mentale.
- [0080](../decisions/0080-carte-mentale-par-le-mcp.md) : la carte mentale par le MCP, lecture en arbre et gestes.
