# Notes

Six outils pour lire, créer, changer, renommer, ranger et jeter une note. Une note simple se lit avec `read_note` et se change avec `replace_in_note` ; les autres contenus (cahier de recherche, carte mentale, canvas, CRM et ses fiches) ont leurs outils, et ces deux outils les refusent en les nommant.

Le format d'une note (en-tête, titre `#`, liens) est décrit dans [`doc/format/note.md`](../format/note.md) ; le nom des fichiers, la corbeille, les pièces jointes et l'historique dans [`doc/format/espace-de-travail.md`](../format/espace-de-travail.md).

Tous les outils de cette page acceptent le paramètre facultatif `workspace` ([règles communes](README.md#règles-communes)).

## `read_note`

Le texte entier d'une note simple, pour le lire ou en recopier un texte exact (l'`old_text` de `replace_in_note`). L'en-tête est rendu à part du corps, tel qu'il est écrit : `header` suivi de `body` redonne le fichier à l'identique.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note depuis l'espace de travail : `dossier/nom.md`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** :

- `path`, `title` ;
- `header` : l'en-tête (les propriétés) tel qu'il est écrit, ses deux lignes `---` comprises ; vide si la note n'en a pas ;
- `body` : tout le reste ;
- `characters` : le nombre de caractères du corps entier ;
- `truncated` : `true` si le corps est coupé ;
- `message` : seulement si le corps est coupé. Au-delà de 60 000 caractères, le corps est coupé à la fin de sa dernière ligne entière et le message dit combien de caractères sont donnés sur combien ; la suite ne se lit pas avec cet outil (`search_notes` en donne des extraits). Jamais de coupure silencieuse.

**Erreurs** :

- « il manque « path » » ; chemin invalide ; note introuvable (« la note « … » n'existe pas ») ;
- un cahier de recherche : « cette note est un cahier de recherche : read_note ne lit que les notes simples ; on y ajoute une entrée avec add_entry, et ses entrées se retrouvent avec search_notes ou search_by_meaning » ;
- une carte mentale : la phrase renvoie à `read_mind_map` ;
- un canvas : la phrase renvoie à `read_canvas` et aux outils du canvas ;
- un CRM ou une fiche de CRM : la phrase renvoie à `read_crm` et aux outils du CRM (pour une fiche, avec son type) ;
- un fichier qui n'est pas du texte UTF-8 : « la note « … » n'est pas un texte lisible (UTF-8) : elle n'est pas ouverte, pour ne pas l'abîmer ».

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "read_note", "arguments": {"path": "Projets/budget-2027.md"}}
```

Réponse :

```json
{"path": "Projets/budget-2027.md", "title": "Budget 2027",
 "header": "---\ntags: [budget]\n---\n", "body": "# Budget 2027\n\nMarge visée : 12 %.\n",
 "characters": 36, "truncated": false}
```

## `create_note`

Crée une note selon les règles de l'application : le titre `# title` en tête, `text` dessous, le nom du fichier tiré du titre (en kebab-case, avec un suffixe `-2`, `-3`… si le nom est pris : jamais une note écrasée). Le dossier est créé avec ses parents s'il n'existe pas. Une note est du Markdown : un canvas se crée avec `create_canvas`, un cahier de recherche avec `create_research_notebook`, une carte mentale avec `create_mind_map`, un CRM avec `create_crm`.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `title` | texte | oui | Le titre de la note. |
| `folder` | texte | non | Le dossier depuis l'espace de travail : `Travail/Projets` ; la racine si absent ; créé avec ses parents s'il manque. |
| `text` | texte | non | Le texte de la note, en Markdown, sous son titre ; une note avec son seul titre si absent. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, le chemin de la note créée.

**Erreurs** : « il manque « title » » (titre absent ou vide) ; dossier invalide ou refusé (mêmes règles que [`create_folder`](dossiers.md#create_folder)) ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "create_note", "arguments": {"title": "Compte rendu du 26 novembre", "folder": "Réunions",
 "text": "## Présents\n\n- Laure\n- Malik\n\n## Décisions\n\n- Budget validé."}}
```

Réponse :

```json
{"path": "Réunions/compte-rendu-du-26-novembre.md"}
```

## `replace_in_note`

Remplace un texte par un autre dans une note simple, avec les règles de la saisie : le texte d'avant est gardé dans l'historique des versions, l'index suit, le reste de la note ne bouge pas.

- `old_text` se recopie à l'identique (majuscules, accents, espaces, retours à la ligne) : jamais un motif. Il est cherché dans tout le fichier, en-tête compris : lire d'abord la note avec `read_note`.
- Pour insérer, remplacer une ligne par elle-même suivie du nouveau texte ; pour supprimer, donner un `new_text` vide.
- Si le remplacement change le titre `# …`, le fichier est renommé d'après le nouveau titre : utiliser ensuite le `path` rendu, et penser aux notes qui la lient (voir `rename_note`).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note : `dossier/nom.md`. |
| `old_text` | texte | oui | Le texte à remplacer, exact, sur une ou plusieurs lignes ; jamais vide. Pris tel quel, espaces compris. |
| `new_text` | texte | oui | Le nouveau texte ; vide permis, pour supprimer `old_text`. Pris tel quel. |
| `replace_all` | booléen | non | `true` pour remplacer toutes les occurrences ; `false` par défaut, qui refuse un texte présent plusieurs fois. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` (changé si le titre l'est), `title` (le titre après le remplacement) et `replacements` (le nombre de remplacements).

**Erreurs** (rien n'est changé) :

- « il manque « old_text » » ou « il manque « new_text » » (champ absent) ;
- `old_text` vide : « le texte à remplacer (old_text) est vide : recopiez à l'identique le texte à changer » ;
- identique à `new_text` : « le nouveau texte (new_text) est identique au texte à remplacer (old_text) : rien à changer » ;
- introuvable : « le texte à remplacer (old_text) est introuvable dans la note : recopiez-le à l'identique, avec ses majuscules, ses accents, ses espaces et ses retours à la ligne ; rien n'a été changé » ;
- répété sans `replace_all` : « le texte à remplacer (old_text) apparaît N fois (…) : ajoutez du texte autour pour qu'il n'apparaisse qu'une fois, ou passez replace_all à true pour remplacer toutes les occurrences ; rien n'a été changé » ; la parenthèse donne les premières lignes où il commence, 5 au plus ;
- un cahier de recherche : « cette note est un cahier de recherche : on n'y ajoute que des entrées (add_entry), son texte ne se remplace jamais » ;
- une carte mentale, un canvas, un CRM ou une fiche de CRM : la phrase nomme les outils à utiliser à la place ;
- note introuvable.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "replace_in_note", "arguments": {"path": "Projets/budget-2027.md",
 "old_text": "Marge visée : 12 %.", "new_text": "Marge visée : 14 %, validée le 26 novembre."}}
```

Réponse :

```json
{"path": "Projets/budget-2027.md", "title": "Budget 2027", "replacements": 1}
```

## `rename_note`

Change le titre d'une note : la ligne du titre `#` est remplacée par `# title` (ou ajoutée en tête du corps s'il n'y en a pas), puis la note est enregistrée comme par la saisie : son fichier prend le nom tiré du nouveau titre (suffixe `-2`, `-3`… si le nom est pris), son dossier de pièces jointes est renommé et ses liens vers ses pièces jointes suivent. L'outil rend aussi les notes dont un lien `[[ancien titre]]` la visait : ces liens ne sont pas réécrits, à reprendre avec `read_note` et `replace_in_note` si besoin.

> **À n'utiliser que sur une note simple.** L'outil passe par l'enregistrement d'une note, pas par le renommage de l'écran : il ne refuse aucune sorte de contenu. Sur une fiche de CRM, il renomme son fichier (que les autres fiches désignent par son nom) ; sur un CRM, il renomme la note sans son dossier de fiches ; sur un canvas, il écrit une ligne `# titre` dans le fichier JSON et lui donne un nom en `.md`. Pour un CRM et ses fiches, passer par les outils du CRM (`change_crm_person` avec `rename`…).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note : `dossier/nom.md`. |
| `title` | texte | oui | Le nouveau titre (les espaces autour sont retirés). |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** :

- `path` : le nouveau chemin de la note ;
- `linking_notes_to_update` : les notes dont un lien visait l'ancien titre, chacune avec `path`, `title`, `folder` et, pour une fiche de CRM, `contentType` et `crm`.

**Erreurs** : « il manque « path » » ou « il manque « title » » ; note introuvable ; nom pris entre-temps (« le nom « … » est déjà pris ») ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "rename_note", "arguments": {"path": "Projets/budget-2027.md", "title": "Budget 2027 validé"}}
```

Réponse :

```json
{"path": "Projets/budget-2027-valide.md",
 "linking_notes_to_update": [{"path": "Réunions/2026-11-20.md", "title": "Réunion du 20 novembre", "folder": "Réunions"}]}
```

## `move_note`

Range une note dans un autre dossier, avec ses pièces jointes et son historique ; elle garde son nom, ou reçoit le premier suffixe `-2`, `-3`… libre si le nom est pris. Un CRM emporte ses fiches : son dossier de fiches le suit et prend le même suffixe que lui ; une note ordinaire rangée dans le dossier des fiches reste en place.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note : `dossier/nom.md`. |
| `folder` | texte | oui (schéma) | Le dossier d'arrivée depuis l'espace de travail ; `""` pour la racine. Le schéma l'exige, mais un `folder` absent vaut aussi la racine. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, le nouveau chemin.

**Erreurs** : « il manque « path » » ; note introuvable ; dossier d'arrivée invalide ou introuvable (« le dossier « … » n'existe pas ») ; note illisible ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "move_note", "arguments": {"path": "Inbox/idee-de-salon.md", "folder": "Projets/Salons"}}
```

Réponse :

```json
{"path": "Projets/Salons/idee-de-salon.md"}
```

## `trash_note`

Met une note à la corbeille de l'application, avec ses pièces jointes et son historique : jamais effacée, l'utilisateur la restaure. Un CRM part avec ses fiches (entreprises, personnes, actions, projets, avec leurs pièces jointes) : leur dossier entier s'il ne contient que des fiches, sinon les fiches seules ; il revient avec elles à la restauration. Une note ordinaire rangée dans le dossier des fiches reste en place.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note : `dossier/nom.md`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `trashed`, le chemin de la note dans la corbeille : son chemin d'origine, avec le premier suffixe `-2`, `-3`… libre si une note jetée avant elle y porte déjà ce nom.

**Erreurs** : « il manque « path » » ; note introuvable ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "trash_note", "arguments": {"path": "Inbox/brouillon.md"}}
```

Réponse :

```json
{"trashed": "Inbox/brouillon.md"}
```

## Références

- [0040](../decisions/0040-outils-de-l-application-pour-claude.md) : les outils de l'application.
- [0075](../decisions/0075-modifier-le-texte-d-une-note-par-le-mcp.md) : `replace_in_note`.
- [0076](../decisions/0076-lire-le-texte-d-une-note-par-le-mcp.md) : `read_note`.
- [0090](../decisions/0090-renommer-un-contenu.md) : renommer un contenu à l'écran (que `rename_note` ne suit pas).
- [0091](../decisions/0091-supprimer-un-crm-avec-ses-fiches.md) : jeter et déplacer un CRM avec ses fiches.
