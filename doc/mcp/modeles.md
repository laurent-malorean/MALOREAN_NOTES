# Modèles de note

Deux outils : lister les modèles de note et créer une note depuis l'un d'eux. Les modèles sont les notes rangées directement dans le **dossier des modèles** que l'utilisateur a choisi pour l'espace de travail (Réglages, onglet « Écriture ») ; ce choix est gardé avec l'espace dans les préférences de l'application. L'IA ne voit ni ne choisit ce dossier.

Les variables d'un modèle (date, heure, titre) sont décrites dans [`doc/format/note.md`](../format/note.md).

Les deux outils acceptent le paramètre facultatif `workspace` ([règles communes](README.md#règles-communes)) : c'est le dossier des modèles de l'espace visé qui sert.

## `list_templates`

Les noms des modèles de note de l'espace visé, sans leur texte, par ordre de titre.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : une liste ; chaque modèle avec `name`, son titre.

**Erreurs** :

- aucun dossier des modèles choisi : « aucun dossier des modèles n'est choisi pour l'espace de travail « … » : l'utilisateur peut en choisir un dans les Réglages de MALOREAN Notes, onglet « Écriture » » ;
- index indisponible.

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "list_templates", "arguments": {}}
```

Réponse :

```json
[{"name": "Compte rendu de réunion"}, {"name": "Fiche de lecture"}]
```

## `create_note_from_template`

Crée une note depuis un modèle : l'application applique le modèle (date, heure et titre remplacés ; le titre `#` prend `title`), puis crée la note, nom du fichier tiré du titre, sans écraser une autre note. Inutile de lire le modèle avant.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `template` | texte | oui | Le nom du modèle, tel que `list_templates` le donne (majuscules et accents ignorés) ; le nom de son fichier sans `.md` est aussi accepté. |
| `title` | texte | oui | Le titre de la nouvelle note (les espaces autour sont retirés). |
| `folder` | texte | non | Le dossier de la note depuis l'espace de travail ; la racine si absent. Contrairement à `create_note`, l'outil ne crée pas un dossier qui manque : le créer d'abord avec `create_folder`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path`, le chemin de la note créée.

**Erreurs** :

- « il manque « template » » ou « il manque « title » » ;
- modèle inconnu : « aucun modèle « … » : voyez list_templates » ;
- aucun dossier des modèles choisi (même message que `list_templates`) ;
- dossier invalide ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "create_note_from_template", "arguments": {"template": "Compte rendu de réunion",
 "title": "Comité du 26 novembre", "folder": "Réunions"}}
```

Réponse :

```json
{"path": "Réunions/comite-du-26-novembre.md"}
```

## Références

- [0040](../decisions/0040-outils-de-l-application-pour-claude.md) : les outils de l'application.
- [0077](../decisions/0077-dossier-des-modeles-pour-les-ia.md) : le dossier des modèles pour les IA.
