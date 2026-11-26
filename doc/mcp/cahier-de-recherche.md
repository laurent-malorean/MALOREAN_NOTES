# Cahier de recherche

Deux outils : créer un cahier de recherche, et y ajouter une entrée. Un cahier est en **ajout seul** : `add_entry` est la seule façon d'y écrire. Il ne se modifie jamais, ni par `replace_in_note`, ni par les outils de fichiers de l'IA ; `read_note` le refuse. Une erreur se rectifie par une nouvelle entrée. Ses entrées se retrouvent avec `search_notes` et `search_by_meaning`.

Le format d'un cahier (en-tête `type: cahier-de-recherche`, titres d'année, de mois et de jour, entrées datées et numérotées, ancres) est décrit dans [`doc/format/cahier-de-recherche.md`](../format/cahier-de-recherche.md).

Les deux outils acceptent le paramètre facultatif `workspace` ([règles communes](README.md#règles-communes)).

## `create_research_notebook`

Crée un cahier de recherche neuf, sans entrée, comme « Nouveau cahier de recherche » de l'écran : titre `# title` en tête, nom du fichier tiré du titre (sans écraser une autre note), dans `folder`, créé avec ses parents s'il n'existe pas.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `title` | texte | oui | Le titre du cahier, non vide. |
| `folder` | texte | non | Le dossier depuis l'espace de travail : `Recherche/Thèse` ; la racine si absent ; créé avec ses parents s'il manque. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, le chemin du cahier créé.

**Erreurs** : « il manque « title » » (absent ou vide) ; dossier invalide ou refusé (rien n'est créé) ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "create_research_notebook", "arguments": {"title": "Essais de levain", "folder": "Recherche"}}
```

Réponse :

```json
{"path": "Recherche/essais-de-levain.md"}
```

## `add_entry`

Ajoute une entrée à la fin d'un cahier de recherche, à l'heure qu'il est sur le Mac, sous les titres d'année, de mois et de jour qui manquent. Rien d'autre du cahier ne change.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin du cahier depuis l'espace de travail : `dossier/nom.md`. |
| `text` | texte | oui | Le texte de l'entrée ; plusieurs lignes permises. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** :

- `path` : le chemin du cahier ;
- `entry` : l'entrée ajoutée :
  - `anchor` : son ancre, qui la désigne dans un lien : `2026-11-26-10h42` ;
  - `label` : son moment tel qu'on le lit : `26 novembre 2026 à 10:42` ;
  - `text` : son texte, ses lignes sans retrait ;
  - `line` : le numéro de sa première ligne dans le cahier, à partir de 0 ;
  - `number` : son numéro d'entrée, sa position dans le cahier à partir de 1.

**Erreurs** :

- « il manque « path » » ou « il manque « text » » (absent ou vide) ;
- la note n'est pas un cahier : « cette note n'est pas un cahier de recherche » ;
- cahier introuvable (« la note « … » n'existe pas ») ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "add_entry", "arguments": {"path": "Recherche/essais-de-levain.md",
 "text": "Hydratation à 75 % : mie plus ouverte, croûte trop pâle.\nProchain essai : 250 °C les dix premières minutes."}}
```

Réponse :

```json
{"path": "Recherche/essais-de-levain.md", "entry": {"anchor": "2026-11-26-10h42",
 "label": "26 novembre 2026 à 10:42",
 "text": "Hydratation à 75 % : mie plus ouverte, croûte trop pâle.\nProchain essai : 250 °C les dix premières minutes.",
 "line": 12, "number": 3}}
```

## Références

- [0041](../decisions/0041-cahier-de-recherche.md) : le cahier de recherche, en ajout seul.
- [0087](../decisions/0087-creer-un-canvas-par-le-mcp.md) : créer un cahier de recherche (et un canvas) par le MCP.
- [0095](../decisions/0095-numero-d-entree-de-cahier.md) : le numéro d'entrée.
