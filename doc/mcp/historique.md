# Historique des versions

Trois outils pour voir, lire et remettre les versions qu'une note garde. Chaque changement fait par un outil de l'application (remplacement, geste de carte mentale ou de canvas, changement d'une fiche de CRM…) garde le texte d'avant comme version : `list_versions` puis `restore_version` l'annulent.

Où et comment les versions sont gardées : voir [`doc/format/espace-de-travail.md`](../format/espace-de-travail.md).

Tous les outils de cette page acceptent le paramètre facultatif `workspace` ([règles communes](README.md#règles-communes)).

## `list_versions`

L'historique des versions d'une note : chaque version gardée par l'application, la plus récente d'abord.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note, du canvas ou de la fiche : `dossier/nom.md`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : une liste ; chaque version avec `id` (son identifiant, à donner à `read_version` et `restore_version` : `2026-11-18 14h30`) et `label` (sa date telle que l'historique la montre : `18 novembre 2026 à 14:30`). Une liste vide si la note n'a pas de version.

**Erreurs** : « il manque « path » » ; chemin invalide ; stockage indisponible.

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "list_versions", "arguments": {"path": "Projets/budget-2027.md"}}
```

Réponse :

```json
[{"id": "2026-11-26 10h12", "label": "26 novembre 2026 à 10:12"},
 {"id": "2026-11-18 14h30", "label": "18 novembre 2026 à 14:30"}]
```

## `read_version`

Le texte d'une version d'une note, désignée par l'identifiant que donne `list_versions`.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note. |
| `version` | texte | oui | L'identifiant de la version, tel que `list_versions` le donne : `2026-11-18 14h30`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : le texte brut de la version, tel qu'il était dans le fichier (pas un objet JSON : c'est le seul outil dans ce cas).

**Erreurs** : « il manque « path » » ou « il manque « version » » ; identifiant invalide ; version disparue : « la version du … n'existe plus ».

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "read_version", "arguments": {"path": "Projets/budget-2027.md", "version": "2026-11-18 14h30"}}
```

Réponse :

```text
---
tags: [budget]
---
# Budget 2027

Marge visée : 12 %.
```

## `restore_version`

Remet dans une note le texte d'une de ses versions ; son texte actuel est d'abord gardé comme version, ce qui rend la restauration elle-même annulable.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note. |
| `version` | texte | oui | L'identifiant de la version, tel que `list_versions` le donne. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, le chemin de la note restaurée.

**Erreurs** : « il manque « path » » ou « il manque « version » » ; note introuvable ; identifiant invalide ; version disparue : « la version du … n'existe plus ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "restore_version", "arguments": {"path": "Projets/budget-2027.md", "version": "2026-11-18 14h30"}}
```

Réponse :

```json
{"path": "Projets/budget-2027.md"}
```

## Références

- [0040](../decisions/0040-outils-de-l-application-pour-claude.md) : les outils de l'application.
- [0079](../decisions/0079-canvas-par-le-mcp.md) : un changement de canvas annulé par l'historique.
- [0080](../decisions/0080-carte-mentale-par-le-mcp.md) : un geste de carte mentale annulé par l'historique.
