# Étiquettes et épingles

Cinq outils : lister les étiquettes, en ajouter ou en retirer à une note, épingler ou désépingler une note. Une étiquette s'écrit sans `#` ; deux étiquettes qui ne diffèrent que par les majuscules ou les accents sont la même.

Où s'écrivent les étiquettes et l'épingle (propriétés `tags` et `pinned` de l'en-tête d'une note, propriété `tags` à la racine d'un canvas, en-tête d'une fiche de CRM) : voir [`doc/format/note.md`](../format/note.md), [`doc/format/canvas.md`](../format/canvas.md) et [`doc/format/crm.md`](../format/crm.md).

Tous les outils de cette page acceptent le paramètre facultatif `workspace` ([règles communes](README.md#règles-communes)).

## `list_tags`

Les étiquettes de l'espace de travail, chacune avec son nombre de notes.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : une liste ; chaque étiquette avec `name` (telle qu'écrite dans les en-têtes) et `count` (le nombre de notes qui la portent).

**Erreurs** : aucun espace de travail ouvert ; index indisponible.

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "list_tags", "arguments": {}}
```

Réponse :

```json
[{"name": "budget", "count": 4}, {"name": "client", "count": 12}]
```

## `add_tags`

Ajoute des étiquettes à une note, sans toucher au reste. Une étiquette déjà portée n'est pas ajoutée deux fois. Sur une note simple, une carte mentale ou un cahier de recherche, elles s'écrivent dans l'en-tête (un en-tête est créé s'il n'y en a pas). Sur un canvas, elles s'écrivent dans la propriété `tags` de la racine du fichier ; sur un CRM ou une fiche de CRM, par le champ d'étiquettes de l'interface, sans jamais renommer le fichier. C'est ainsi que se changent les étiquettes d'une action, d'une personne, d'une entreprise ou d'un projet : par le chemin de sa fiche (`fiche`, rendu par `read_crm`).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note, du canvas ou de la fiche : `dossier/nom.md`, `dossier/nom.canvas`. |
| `tags` | liste de textes | oui | Les étiquettes, non vide : `["maison", "jardin"]`. Un `#` de tête et les espaces autour sont retirés. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `tags`, toutes les étiquettes de la note après le changement.

**Erreurs** :

- « il manque « path » » ;
- `tags` absent, vide ou qui n'est pas une liste : « il manque « tags » : une liste d'étiquettes » ;
- une étiquette vide ou contenant `,`, `[`, `]`, `{`, `}`, `:`, `"`, `'` ou un retour à la ligne : « étiquette invalide : « … » » ;
- note introuvable.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "add_tags", "arguments": {"path": "Projets/budget-2027.md", "tags": ["budget", "#2027"]}}
```

Réponse :

```json
{"path": "Projets/budget-2027.md", "tags": ["budget", "2027"]}
```

## `remove_tags`

Retire des étiquettes d'une note, d'un canvas ou d'une fiche de CRM, sans toucher au reste ; mêmes règles que `add_tags`. Une étiquette que la note ne porte pas est ignorée ; une note simple qui n'a plus d'étiquette perd la clé `tags` (et son en-tête s'il ne contient plus rien).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note, du canvas ou de la fiche. |
| `tags` | liste de textes | oui | Les étiquettes à retirer, non vide. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `tags`, les étiquettes qui restent.

**Erreurs** : les mêmes que `add_tags`.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "remove_tags", "arguments": {"path": "clients/actions/2026-11-26-relance-du-devis-acme.md", "tags": ["urgent"]}}
```

Réponse :

```json
{"path": "clients/actions/2026-11-26-relance-du-devis-acme.md", "tags": ["devis"]}
```

## `pin_note`

Épingle une note en tête de la liste des notes (`pinned: true` dans son en-tête), sans changer sa date de modification.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note : `dossier/nom.md`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `pinned` (`true`).

**Erreurs** : « il manque « path » » ; note introuvable ; note qui n'est pas du texte UTF-8 ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "pin_note", "arguments": {"path": "Projets/budget-2027.md"}}
```

Réponse :

```json
{"path": "Projets/budget-2027.md", "pinned": true}
```

## `unpin_note`

Désépingle une note : la clé `pinned` est retirée de son en-tête, sans changer sa date de modification.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note : `dossier/nom.md`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `pinned` (`false`).

**Erreurs** : les mêmes que `pin_note`.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "unpin_note", "arguments": {"path": "Projets/budget-2027.md"}}
```

Réponse :

```json
{"path": "Projets/budget-2027.md", "pinned": false}
```

## Références

- [0040](../decisions/0040-outils-de-l-application-pour-claude.md) : les outils de l'application.
- [0079](../decisions/0079-canvas-par-le-mcp.md) : les étiquettes d'un canvas.
- [0081](../decisions/0081-crm-par-le-mcp.md) : les étiquettes d'une fiche de CRM.
