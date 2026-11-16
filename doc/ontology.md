# Ontologie

Les mots du projet. On les emploie partout — documentation, code, tests, interface — sans synonyme. Un nouveau mot s'ajoute ici avant d'apparaître dans le code.

| Mot | Code | Définition |
|---|---|---|
| Bibliothèque | `Library` | Dossier racine choisi par l'utilisateur, qui contient toutes ses notes. |
| Dossier | `Folder` | Dossier sur le disque, dans la bibliothèque, qui range des notes et d'autres dossiers. |
| Note | `Note` | Un fichier `.md` de la bibliothèque. |
| Contenu | `Body` | Le texte Markdown de la note, sans l'en-tête. |
| En-tête | `FrontMatter` | Bloc YAML optionnel en tête de fichier, qui porte les métadonnées. |
| Titre | `Title` | Premier titre `#` de la note ; nom affiché. |
| Nom de fichier | `FileName` | Titre en kebab-case suivi de `.md` ; suit le titre. |
| Pièce jointe | `Attachment` | Fichier non Markdown (image, document) lié depuis une note par un lien relatif. |
| Dossier de pièces jointes | `AttachmentFolder` | Dossier `<nom-de-la-note>.assets/` qui contient les pièces jointes d'une seule note ; ce n'est pas un dossier de notes. |
| Épinglée | `pinned` | Une note épinglée apparaît en tête de liste. |
| Étiquette | `Tag` | Mot-clé libre attaché à une note. |
| Corbeille | `Trash` | Endroit où va une note ou un dossier supprimé, d'où on peut le restaurer. |
| Index | `SearchIndex` | Cache de recherche, reconstructible à partir des fichiers. |
| Conflit | `Conflict` | Une note modifiée à la fois dans l'application et hors de l'application. |
| Mode focus | `FocusMode` | Affichage qui met en avant la phrase ou le paragraphe en cours d'écriture. |
