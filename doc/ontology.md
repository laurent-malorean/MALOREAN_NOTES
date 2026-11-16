# Ontologie

Les mots du projet. On les emploie partout — documentation, code, tests, interface — sans synonyme. Un nouveau mot s'ajoute ici avant d'apparaître dans le code.

| Mot | Code | Définition |
|---|---|---|
| Bibliothèque | `Library` | Dossier racine choisi par l'utilisateur, qui contient toutes ses notes. |
| Dossier | `Folder` | Dossier sur le disque, dans la bibliothèque, qui range des notes et d'autres dossiers. |
| Racine | `Folder::root` | La bibliothèque elle-même, vue comme le premier des dossiers. |
| Nom de dossier | `FolderName` | Nom d'un dossier, tel que l'utilisateur l'a écrit ; jamais caché ni terminé par `.assets`. |
| Chemin de note | `NotePath` | Dossier et nom de fichier d'une note, écrits `dossier/sous-dossier/nom.md` depuis la racine. |
| Note | `Note` | Un fichier `.md` de la bibliothèque. |
| Contenu | `Body` | Le texte Markdown de la note, sans l'en-tête. |
| En-tête | `FrontMatter` | Bloc YAML optionnel en tête de fichier, qui porte les métadonnées. |
| Titre | `Title` | Premier titre `#` de la note ; nom affiché. |
| Nom de fichier | `FileName` | Titre en kebab-case suivi de `.md` ; suit le titre. |
| Pièce jointe | `Attachment` | Fichier non Markdown (image, document) lié depuis une note par un lien relatif. |
| Dossier de pièces jointes | `AttachmentFolder` | Dossier `<nom-de-la-note>.assets/` qui contient les pièces jointes d'une seule note ; ce n'est pas un dossier de notes. |
| Épinglée | `pinned` | Une note épinglée apparaît en tête de liste. |
| Étiquette | `Tag` | Mot-clé libre attaché à une note. |
| Corbeille | `Trash` | Dossier caché `.trash/` à la racine de la bibliothèque, où va une note ou un dossier supprimé, rangé à son chemin d'origine. Elle ne se vide qu'à la main. |
| Restaurer | `restore` | Remettre un élément de la corbeille à son chemin d'origine ; un nom pris reçoit un suffixe libre. |
| Recherche | `SearchQuery` | Les mots tapés pour retrouver des notes ; une note est trouvée si elle contient tous les mots, sans tenir compte des majuscules ni des accents. |
| Résultat de recherche | `SearchResult` | Une note trouvée : son titre, son dossier et un extrait. |
| Extrait | `Excerpt` | Court passage d'une note trouvée, autour du premier mot cherché, mots trouvés mis en évidence. |
| Index | `SearchIndex` | Cache de recherche, reconstructible à partir des fichiers. |
| Conflit | `Conflict` | Une note modifiée à la fois dans l'application et hors de l'application. |
| Aperçu en direct | `livePreview` | Affichage de la note mise en forme dans l'éditeur : la syntaxe Markdown est masquée, sauf là où se trouve le curseur ; le fichier n'est jamais modifié. |
| Tableau | `Table` | Tableau Markdown : ligne d'en-tête, ligne d'alignement, puis les lignes ; dessiné par l'aperçu en direct. |
| Thème | `theme` | Couleurs, polices et tailles de lecture de l'interface, réunies dans un seul fichier. |
| Plein écran | `fullScreen` | La fenêtre occupe tout l'écran et ne montre que le texte de la note : colonnes des dossiers et des notes cachées. |
| Mode focus | `FocusMode` | Affichage qui met en avant la phrase ou le paragraphe en cours d'écriture. |
