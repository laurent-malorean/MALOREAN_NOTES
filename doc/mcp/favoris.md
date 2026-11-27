# Favoris

Trois outils : mettre un contenu en favori, l'en retirer, lister les favoris. Ils font ce que fait l'étoile de l'écran (spécification : [`doc/specs/favoris.md`](../specs/favoris.md)).

Les favoris tiennent dans **une seule note**, la note des favoris : une note Markdown ordinaire que l'utilisateur a choisie ou créée dans les Réglages, onglet « Favoris » (un choix par espace de travail, gardé dans les préférences de l'application). Un contenu est en favori quand la note a une ligne faite uniquement d'un lien entre notes qui le désigne : `- [[Courses]]`, `[[plan.canvas]]`, `1. [[Dossier/Idée]]`. Un lien au milieu d'une phrase n'en fait pas un favori et n'est jamais retiré. Une IA ne choisit ni ne change la note des favoris : si l'espace visé n'en a pas, les trois outils répondent « Aucune note des favoris n'est choisie. » et l'IA le dit à l'utilisateur.

Le contenu se désigne par son chemin : une note, un cahier de recherche, une carte mentale, un canvas ou un CRM entier. Une fiche de CRM (entreprise, personne, action, projet) n'a pas d'étoile ; une entrée de cahier et un nœud de carte mentale ne sont pas des contenus ; la note des favoris ne se met pas elle-même en favori.

Chaque changement garde le texte d'avant dans l'historique des versions ([`historique.md`](historique.md)), comme `replace_in_note`.

Tous les outils de cette page acceptent le paramètre facultatif `workspace` ([règles communes](README.md#règles-communes)).

## `add_favorite`

Met un contenu en favori : une ligne `- [[lien]]` est ajoutée à la fin de la note des favoris, avec le lien que donne le menu des liens (`[[titre]]`, `[[Dossier/titre]]` si un autre contenu porte le même titre, `[[nom.canvas]]` pour un canvas). Un contenu déjà en favori n'est pas ajouté une seconde fois.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du contenu : `dossier/nom.md`, `dossier/nom.canvas`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` et `favorite` (`true`).

**Erreurs** :

- « il manque « path » » ;
- « Aucune note des favoris n'est choisie. » ;
- « la note « … » n'existe pas » ;
- « Une fiche du CRM n'a pas d'étoile : seul le CRM entier se met en favori. » ;
- « La note des favoris ne se met pas elle-même en favori. ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "add_favorite", "arguments": {"path": "Travail/courses.md"}}
```

Réponse :

```json
{"path": "Travail/courses.md", "favorite": true}
```

## `remove_favorite`

Retire un contenu des favoris : toutes les lignes de la note des favoris faites d'un lien qui le désigne (doublons compris) sont retirées, avec ou sans marque de liste. Un lien écrit au milieu d'une phrase reste. Un contenu qui n'était pas en favori ne change rien : `removed_lines` vaut 0 et rien n'est écrit.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du contenu. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, `favorite` (`false`) et `removed_lines`, le nombre de lignes retirées.

**Erreurs** :

- « il manque « path » » ;
- « Aucune note des favoris n'est choisie. ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "remove_favorite", "arguments": {"path": "Travail/courses.md"}}
```

Réponse :

```json
{"path": "Travail/courses.md", "favorite": false, "removed_lines": 1}
```

## `list_favorites`

La note des favoris et les contenus en favori, dans l'ordre de la note, chacun une fois. Un lien qui ne désigne aucun contenu (contenu à la corbeille, titre inconnu) ou plusieurs (titre porté par deux contenus) n'est pas listé.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `note`, la note des favoris (`path`, `title`), et `favorites`, la liste des contenus : `path`, `title` et `type` (`note`, `cahier-de-recherche`, `carte-mentale`, `canvas` ou `crm`).

**Erreurs** : « Aucune note des favoris n'est choisie. » ; note des favoris illisible.

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "list_favorites", "arguments": {}}
```

Réponse :

```json
{"note": {"path": "favoris.md", "title": "Favoris"},
 "favorites": [{"path": "plan.canvas", "title": "plan", "type": "canvas"},
               {"path": "courses.md", "title": "Courses", "type": "note"}]}
```
