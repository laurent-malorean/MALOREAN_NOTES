# Dossiers

Cinq outils, les **outils de dossier** : voir l'arbre des dossiers, créer, renommer, déplacer et jeter un dossier. Ils passent par les mêmes cas d'usage que l'interface : mêmes règles, mêmes messages en français.

Règles communes aux outils qui changent un dossier :

- un dossier se désigne par son chemin depuis la racine de l'espace de travail, séparé par `/` : `Animaux/Chiens` ; la racine est le chemin vide ;
- un nom de dossier refusé l'est comme dans l'interface : vide, caché (commence par `.`), terminé par `.assets`, `node_modules`, ou contenant `/`, `\` ou un caractère nul ; le message est « nom de dossier invalide : « … » » ;
- la racine de l'espace ne se renomme, ne se déplace ni ne se jette ;
- renommer ou déplacer un dossier garde ce qu'il contient : notes, sous-dossiers, dossiers de pièces jointes (leurs liens, relatifs, restent valables), historique des versions ; l'index de recherche suit ;
- les liens `[[Dossier/titre]]` ne sont pas réécrits : le dossier n'y est qu'une précision, le lien reste valable tant que le titre est unique ;
- les dossiers de fiches d'un CRM ne se renomment, ne se déplacent ni ne se jettent à la main (consigne du serveur) : un CRM se range avec `move_note` et se jette avec `trash_note`, qui emportent ses fiches.

L'organisation d'un espace de travail sur le disque (dossiers, pièces jointes, corbeille) est décrite dans [`doc/format/espace-de-travail.md`](../format/espace-de-travail.md).

Tous les outils de cette page acceptent le paramètre facultatif `workspace` ([règles communes](README.md#règles-communes)).

## `list_folders`

L'arbre des dossiers de l'espace de travail, par leurs chemins depuis la racine, dans l'ordre de l'arbre de l'interface : chaque dossier suivi de ses sous-dossiers, par ordre alphabétique ; la racine n'y est pas, un dossier vide y est. Les dossiers cachés, les dossiers de pièces jointes (`….assets`), `node_modules`, la corbeille et les dossiers des fiches d'un CRM (`clients/` pour `clients.md`) n'en font pas partie. Les notes d'un dossier se listent avec `search_notes` (paramètre `folder`).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `folders`, la liste des chemins.

**Erreurs** : aucun espace de travail ouvert ; stockage indisponible.

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "list_folders", "arguments": {}}
```

Réponse :

```json
{"folders": ["Animaux", "Animaux/Chiens", "Animaux/Chiens/Chasse", "Projets", "Réunions"]}
```

## `create_folder`

Crée un dossier, avec chacun des dossiers qui manquent sur son chemin ; un dossier qui existe déjà est laissé tel quel. `create_note` et les autres outils de création créent déjà le dossier qui manque : l'appeler avant n'est pas nécessaire.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du dossier depuis la racine, séparé par `/` : `Animaux/Chiens`. Non vide. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, le chemin du dossier.

**Erreurs** : « il manque « path » » (absent ou vide) ; nom refusé (« nom de dossier invalide : « … » ») ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "create_folder", "arguments": {"path": "Projets/Salons/2027"}}
```

Réponse :

```json
{"path": "Projets/Salons/2027"}
```

## `rename_folder`

Renomme un dossier : il reste à sa place, avec tout ce qu'il contient.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du dossier : `Animaux/Chiens`. Le vide désigne la racine, refusée. |
| `name` | texte | oui | Le nouveau nom, sans `/` : `Chiens de chasse`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, le nouveau chemin du dossier.

**Erreurs** (rien n'est changé) :

- « il manque « path » » ou « il manque « name » » (champ absent) ;
- nom refusé : « nom de dossier invalide : « … » » ;
- nom pris par un dossier voisin : « un dossier « … » existe déjà » ;
- dossier introuvable : « le dossier « … » n'existe pas » ;
- la racine : « l'espace de travail lui-même ne peut être ni renommé ni déplacé ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "rename_folder", "arguments": {"path": "Animaux/Chiens", "name": "Chiens de chasse"}}
```

Réponse :

```json
{"path": "Animaux/Chiens de chasse"}
```

## `move_folder`

Déplace un dossier dans un autre, avec tout ce qu'il contient ; il garde son nom.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du dossier à déplacer. |
| `folder` | texte | oui | Le dossier d'arrivée depuis la racine ; `""` pour la racine. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, le nouveau chemin du dossier.

**Erreurs** (rien n'est changé) :

- « il manque « path » » ou « il manque « folder » » (champ absent) ;
- dossier ou dossier d'arrivée introuvable : « le dossier « … » n'existe pas » ;
- dossier d'arrivée qui est le dossier lui-même ou l'un de ses sous-dossiers : « le dossier « … » ne peut pas aller dans lui-même ni dans l'un de ses sous-dossiers » ;
- un dossier du même nom déjà dans le dossier d'arrivée : « un dossier « … » existe déjà » ;
- la racine : « l'espace de travail lui-même ne peut être ni renommé ni déplacé ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "move_folder", "arguments": {"path": "Inbox/Salons", "folder": "Projets"}}
```

Réponse :

```json
{"path": "Projets/Salons"}
```

## `trash_folder`

Met un dossier, avec tout ce qu'il contient (notes, sous-dossiers, pièces jointes, historique), à la corbeille de l'application, à son chemin d'origine (`Nom 2`, `Nom 3`… s'il y est déjà) : jamais effacé, l'utilisateur le restaure. Un CRM du dossier part avec ses fiches quand leur dossier est dans celui-ci (il est à côté du CRM).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du dossier. Le vide désigne la racine, refusée. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `trashed`, le chemin du dossier dans la corbeille.

**Erreurs** :

- « il manque « path » » (champ absent) ;
- dossier introuvable : « le dossier « … » n'existe pas » ;
- la racine : « l'espace de travail lui-même ne peut pas aller dans la corbeille ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "trash_folder", "arguments": {"path": "Archives/2024"}}
```

Réponse :

```json
{"trashed": "Archives/2024"}
```

## Références

- [0078](../decisions/0078-dossiers-par-le-mcp.md) : les dossiers par le MCP.
- [0091](../decisions/0091-supprimer-un-crm-avec-ses-fiches.md) : un CRM jeté avec ses fiches.
