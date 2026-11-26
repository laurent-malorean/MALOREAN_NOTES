# Pièces jointes

Un outil : joindre à une note un fichier déjà rangé dans l'espace de travail. Le dossier des pièces jointes d'une note (`<nom>.assets`), le nom des copies et la forme du lien sont décrits dans [`doc/format/espace-de-travail.md`](../format/espace-de-travail.md) et [`doc/format/note.md`](../format/note.md).

## `add_attachment`

Ajoute à une note, comme pièce jointe, une image ou un PDF déjà rangé dans l'espace de travail : le fichier est copié dans le dossier des pièces jointes de la note (le fichier d'origine reste où il est) et son lien est ajouté à la fin de la note.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note : `dossier/nom.md`. |
| `file` | texte | oui | Le fichier à joindre, depuis la racine de l'espace de travail : `Documents/plan.pdf`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` (la note) et `link`, le lien ajouté à la fin de la note : `![](note.assets/vue.png)` pour une image, `[plan.pdf](note.assets/plan.pdf)` pour un PDF.

**Erreurs** :

- « il manque « path » » ou « il manque « file » » ;
- ni une image ni un PDF : « « … » ne peut pas être joint à une note : seulement les images (PNG, JPEG, GIF, WebP, HEIC, TIFF, SVG) et les PDF » ;
- fichier de plus de 50 Mo : « le fichier fait plus de 50 Mo : il ne peut pas être joint à une note » ;
- fichier ou note introuvable ; chemin invalide ; stockage indisponible.

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "add_attachment", "arguments": {"path": "Projets/salon-2027.md", "file": "Documents/plan-du-stand.pdf"}}
```

Réponse :

```json
{"path": "Projets/salon-2027.md", "link": "[plan-du-stand.pdf](salon-2027.assets/plan-du-stand.pdf)"}
```

## Références

- [0040](../decisions/0040-outils-de-l-application-pour-claude.md) : les outils de l'application, dont joindre un fichier de l'espace de travail.
