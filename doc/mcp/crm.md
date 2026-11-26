# CRM

Seize outils : créer un CRM, le lire comme des données, et les quatorze **outils du CRM** qui le changent (actions, personnes, entreprises, projets, étapes), avec les règles et les cas d'usage de l'interface.

Un CRM est une note (`type: crm`) ; ses entreprises, personnes, actions et projets sont des **fiches**, des notes rangées dans des dossiers qui portent le nom de son fichier (`clients/actions/`, `clients/personnes/`… pour `clients.md`). Les fiches ne se lisent ni ne s'écrivent à la main : `read_note` et `replace_in_note` les refusent. Leur format est décrit dans [`doc/format/crm.md`](../format/crm.md).

Règles communes :

- **Un CRM se désigne par son chemin** (`path`) ; les CRM d'un espace se listent avec `search_notes` (`content_type` : `crm`).
- **Une fiche se désigne par sa référence** (`ref`), rendue par `read_crm` : le nom de son fichier sans extension (`2026-11-26-relance-du-devis-acme`, `jean-dupont`). Une référence inconnue donne : « Cette fiche n'existe plus. Vérifiez la référence avec read_crm : c'est le `ref` de la fiche. »
- **Un seul geste par appel** : le changement d'une fiche prend une `operation` qui nomme le geste de l'interface ; une opération inconnue donne « « … » n'est pas une opération de change_crm_… : … » avec la liste des opérations.
- **Les colonnes du Kanban** sont `TODO`, les étapes du CRM, `Done` et `Cancel` ; le statut d'une action se change avec `move_crm_action`, avec le nom exact d'une colonne.
- **Une couleur** est un nom de la palette de l'application (rouge, orange, jaune, vert, turquoise, bleu, violet, rose, marron, ardoise ; majuscules et espaces ignorés), jamais un hexadécimal.
- **Un jour** s'écrit `2026-11-24`.
- **Un canal** est l'un de : appel, e-mail, rendez-vous, courrier, salon, réseau social, autre (majuscules et accents ignorés).
- **Une suppression** met la fiche à la corbeille (jamais effacée) et nettoie les fiches qui la nomment, comme l'interface. Ne rien supprimer sans que l'utilisateur le demande.
- **Un compte rendu** sur une action s'ajoute en commentaire (`add_comment`) plutôt qu'en réécrivant sa description.
- **L'historique** : chaque fiche changée garde sa version d'avant dans l'historique des versions.
- **Les étiquettes** d'une fiche se changent avec [`add_tags` et `remove_tags`](etiquettes-et-epingles.md), sur le chemin de sa fiche (`fiche`, rendu par `read_crm` et par les outils de création).
- **Le nom d'un fichier de fiche** ne se change jamais, et les dossiers de fiches ne se renomment, ne se déplacent ni ne se jettent à la main. Un CRM se range avec `move_note` et se jette avec `trash_note`, qui emportent ses fiches.
- Les messages d'erreur sont ceux de l'interface, en français. Un appel refusé ne change rien.
- `create_crm` et les quatorze outils qui changent un CRM sont **retenus par le garde-fou du web** ; `read_crm` ne l'est pas.
- Erreurs communes : « il manque « path » » ; « cette note n'est pas un CRM » ; CRM introuvable ; un champ liste qui n'est pas une liste de textes (« « people » est une liste de textes »).

Tous les outils de cette page acceptent le paramètre facultatif `workspace` ([règles communes](README.md#règles-communes)).

## `create_crm`

Crée un CRM selon les règles de l'application : titre `# title` en tête, nom du fichier tiré du titre (sans écraser une autre note), dans `folder`, créé avec ses parents s'il n'existe pas. Ensuite, le CRM se lit avec `read_crm` et se change avec les outils du CRM.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `title` | texte | oui | Le titre du CRM, sur une ligne, non vide. |
| `folder` | texte | non | Le dossier depuis l'espace de travail ; la racine si absent ; créé avec ses parents s'il manque. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, le chemin du CRM créé.

**Erreurs** : « il manque « title » » ; titre sur plusieurs lignes (« Le nom tient sur une seule ligne. » ; rien n'est créé, pas même le dossier) ; dossier invalide ou refusé ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "create_crm", "arguments": {"title": "Clients", "folder": "Commercial"}}
```

Réponse :

```json
{"path": "Commercial/clients.md"}
```

## `read_crm`

Lit un CRM comme des données, sans les fichiers de ses fiches : ce que montre l'écran, par le même calcul. Les filtres de l'écran sont facultatifs et s'ajoutent : une action n'est rendue que si elle répond à tous.

Taille bornée en caractères écrits, partie par partie : 34 000 pour les actions, 16 000 pour les personnes, 10 000 pour les entreprises, 6 000 pour les projets. Au-delà, la lecture est coupée, `truncated` vaut `true` et `message` dit ce qui manque et comment avancer (filtrer, ou chercher avec `search_notes`) ; une fiche dont un texte est coupé porte `text_truncated`.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM : `dossier/clients.md`. |
| `search` | texte | non | Un mot cherché dans le titre, la description et les commentaires des actions. |
| `person` | texte | non | La référence d'une personne : seules ses actions. |
| `company` | texte | non | La référence d'une entreprise, ou `NODATA` pour les personnes sans entreprise : seules les actions d'une de ses personnes (l'entreprise du moment où elles ont été données à l'action). |
| `projects` | liste de textes | non | Des références de projets : seules leurs actions (une action sans projet est alors masquée). |
| `tags` | liste de textes | non | Des étiquettes : les actions qui portent au moins l'une d'elles. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** :

- `path`, `title`, `today` (le jour du Mac) ;
- `stages` : les étapes, entre `TODO` et `Done` ;
- `tags` : les étiquettes des actions ;
- `columns` : une par statut, dans l'ordre `TODO`, les étapes, `Done`, `Cancel` ; chacune avec `status` (le nom à donner à `move_crm_action`), `closed`, `count` et `late` (les cartes de la colonne et celles en retard, filtres ou non) et `actions` (les cartes visibles, dans l'ordre de la colonne) ;
- chaque action : `ref`, `fiche` (le chemin de sa note), `title`, `status`, `date`, `late_days` (en retard de tant de jours) ou `due_today`, `people` (chacune avec `ref` et `company`, son entreprise du moment où on l'a donnée), `project` (référence), `channel`, `color`, `tags`, `linked_notes` (titres de notes), `description`, `checklists` (`index`, `name`, `items` avec `index`, `done`, `text`) et `comments` (`index`, `at`, `text`, dans l'ordre écrit) ; ce qui est vide manque ;
- `people` : chaque personne avec `ref`, `fiche`, `name`, `role`, `company` (référence ; absente pour NODATA), `career` (`company`, `from`, `to`), `email`, `phone`, `linkedin`, `notes`, `tally` (`open`, `late`, `today`) ;
- `companies` : chaque entreprise avec `ref`, `fiche`, `name`, `site`, `sector`, `address`, `phone`, `notes`, `people` (références), `tally` ;
- `projects` : chaque projet avec `ref`, `fiche`, `name`, `color`, `tags`, `tally` ;
- `nodata` : NODATA, les personnes sans entreprise : `people` et `tally` ;
- `unreadable` : les fiches illisibles laissées de côté, s'il y en a ;
- `truncated` et, si la lecture est coupée, `message`.

**Erreurs** : celles communes ; « « projects » est une liste de textes » ou « « tags » est une liste de textes ».

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "read_crm", "arguments": {"path": "Commercial/clients.md", "company": "acme"}}
```

Réponse (abrégée) :

```json
{"path": "Commercial/clients.md", "title": "Clients", "today": "2026-11-26", "stages": ["Devis"], "tags": ["devis"],
 "columns": [{"status": "TODO", "closed": false, "count": 1, "late": 0,
              "actions": [{"ref": "2026-11-26-relance-du-devis-acme",
                           "fiche": "Commercial/clients/actions/2026-11-26-relance-du-devis-acme.md",
                           "title": "Relance du devis Acme", "status": "TODO", "date": "2026-11-26", "due_today": true,
                           "people": [{"ref": "jean-dupont", "company": "acme"}], "channel": "appel", "tags": ["devis"]}]},
             {"status": "Devis", "closed": false, "count": 0, "late": 0, "actions": []},
             {"status": "Done", "closed": true, "count": 0, "late": 0, "actions": []},
             {"status": "Cancel", "closed": true, "count": 0, "late": 0, "actions": []}],
 "people": [{"ref": "jean-dupont", "fiche": "Commercial/clients/personnes/jean-dupont.md", "name": "Jean Dupont",
             "company": "acme", "career": [{"company": "acme", "from": "2026-03-01"}], "tally": {"open": 1, "late": 0, "today": 1}}],
 "companies": [{"ref": "acme", "fiche": "Commercial/clients/entreprises/acme.md", "name": "Acme", "people": ["jean-dupont"],
                "tally": {"open": 1, "late": 0, "today": 1}}],
 "projects": [], "nodata": {"people": [], "tally": {"open": 0, "late": 0, "today": 0}}, "truncated": false}
```

## `create_crm_action`

Crée une action, comme la fenêtre d'une action de l'interface : `title` seul suffit ; sans `date`, c'est aujourd'hui, sans `status`, `TODO`. Chaque personne donnée entre avec son entreprise de ce moment.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `title` | texte | oui | Le titre de l'action, sur une ligne, non vide. |
| `status` | texte | non | Le nom d'une colonne du CRM (`TODO`, une étape, `Done`, `Cancel`) ; `TODO` si absent. |
| `date` | texte | non | Le jour où l'action est à faire, ou a été faite : `2026-11-24` ; aujourd'hui si absent. |
| `people` | liste de textes | non | Les références des personnes de l'action. |
| `channel` | texte | non | Le canal. |
| `project` | texte | non | La référence du projet de l'action. |
| `color` | texte | non | Une couleur de la palette. |
| `tags` | liste de textes | non | Les étiquettes de l'action, sans `#`. |
| `linked_notes` | liste de textes | non | Les titres des notes liées à l'action. |
| `description` | texte | non | La description, en Markdown. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `ref` (la référence de l'action) et `fiche` (le chemin de sa note).

**Erreurs** : celles communes ; « il manque « title » » (champ absent) ; titre vide ou sur plusieurs lignes ; `status` qui n'est pas une colonne du CRM (« « … » n'est pas une colonne de ce CRM ») ; personne ou projet qui n'existe pas (« Cette fiche n'existe plus. … ») ; couleur hors palette (« « … » n'est pas une couleur de la palette ») ; canal inconnu (« « … » n'est pas un canal ») ; jour invalide.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "create_crm_action", "arguments": {"path": "Commercial/clients.md", "title": "Relance du devis Acme",
 "people": ["jean-dupont"], "channel": "appel", "tags": ["devis"], "description": "Devis envoyé le 12 novembre."}}
```

Réponse :

```json
{"path": "Commercial/clients.md", "ref": "2026-11-26-relance-du-devis-acme",
 "fiche": "Commercial/clients/actions/2026-11-26-relance-du-devis-acme.md"}
```

## `change_crm_action`

Change une action par un geste de la fenêtre d'une action, avec les règles et les messages de l'interface ; un seul geste par appel, désigné par `operation`. Une liste à cocher, un élément et un commentaire se désignent par leur `index` (à partir de 0) tel que `read_crm` le donne. Le statut se change avec `move_crm_action`, les étiquettes avec `add_tags` et `remove_tags`.

Les opérations et les champs qu'elles prennent :

- `title` : `title`, le nouveau titre ;
- `date` : `date`, le nouveau jour ;
- `channel` : `channel` ; vide pour retirer le canal ;
- `project` : `project`, une référence ; vide pour « Sans projet » ;
- `color` : `color` ; vide pour retirer la couleur ;
- `linked_notes` : `linked_notes`, la liste entière des titres de notes liées ;
- `add_person`, `remove_person` : `person`, une référence ;
- `description` : `text` remplace la description ;
- `add_checklist` : `name` ;
- `rename_checklist` : `list`, `name` ;
- `remove_checklist` : `list` ;
- `add_item` : `list`, `text` ;
- `edit_item` : `list`, `item`, `text` ;
- `check_item` : `list`, `item`, `done` ;
- `remove_item` : `list`, `item` ;
- `add_comment` : `text`, daté de maintenant ;
- `edit_comment` : `comment`, `text` ;
- `remove_comment` : `comment`.

Les champs de texte d'une opération sont exigés présents ; ceux qu'on peut vider (`channel`, `project`, `color`) acceptent le texte vide.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `action` | texte | oui | La référence de l'action. |
| `operation` | texte | oui | L'une des 19 opérations ci-dessus. |
| `title` | texte | selon l'opération | Le nouveau titre. |
| `date` | texte | selon l'opération | Le nouveau jour, `2026-11-24`. |
| `channel` | texte | selon l'opération | Le canal ; vide pour le retirer. |
| `project` | texte | selon l'opération | La référence du projet ; vide pour « Sans projet ». |
| `color` | texte | selon l'opération | Un nom de la palette ; vide pour retirer la couleur. |
| `linked_notes` | liste de textes | selon l'opération | La liste entière des titres de notes liées ; vide si absente. |
| `person` | texte | selon l'opération | La référence de la personne. |
| `text` | texte | selon l'opération | Le texte : description, élément ou commentaire. |
| `name` | texte | selon l'opération | Le nom de la liste à cocher. |
| `list` | entier | selon l'opération | L'`index` de la liste à cocher, à partir de 0. |
| `item` | entier | selon l'opération | L'`index` de l'élément dans sa liste, à partir de 0. |
| `done` | booléen | selon l'opération | `true` pour cocher l'élément, `false` pour le décocher. |
| `comment` | entier | selon l'opération | L'`index` du commentaire, à partir de 0, dans l'ordre écrit. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `action`, l'action comme `read_crm` la donne ensuite.

**Erreurs** : celles communes ; « il manque « action » », « il manque « operation » » ; opération inconnue ; champ de l'opération absent (« il manque « text » ») ; index qui n'est pas un entier à partir de 0 (« « list » doit être un entier à partir de 0 ») ; « il manque « done » (true pour cocher, false pour décocher) » ; action introuvable ; titre vide ; jour invalide ; couleur ou canal inconnu ; personne ou projet introuvable ; liste, élément ou commentaire qui n'existe pas.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "change_crm_action", "arguments": {"path": "Commercial/clients.md", "action": "2026-11-26-relance-du-devis-acme",
 "operation": "add_comment", "text": "Jean rappelle lundi : le devis passe en comité."}}
```

Réponse (abrégée) :

```json
{"path": "Commercial/clients.md", "action": {"ref": "2026-11-26-relance-du-devis-acme", "title": "Relance du devis Acme",
 "status": "TODO", "comments": [{"index": 0, "at": "2026-11-26 10:42", "text": "Jean rappelle lundi : le devis passe en comité."}]}}
```

## `move_crm_action`

Met une action dans une colonne du Kanban, comme glisser sa carte : son statut devient `status` et son rang s'efface. Sans `before` ni `at_end`, la carte prend sa place par sa date ; avec `before`, elle se place juste avant cette carte ; avec `at_end`, tout en bas. Une colonne terminée (`Done`, `Cancel`) ne se range pas à la main : la place demandée y est ignorée.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `action` | texte | oui | La référence de l'action. |
| `status` | texte | oui | Le nom de la colonne d'arrivée (majuscules et accents ignorés). |
| `before` | texte | non | La référence de la carte de la colonne devant laquelle placer l'action. |
| `at_end` | booléen | non | `true` pour placer l'action tout en bas ; `false` par défaut. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `action`, l'action comme `read_crm` la donne ensuite.

**Erreurs** : celles communes ; action introuvable ; `status` qui n'est pas une colonne de ce CRM ; `before` avec `at_end` : « donnez soit « before » (juste avant cette carte), soit « at_end » (tout en bas), pas les deux » ; `at_end` qui n'est pas un booléen (« « at_end » doit être true ou false »).

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "move_crm_action", "arguments": {"path": "Commercial/clients.md", "action": "2026-11-26-relance-du-devis-acme", "status": "Devis"}}
```

Réponse (abrégée) :

```json
{"path": "Commercial/clients.md", "action": {"ref": "2026-11-26-relance-du-devis-acme", "title": "Relance du devis Acme", "status": "Devis"}}
```

## `delete_crm_action`

Met une action à la corbeille de l'application, avec ses pièces jointes : jamais effacée, l'utilisateur la restaure comme une note.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `action` | texte | oui | La référence de l'action. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `deleted`, la référence.

**Erreurs** : celles communes ; « il manque « action » » ; action introuvable.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "delete_crm_action", "arguments": {"path": "Commercial/clients.md", "action": "2026-11-20-salon-de-lyon"}}
```

Réponse :

```json
{"path": "Commercial/clients.md", "deleted": "2026-11-20-salon-de-lyon"}
```

## `create_crm_person`

Crée une personne, comme « Nouvelle personne » de l'interface. Avec `company`, la personne entre dans cette entreprise le jour même et son parcours le dit ; sans elle, elle est dans NODATA. Les autres champs se donnent ensuite avec `change_crm_person`.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `name` | texte | oui | Le nom entier (prénom et nom). Refusé s'il est vide, sur plusieurs lignes ou déjà celui d'une autre personne du CRM (majuscules, accents et ponctuation ignorés). |
| `company` | texte | non | La référence de son entreprise ; NODATA si absent. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `ref` (la référence de la personne) et `fiche` (le chemin de sa note).

**Erreurs** : celles communes ; « il manque « name » » (champ absent) ; « Le nom est vide. » ; « Le nom tient sur une seule ligne. » ; « Une autre fiche porte déjà ce nom. » ; entreprise introuvable.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "create_crm_person", "arguments": {"path": "Commercial/clients.md", "name": "Jean Dupont", "company": "acme"}}
```

Réponse :

```json
{"path": "Commercial/clients.md", "ref": "jean-dupont", "fiche": "Commercial/clients/personnes/jean-dupont.md"}
```

## `change_crm_person`

Change une personne par un geste de l'interface ; un seul par appel, désigné par `operation` :

- `rename` : `name`, le nom entier ; refusé s'il est vide ou déjà pris ;
- `field` : `field` (`role`, `email`, `phone` ou `linkedin`) et `value` ; une valeur vide retire le champ ;
- `notes` : `notes` remplace les notes libres (Markdown) ;
- `company` (« Changer d'entreprise ») : `company`, la référence de la nouvelle entreprise, vide pour NODATA ; `day`, le jour du changement, aujourd'hui si absent ; l'ancien passage du parcours est fermé à ce jour.

Un e-mail déjà celui d'une autre personne n'est pas refusé : la réponse porte `warning` (« cet e-mail est déjà celui d'une autre personne du CRM (risque de doublon) ; il est gardé »).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `person` | texte | oui | La référence de la personne. |
| `operation` | texte | oui | `rename`, `field`, `notes` ou `company`. |
| `name` | texte | pour `rename` | Le nouveau nom entier. |
| `field` | texte | pour `field` | `role`, `email`, `phone` ou `linkedin`. |
| `value` | texte | pour `field` | La valeur du champ ; vide pour le retirer. |
| `notes` | texte | pour `notes` | Les notes libres, en Markdown. |
| `company` | texte | pour `company` | La référence de la nouvelle entreprise ; vide pour NODATA. |
| `day` | texte | non | Le jour du changement d'entreprise, `2026-11-24` ; aujourd'hui si absent. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `person` (la personne comme `read_crm` la donne ensuite) et, si l'e-mail est déjà connu, `warning`.

**Erreurs** : celles communes ; « il manque « person » », « il manque « operation » » ; opération inconnue ; champ de l'opération absent ; personne ou entreprise introuvable ; nom refusé ; champ inconnu ; jour invalide.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "change_crm_person", "arguments": {"path": "Commercial/clients.md", "person": "jean-dupont",
 "operation": "field", "field": "email", "value": "jean.dupont@acme.example"}}
```

Réponse (abrégée) :

```json
{"path": "Commercial/clients.md", "person": {"ref": "jean-dupont", "fiche": "Commercial/clients/personnes/jean-dupont.md",
 "name": "Jean Dupont", "company": "acme", "email": "jean.dupont@acme.example", "tally": {"open": 1, "late": 0, "today": 1}}}
```

## `delete_crm_person`

Met une personne à la corbeille (jamais effacée : l'utilisateur la restaure) et la retire de la liste des personnes de chacune de ses actions ; les actions restent.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `person` | texte | oui | La référence de la personne. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `deleted`, la référence.

**Erreurs** : celles communes ; « il manque « person » » ; personne introuvable.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "delete_crm_person", "arguments": {"path": "Commercial/clients.md", "person": "jean-dupont"}}
```

Réponse :

```json
{"path": "Commercial/clients.md", "deleted": "jean-dupont"}
```

## `create_crm_company`

Crée une entreprise, comme « Nouvelle entreprise » de l'interface. Les autres champs se donnent ensuite avec `change_crm_company`.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `name` | texte | oui | Le nom de l'entreprise. Refusé s'il est vide, sur plusieurs lignes ou déjà celui d'une autre entreprise du CRM (majuscules, accents et ponctuation ignorés). |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `ref` (la référence de l'entreprise) et `fiche` (le chemin de sa note).

**Erreurs** : celles communes ; « il manque « name » » ; « Le nom est vide. » ; « Le nom tient sur une seule ligne. » ; « Une autre fiche porte déjà ce nom. ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "create_crm_company", "arguments": {"path": "Commercial/clients.md", "name": "Acme"}}
```

Réponse :

```json
{"path": "Commercial/clients.md", "ref": "acme", "fiche": "Commercial/clients/entreprises/acme.md"}
```

## `change_crm_company`

Change une entreprise par un geste de l'interface ; un seul par appel, désigné par `operation` :

- `rename` : `name` ; refusé s'il est vide ou déjà pris ;
- `field` : `field` (`site`, `sector`, `address` ou `phone`) et `value` ; une valeur vide retire le champ ;
- `notes` : `notes` remplace les notes libres (Markdown).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `company` | texte | oui | La référence de l'entreprise. |
| `operation` | texte | oui | `rename`, `field` ou `notes`. |
| `name` | texte | pour `rename` | Le nouveau nom. |
| `field` | texte | pour `field` | `site`, `sector`, `address` ou `phone`. |
| `value` | texte | pour `field` | La valeur du champ ; vide pour le retirer. |
| `notes` | texte | pour `notes` | Les notes libres, en Markdown. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `company`, l'entreprise comme `read_crm` la donne ensuite.

**Erreurs** : celles communes ; « il manque « company » », « il manque « operation » » ; opération inconnue ; champ de l'opération absent ; entreprise introuvable ; nom refusé ; champ inconnu.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "change_crm_company", "arguments": {"path": "Commercial/clients.md", "company": "acme",
 "operation": "field", "field": "site", "value": "https://acme.example"}}
```

Réponse (abrégée) :

```json
{"path": "Commercial/clients.md", "company": {"ref": "acme", "fiche": "Commercial/clients/entreprises/acme.md",
 "name": "Acme", "site": "https://acme.example", "people": ["jean-dupont"], "tally": {"open": 1, "late": 0, "today": 1}}}
```

## `delete_crm_company`

Met une entreprise à la corbeille (jamais effacée : l'utilisateur la restaure). Chacune de ses personnes passe à NODATA : son parcours garde l'entreprise, fermée ce jour-là ; les actions gardent l'entreprise du moment.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `company` | texte | oui | La référence de l'entreprise. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `deleted`, la référence.

**Erreurs** : celles communes ; « il manque « company » » ; entreprise introuvable.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "delete_crm_company", "arguments": {"path": "Commercial/clients.md", "company": "acme"}}
```

Réponse :

```json
{"path": "Commercial/clients.md", "deleted": "acme"}
```

## `create_crm_project`

Crée un projet, comme « Nouveau projet » de l'interface. Sa couleur est la moins utilisée du CRM, comme dans l'interface ; `change_crm_project` la change.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `name` | texte | oui | Le nom du projet. Refusé s'il est vide, sur plusieurs lignes ou déjà celui d'un autre projet du CRM (majuscules, accents et ponctuation ignorés). |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `ref` (la référence du projet) et `fiche` (le chemin de sa note).

**Erreurs** : celles communes ; « il manque « name » » ; « Le nom est vide. » ; « Le nom tient sur une seule ligne. » ; « Une autre fiche porte déjà ce nom. ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "create_crm_project", "arguments": {"path": "Commercial/clients.md", "name": "Salon 2027"}}
```

Réponse :

```json
{"path": "Commercial/clients.md", "ref": "salon-2027", "fiche": "Commercial/clients/projets/salon-2027.md"}
```

## `change_crm_project`

Change un projet par un geste de l'interface ; un seul par appel, désigné par `operation` :

- `rename` : `name` ; refusé s'il est vide ou déjà pris ; ses actions le suivent sans rien changer ;
- `color` : `color`, une couleur de la palette.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `project` | texte | oui | La référence du projet. |
| `operation` | texte | oui | `rename` ou `color`. |
| `name` | texte | pour `rename` | Le nouveau nom. |
| `color` | texte | pour `color` | Une couleur de la palette. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `project`, le projet comme `read_crm` le donne ensuite.

**Erreurs** : celles communes ; « il manque « project » », « il manque « operation » » ; opération inconnue ; champ de l'opération absent ; projet introuvable ; nom refusé ; couleur hors palette.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "change_crm_project", "arguments": {"path": "Commercial/clients.md", "project": "salon-2027",
 "operation": "color", "color": "orange"}}
```

Réponse :

```json
{"path": "Commercial/clients.md", "project": {"ref": "salon-2027", "fiche": "Commercial/clients/projets/salon-2027.md",
 "name": "Salon 2027", "color": "orange", "tally": {"open": 0, "late": 0, "today": 0}}}
```

## `delete_crm_project`

Met un projet à la corbeille (jamais effacé : l'utilisateur le restaure) ; ses actions passent à « Sans projet », jamais supprimées.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `project` | texte | oui | La référence du projet. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `deleted`, la référence.

**Erreurs** : celles communes ; « il manque « project » » ; projet introuvable.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "delete_crm_project", "arguments": {"path": "Commercial/clients.md", "project": "salon-2027"}}
```

Réponse :

```json
{"path": "Commercial/clients.md", "deleted": "salon-2027"}
```

## `change_crm_stages`

Change les étapes du CRM, les colonnes du Kanban entre `TODO` et `Done` ; un seul geste par appel, désigné par `operation` :

- `add` : `name`, une nouvelle étape, ajoutée avant `Done` ;
- `rename` : `from`, le nom actuel, et `to`, le nouveau ; les actions de l'étape la suivent et gardent leur rang ;
- `remove` : `name` ; ses actions repartent en `TODO`, leur rang s'efface ;
- `move` : `name` et `index`, la nouvelle place à partir de 0 parmi les étapes.

Le changement touche plusieurs fichiers (le CRM et les actions) : tous ensemble, ou aucun. Un nom d'étape tient sur une ligne, fait 40 caractères au plus, n'est ni `TODO`, `Done` ou `Cancel`, ni celui d'une autre étape (majuscules et accents ignorés).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du CRM. |
| `operation` | texte | oui | `add`, `rename`, `remove` ou `move`. |
| `name` | texte | pour `add`, `remove`, `move` | Le nom de l'étape. |
| `from` | texte | pour `rename` | Le nom actuel de l'étape. |
| `to` | texte | pour `rename` | Le nouveau nom. |
| `index` | entier | pour `move` | La place de l'étape parmi les étapes, à partir de 0. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `stages`, les étapes après le changement.

**Erreurs** : celles communes ; « il manque « operation » » ; opération inconnue ; champ de l'opération absent ; « Le nom de l'étape est vide. » ; « Le nom de l'étape tient sur une seule ligne. » ; « Le nom de l'étape fait 40 caractères au plus. » ; « « TODO », « Done » et « Cancel » sont déjà des colonnes. » ; « Une autre étape porte déjà ce nom. » ; « Cette étape n'existe pas. ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "change_crm_stages", "arguments": {"path": "Commercial/clients.md", "operation": "add", "name": "Négociation"}}
```

Réponse :

```json
{"path": "Commercial/clients.md", "stages": ["Devis", "Négociation"]}
```

## Références

- [0081](../decisions/0081-crm-par-le-mcp.md) : le CRM par le MCP, lecture en données et outils du CRM.
- [0091](../decisions/0091-supprimer-un-crm-avec-ses-fiches.md) : jeter et déplacer un CRM avec ses fiches.
- [`doc/specs/crm.md`](../specs/crm.md) : la spécification du CRM (création d'un CRM, § 13).
