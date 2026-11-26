# Espaces de travail et écran

Trois outils : savoir quels espaces de travail une IA peut viser, savoir ce que l'utilisateur regarde, lui montrer une note. Aucun ne change de note : le garde-fou du web ne les retient jamais.

Les règles communes (paramètre `workspace`, chemins, erreurs) sont dans le [README](README.md#règles-communes).

## `list_workspaces`

Les espaces de travail que l'utilisateur a cochés pour les IA (onglet « Brancher une IA » des Réglages), par leur nom, avec celui qui est ouvert chez lui. Aucun autre espace n'est visible, et jamais un chemin de dossier.

**Paramètres** : aucun. C'est le seul outil qui n'accepte pas `workspace` : il parle de tous les espaces.

**Rend** :

- `workspaces` : une liste, un élément par espace coché :
  - `name` : le nom de l'espace, à donner dans le paramètre `workspace` des autres outils ;
  - `open` : `true` pour l'espace ouvert chez l'utilisateur.
- `message` : seulement si la liste est vide : « aucun espace de travail n'est autorisé pour les IA : l'utilisateur doit en cocher un dans les Réglages de MALOREAN Notes, onglet « Brancher une IA » ».

**Erreurs** : la liste des espaces illisible (préférences de l'application inaccessibles).

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "list_workspaces", "arguments": {}}
```

Réponse :

```json
{"workspaces": [{"name": "Travail", "open": true}, {"name": "Recherche", "open": false}]}
```

## `viewed_note`

Ce que l'utilisateur regarde : la note ouverte dans la colonne active et le texte qu'il y a sélectionné, avec le nom de l'espace de travail. Utile quand il parle de « cette note » ou de « ce passage ». L'application le demande à l'interface au moment de l'appel et attend sa réponse 2 secondes au plus.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `workspace` | texte | non | Accepté, mais seul l'espace ouvert est permis : un autre espace est refusé. |

**Rend** :

- `workspace` : le nom de l'espace ouvert ;
- `note` : `path` et `title` de la note de la colonne active, ou `null` s'il n'y en a pas ;
- `selection` : le texte sélectionné, vide s'il n'y en a pas.

**Erreurs** :

- « l'interface n'a pas répondu : réessayez » (rien reçu en 2 secondes) ;
- « l'interface de MALOREAN Notes n'est pas là pour répondre » ;
- un `workspace` qui n'est pas l'espace ouvert : « « viewed_note » parle de l'écran de l'utilisateur : il ne vise que l'espace de travail ouvert chez lui » ;
- « aucun espace de travail n'est ouvert ».

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "viewed_note", "arguments": {}}
```

Réponse :

```json
{"workspace": "Travail", "note": {"path": "Projets/budget-2027.md", "title": "Budget 2027"}, "selection": "marge de 12 %"}
```

## `show_note`

Montre une note à l'utilisateur : l'application l'ouvre dans la colonne active (par exemple la note que l'IA vient de créer ou de trouver).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note depuis l'espace de travail : `dossier/nom.md`. |
| `workspace` | texte | non | Accepté, mais seul l'espace ouvert est permis. |

**Rend** : `shown`, le chemin de la note ouverte.

**Erreurs** :

- « il manque « path » » ;
- note introuvable : « la note « … » n'existe pas » ;
- « l'interface de MALOREAN Notes n'est pas là pour répondre » ;
- un `workspace` qui n'est pas l'espace ouvert : « « show_note » parle de l'écran de l'utilisateur : il ne vise que l'espace de travail ouvert chez lui ».

**Garde-fou du web** : non retenu (montrer ne change rien).

**Exemple** :

```json
{"name": "show_note", "arguments": {"path": "Projets/budget-2027.md"}}
```

Réponse :

```json
{"shown": "Projets/budget-2027.md"}
```

## Références

- [0040](../decisions/0040-outils-de-l-application-pour-claude.md) : les outils de l'application, dont les deux outils de l'écran.
- [0056](../decisions/0056-brancher-une-ia.md) : brancher une IA extérieure.
- [0074](../decisions/0074-espaces-de-travail-pour-les-ia.md) : les espaces de travail pour les IA, `list_workspaces` et le paramètre `workspace`.
