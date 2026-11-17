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
| Nom de pièce jointe | `AttachmentName` | Nom du fichier d'une pièce jointe dans le dossier de pièces jointes : une image (PNG, JPEG, GIF, WebP, HEIC, TIFF, SVG) ou un PDF. Celui d'un fichier glissé garde son nom, rendu sûr ; celui d'une image collée est tiré du moment (`image-2026-11-16-1830.png`). |
| Joindre | `attach` | Copier un fichier collé ou glissé dans le dossier de pièces jointes de la note, et insérer le lien vers lui à l'endroit voulu. |
| Moment | `Moment` | Date et heure locales à la minute, telles que les donne l'horloge. |
| Horloge | `Clock` | Ce qui donne le moment présent ; seule l'infrastructure lit la vraie heure, les tests passent une horloge arrêtée. |
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
| Empreinte | `Fingerprint` | Résumé court du contenu d'une note tel que l'application l'a lu ou écrit ; si le fichier n'a plus la même, il a changé ailleurs entre-temps. |
| Copie de conflit | `ConflictCopy` | Note créée à côté de l'original, `<nom> (conflit <date> <heure>).md`, qui garde la version trouvée sur le disque quand elle aurait été écrasée. |
| Surveillance | `LibraryWatcher` | Écoute des changements faits dans le dossier de la bibliothèque hors de l'application. |
| Aperçu en direct | `livePreview` | Affichage de la note mise en forme dans l'éditeur : la syntaxe Markdown est masquée, sauf là où se trouve le curseur ; le fichier n'est jamais modifié. |
| Tableau | `Table` | Tableau Markdown : ligne d'en-tête, ligne d'alignement, puis les lignes ; dessiné par l'aperçu en direct. |
| Thème | `theme` | Couleurs, polices et tailles de lecture de l'interface, réunies dans un seul fichier. |
| Plein écran | `fullScreen` | La fenêtre occupe tout l'écran et ne montre que les colonnes : listes des dossiers et des notes cachées. |
| Mode focus | `FocusMode` | Affichage qui met en avant la phrase ou le paragraphe en cours d'écriture. |
| Lien entre notes | `NoteLink` | `[[titre]]` écrit dans une note : désigne la note qui porte ce titre, sans tenir compte des majuscules ni des accents ; `[[titre|texte]]` montre `texte`. Cmd+clic l'ouvre. |
| Liens entrants | `Backlinks` | Les notes dont un lien entre notes désigne la note ouverte, montrées sous son texte. |
| Ouverture rapide | `quickOpen` | Fenêtre ouverte au clavier (Cmd+O) où l'on tape quelques lettres du titre d'une note, de n'importe quel dossier, pour l'ouvrir. |
| Palette de commandes | `commandPalette` | Fenêtre ouverte au clavier (Cmd+Maj+P) qui liste les actions de l'application avec leur raccourci ; on en tape le nom pour la lancer. |
| Commande | `Command` | Une action de l'application proposée par la palette de commandes : son nom, son raccourci éventuel. |
| Plan | `outline` | Liste des titres de la note, dans l'ordre et selon leur niveau, affichée à droite du texte ; un clic emmène au titre. |
| Bandeau | `statusBar` | Ligne en bas de la note qui donne ses nombres de mots, de caractères et de pages, ou ceux de la sélection. |
| Page | `page` | Feuillet de texte tel qu'on le lit (sans la syntaxe Markdown) : autant de caractères, espaces comprises, que le réglage « caractères par page ». |
| Réglages | `Settings` | Choix de l'utilisateur qui valent pour toute l'application, gardés d'un lancement à l'autre ; modifiés dans l'écran de réglages. |
| Caractères par page | `charactersPerPage` | Réglage : nombre de caractères d'une page, 1 500 par défaut (un feuillet). |
| Police | `font` | Réglage d'affichage : la famille de caractères du texte des notes — avec empattements (par défaut), sans empattements, ou à chasse fixe. |
| Taille du texte | `textSize` | Réglage d'affichage : petite, moyenne (par défaut), grande ou très grande. |
| Largeur du texte | `textWidth` | Réglage d'affichage : largeur de la colonne de texte — étroite, moyenne (par défaut) ou large. |
| Apparence | `appearance` | Réglage d'affichage : claire, sombre, ou automatique (comme le Mac, par défaut). |
| Mode machine à écrire | `Typewriter` | Affichage où la ligne en cours d'écriture reste au milieu de l'écran. |
| Colonne | `Column` | Zone d'édition de la fenêtre, à droite de la liste des notes ; jusqu'à trois côte à côte. Elle a ses onglets et montre la note de son onglet actif. Les listes des dossiers et des notes ne sont pas des colonnes. |
| Colonnes | `Columns` | Les colonnes ouvertes, de gauche à droite, avec leurs onglets, leurs largeurs et la colonne active ; tenues par l'interface seule. |
| Largeur de colonne | `width` | Part de la zone d'édition qu'occupe une colonne ; réglée en glissant le séparateur, jamais sous un minimum. |
| Séparateur | `divider` | Barre entre deux colonnes voisines, qu'on glisse pour partager autrement leur largeur. |
| Diviser | `split` | Ouvrir une nouvelle colonne à droite de la colonne active, sur la même note ; elle prend la moitié de la largeur de sa voisine. Impossible au-delà de trois colonnes. |
| Onglet | `Tab` | Une note ouverte dans une colonne, montrée par son titre dans la barre d'onglets en haut de la colonne. Fermer le dernier onglet d'une colonne ferme la colonne, sauf s'il n'en reste qu'une. |
| Onglet actif | `activeTab` | L'onglet dont la colonne montre la note ; un clic sur un onglet le rend actif. |
| Colonne active | `activeColumn` | La colonne où l'on a cliqué en dernier. Une note ouverte depuis la liste, la recherche, l'ouverture rapide ou un lien, ou une note créée, s'y ouvre dans un onglet ; le plan, la recherche dans la note et la note sélectionnée de la liste suivent son onglet actif. |
