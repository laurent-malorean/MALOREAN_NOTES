# Ontologie

Les mots du projet. On les emploie partout — documentation, code, tests, interface — sans synonyme. Un nouveau mot s'ajoute ici avant d'apparaître dans le code.

| Mot | Code | Définition |
|---|---|---|
| Bibliothèque | `Library` | Dossier racine choisi par l'utilisateur, qui contient toutes ses notes. |
| Dossier | `Folder` | Dossier sur le disque, dans la bibliothèque, qui range des notes et d'autres dossiers. |
| Racine | `Folder::root` | La bibliothèque elle-même, vue comme le premier des dossiers. |
| Nom de dossier | `FolderName` | Nom d'un dossier, tel que l'utilisateur l'a écrit ; jamais caché ni terminé par `.assets`. |
| Icône de dossier | `folder-icon` | Contour de dossier dessiné devant chaque dossier de la colonne des dossiers, de la couleur d'accent ; sa couleur et sa taille sont dans le thème. |
| Dossier plié | `folded`, `FoldedFolders` | Dossier de la colonne des dossiers dont les sous-dossiers sont cachés ; déplié, ils sont montrés sous lui. La racine se plie comme les autres dès que la bibliothèque a un dossier : pliée, elle cache tous les dossiers. Au départ, tous les dossiers sont dépliés. Choisir un dossier, ou y déposer une note, déplie ceux qui le contiennent. Les dossiers pliés de chaque bibliothèque sont gardés d'un lancement à l'autre. |
| Flèche de dépliage | `folder-toggle` | Flèche (›) devant un dossier qui a des sous-dossiers : un clic le plie ou le déplie sans le choisir ; elle tourne vers le bas quand il est déplié. Au clavier, → déplie et ← plie le dossier qui a le focus. Un dossier sans sous-dossier n'a pas de flèche mais garde sa place, pour que les noms restent alignés. |
| Chemin de note | `NotePath` | Dossier et nom de fichier d'une note, écrits `dossier/sous-dossier/nom.md` depuis la racine. |
| Note | `Note` | Un fichier `.md` de la bibliothèque. |
| Contenu | `Body` | Le texte Markdown de la note, sans l'en-tête. |
| En-tête | `FrontMatter` | Bloc YAML optionnel en tête de fichier, qui porte les métadonnées. |
| Titre | `Title` | Premier titre `#` de la note ; nom affiché. Ce qu'on tape dans une note vide devient son titre : la marque `# ` se met devant. |
| Nom de fichier | `FileName` | Titre en kebab-case suivi de `.md` ; suit le titre. |
| Pièce jointe | `Attachment` | Fichier non Markdown (image, document) lié depuis une note par un lien relatif. |
| Nom de pièce jointe | `AttachmentName` | Nom du fichier d'une pièce jointe dans le dossier de pièces jointes : une image (PNG, JPEG, GIF, WebP, HEIC, TIFF, SVG) ou un PDF. Celui d'un fichier glissé garde son nom, rendu sûr ; celui d'une image collée est tiré du moment (`image-2026-11-16-1830.png`). |
| Joindre | `attach` | Copier un fichier collé ou glissé dans le dossier de pièces jointes de la note, et insérer le lien vers lui à l'endroit voulu. |
| Moment | `Moment` | Date et heure locales à la minute, telles que les donne l'horloge. |
| Horloge | `Clock` | Ce qui donne le moment présent ; seule l'infrastructure lit la vraie heure, les tests passent une horloge arrêtée. |
| Dossier de pièces jointes | `AttachmentFolder` | Dossier `<nom-de-la-note>.assets/` qui contient les pièces jointes d'une seule note ; ce n'est pas un dossier de notes. |
| Tri de la liste | `NoteOrder` | L'ordre des notes de la liste, du filtre par étiquette et des résultats de recherche : par date de modification (la plus récente d'abord, par défaut) ou par titre (de A à Z, majuscules et accents ignorés : « avion », « Banane », « cerise » ; à égalité, par nom de fichier). Les notes épinglées restent en tête, triées de même entre elles. Choisi au-dessus de la liste des notes ou dans la palette de commandes ; chaque bibliothèque garde le sien d'un lancement à l'autre. |
| Épinglée | `pinned` | Une note épinglée apparaît en tête de liste. |
| Étiquette | `Tag`, `tags` | Mot-clé libre attaché à une note, écrit dans son en-tête : `tags: [perso, loisirs]`, `tags: perso, loisirs` ou une liste YAML (`- perso` sur chaque ligne). Guillemets et `#` de tête retirés ; une étiquette vide ou répétée est ignorée ; les majuscules comptent. La liste des notes montre les étiquettes de chaque note sous sa date. |
| Filtre par étiquette | `tag` (écran), `listTaggedNotes` | Un clic sur une étiquette (dans la liste des notes ou la liste des étiquettes) montre, à la place des notes du dossier, toutes les notes de la bibliothèque qui la portent, épinglées d'abord. Une barre au-dessus de la liste nomme l'étiquette ; sa croix, ou Échap, retire le filtre et ramène les notes du dossier. Choisir un dossier retire aussi le filtre ; pendant une recherche ou dans la corbeille, il est mis de côté et revient ensuite ; choisir une étiquette vide la recherche. |
| Liste des étiquettes | `TagItem`, `listTags` | Sous les dossiers, chaque étiquette de la bibliothèque avec son nombre de notes, par ordre alphabétique (majuscules et accents ignorés) ; un clic filtre la liste par cette étiquette. |
| Corbeille | `Trash` | Dossier caché `.trash/` à la racine de la bibliothèque, où va une note ou un dossier supprimé, rangé à son chemin d'origine. Elle ne se vide qu'à la main. |
| Restaurer | `restore` | Remettre un élément de la corbeille à son chemin d'origine ; un nom pris reçoit un suffixe libre. |
| Confirmation | `confirmation` | Petite fenêtre qui pose une question avant une action : « Placer « Titre » dans la corbeille ? ». Échap ou « Annuler » ne fait rien ; Entrée ou le bouton de l'action la lance. Placer une note ou un dossier dans la corbeille la demande toujours, quel que soit le chemin (menu, touche). |
| Recherche | `SearchQuery` | Les mots tapés pour retrouver des notes ; une note est trouvée si elle contient tous les mots, sans tenir compte des majuscules ni des accents. |
| Résultat de recherche | `SearchResult` | Une note trouvée : son titre, son dossier et un extrait. Les résultats suivent le tri de la liste, épinglées d'abord ; il n'y a pas d'ordre de pertinence. |
| Seuil de recherche | `SEARCH_MIN_LENGTH` | Nombre minimal de caractères tapés (3) pour lancer une recherche, sauf si le texte est un nombre ; en dessous, la liste montre les notes du dossier. Une recherche part après une courte pause dans la frappe, jamais à chaque lettre. |
| Extrait | `Excerpt` | Court passage d'une note trouvée, autour du premier mot cherché, mots trouvés mis en évidence. |
| Index | `SearchIndex` | Cache de recherche, reconstructible à partir des fichiers. |
| Conflit | `Conflict` | Une note modifiée à la fois dans l'application et hors de l'application. |
| Empreinte | `Fingerprint` | Résumé court du contenu d'une note tel que l'application l'a lu ou écrit ; si le fichier n'a plus la même, il a changé ailleurs entre-temps. |
| Copie de conflit | `ConflictCopy` | Note créée à côté de l'original, `<nom> (conflit <date> <heure>).md`, qui garde la version trouvée sur le disque quand elle aurait été écrasée. |
| Surveillance | `LibraryWatcher` | Écoute des changements faits dans le dossier de la bibliothèque hors de l'application. |
| Aperçu en direct | `livePreview` | Affichage de la note mise en forme dans l'éditeur : la syntaxe Markdown est masquée, sauf là où se trouve le curseur ; le fichier n'est jamais modifié. |
| Tableau | `Table` | Tableau Markdown : ligne d'en-tête, ligne d'alignement, puis les lignes ; dessiné par l'aperçu en direct. |
| Thème | `theme` | Couleurs, polices et tailles de lecture de l'interface, réunies dans un seul fichier. |
| Plein écran | `fullScreen` | La fenêtre occupe tout l'écran, en gardant sa disposition : les panneaux latéraux restent montrés ou cachés comme avant. Bouton, Ctrl+Cmd+F ou la palette ; Échap en sort. |
| Panneaux latéraux | `sidePanels` | Les listes des dossiers et des notes, à gauche des colonnes. Un bouton, Ctrl+Cmd+S ou la palette les cachent ou les montrent ensemble, en plein écran comme en dehors ; les colonnes prennent alors toute la largeur. Le choix est gardé d'un lancement à l'autre. |
| Mode focus | `FocusMode` | Affichage qui met en avant la phrase ou le paragraphe en cours d'écriture. Un retour à la ligne termine l'une comme l'autre : le paragraphe en cours est la ligne du curseur. |
| Lien entre notes | `NoteLink` | `[[titre]]` écrit dans une note : désigne la note qui porte ce titre, sans tenir compte des majuscules ni des accents ; `[[titre|texte]]` montre `texte`. Cmd+clic l'ouvre. |
| Liens entrants | `Backlinks` | Les notes dont un lien entre notes désigne la note ouverte, montrées sous son texte. |
| Ouverture rapide | `quickOpen` | Fenêtre ouverte au clavier (Cmd+O) où l'on tape quelques lettres du titre d'une note, de n'importe quel dossier, pour l'ouvrir. |
| Palette de commandes | `commandPalette` | Fenêtre ouverte au clavier (Cmd+Maj+P) qui liste les actions de l'application avec leur raccourci ; on en tape le nom pour la lancer. |
| Commande | `Command` | Une action de l'application proposée par la palette de commandes : son nom, son raccourci éventuel. |
| Plan | `outline` | Liste des titres de la note, dans l'ordre et selon leur niveau, affichée à droite du texte ; un clic emmène au titre. |
| Bandeau | `statusBar` | Ligne en bas de la note qui donne ses nombres de mots, de caractères et de pages, ou ceux de la sélection. |
| Page | `page` | Feuillet de texte tel qu'on le lit (sans la syntaxe Markdown) : autant de caractères, espaces comprises, que le réglage « caractères par page ». Le bandeau compte les pages commencées, en nombre entier (1 caractère = 1 page, une de plus dès qu'on dépasse une page pleine). |
| Réglages | `Settings` | Choix de l'utilisateur qui valent pour toute l'application, gardés d'un lancement à l'autre ; modifiés dans l'écran de réglages. |
| Caractères par page | `charactersPerPage` | Réglage : nombre de caractères d'une page, 1 500 par défaut (un feuillet). |
| Police | `font` | Réglage d'affichage : la famille de caractères du texte des notes — avec empattements (par défaut), sans empattements, ou à chasse fixe. |
| Taille du texte | `textSize` | Réglage d'affichage : petite, moyenne (par défaut), grande ou très grande. |
| Largeur du texte | `textWidth` | Réglage d'affichage : largeur de la colonne de texte — étroite, moyenne (par défaut) ou large. |
| Apparence | `appearance` | Réglage d'affichage : claire, sombre, ou automatique (comme le Mac, par défaut). |
| Mode machine à écrire | `Typewriter` | Affichage où la ligne en cours d'écriture reste au milieu de la colonne active : elle y va dès la mise en marche, et y revient à chaque frappe ou déplacement du curseur ; une note qu'on ouvre se montre d'abord depuis son début. |
| Colonne | `Column` | Zone d'édition de la fenêtre, à droite de la liste des notes ; jusqu'à trois côte à côte. Elle a ses onglets et montre la note de son onglet actif. Les listes des dossiers et des notes ne sont pas des colonnes. |
| Colonnes | `Columns` | Les colonnes ouvertes, de gauche à droite, avec leurs onglets, leurs largeurs et la colonne active ; tenues par l'interface seule. |
| Largeur de colonne | `width` | Part de la zone d'édition qu'occupe une colonne ; réglée en glissant le séparateur, jamais sous un minimum. |
| Séparateur | `divider` | Barre entre deux colonnes voisines, qu'on glisse pour partager autrement leur largeur. |
| Diviser | `split` | Ouvrir une nouvelle colonne à droite de la colonne active, sur la même note ; elle prend la moitié de la largeur de sa voisine. Impossible au-delà de trois colonnes. Bouton de la colonne, ou Ctrl+Cmd+T. |
| Onglet | `Tab` | Une note ouverte dans une colonne, montrée par son titre dans la barre d'onglets en haut de la colonne. Fermer le dernier onglet d'une colonne ferme la colonne, sauf s'il n'en reste qu'une. Cmd+W ferme l'onglet actif de la colonne active. |
| Onglet actif | `activeTab` | L'onglet dont la colonne montre la note ; un clic sur un onglet le rend actif. |
| Colonne active | `activeColumn` | La colonne où l'on a cliqué en dernier. Une note ouverte depuis la liste, la recherche, l'ouverture rapide ou un lien, ou une note créée, s'y ouvre dans un onglet ; le plan, la recherche dans la note et la note sélectionnée de la liste suivent son onglet actif. |
| Nouvel onglet | `newTab` | Ouvrir une note dans un onglet de plus de la colonne active, juste après l'onglet actif, même si elle y est déjà ouverte. Cmd+clic sur une note de la liste ou de la recherche, choix du menu d'une note, ou Cmd+T, qui demande la note par son titre comme l'ouverture rapide. |
| Ouvrir à gauche, à droite | `left`, `right` | Ouvrir une note dans la colonne voisine de ce côté, qui devient active ; s'il n'y en a pas et qu'il reste de la place, une colonne s'y ouvre, avec la moitié de la largeur de sa voisine. |
| Emplacement | `Placement` | Où le menu d'une note l'ouvre : nouvel onglet, à gauche ou à droite. |
| Menu d'une note | `noteMenu` | Le clic droit sur une note de la liste ou sur un onglet : « Ouvrir dans un nouvel onglet », « Ouvrir à gauche », « Ouvrir à droite », « Fermer ». Fermer vise l'onglet cliqué, ou, depuis la liste, l'onglet de la note dans la colonne active. |
| Dépôt d'un onglet | `TabDrop` | Où l'on lâche un onglet qu'on glisse : dans une colonne (avant un onglet de sa barre, sinon à la fin), qui le reçoit et devient active ; ou au bord gauche ou droit d'une colonne, où une colonne s'ouvre pour lui, avec la moitié de la largeur de sa voisine, s'il reste de la place. La colonne qu'il quitte se ferme si elle n'a plus d'onglet. |
| Onglet suivant, précédent | `nextTab`, `previousTab` | L'onglet à droite (Ctrl+Tab) ou à gauche (Ctrl+Maj+Tab) de l'onglet actif, dans la colonne active, qui devient actif ; après le dernier revient le premier, et inversement. |
| Note partagée | `SharedNotes` | Une note ouverte dans plusieurs colonnes : un seul texte, que chaque frappe met à jour aussitôt dans toutes, et un seul enregistrement automatique. Chaque colonne garde son curseur, sa sélection, son défilement et son historique d'annulation : annuler n'y défait que ce qui y a été tapé. |
| Renommage | `notesMoved`, `notesChangedOutside` | Une note change de chemin : son titre tapé renomme son fichier, on la glisse dans un autre dossier, ou elle est renommée hors de l'application (une note ouverte disparaît et une seule autre apparaît au même moment). Tous ses onglets, dans toutes les colonnes, même ceux qui ne sont pas affichés, prennent son nouveau chemin et son nouveau titre. |
| Disposition gardée | `SavedLayout` | Les colonnes de la bibliothèque telles qu'on les a laissées — leurs largeurs, leurs onglets dans l'ordre, l'onglet actif de chacune, la colonne active —, retrouvées au relancement. Chaque bibliothèque a la sienne. Une note disparue entre-temps est oubliée sans message, une colonne restée sans onglet se ferme ; s'il ne reste rien, ou si la disposition est illisible, l'application démarre comme sans elle. |
| Modèle | `Template` | Note du dossier des modèles, qui sert de point de départ à une nouvelle note : réunion, journal, recette… Elle se crée et se modifie comme toute autre note. |
| Dossier des modèles | `templatesFolder` | Dossier de la bibliothèque choisi dans les réglages, dont chaque note est un modèle ; les notes de ses sous-dossiers n'en sont pas. Chaque bibliothèque a le sien, gardé d'un lancement à l'autre ; sans lui, il n'y a pas de modèle. Il reste un dossier ordinaire, visible dans la liste des dossiers. |
| Nouvelle note depuis un modèle | `newNoteFromTemplate` | Créer une note dans le dossier affiché à partir d'un modèle choisi au clavier, comme l'ouverture rapide, et l'ouvrir dans un nouvel onglet de la colonne active. Cmd+Maj+N ou la palette. La note reprend le texte et l'en-tête du modèle, sauf l'épinglage, ses variables remplacées ; son nom de fichier suit son titre. |
| Variable de modèle | `{{date}}`, `{{time}}`, `{{title}}` | Marque d'un modèle remplacée à la création de la note : `{{date}}` par la date du jour en toutes lettres, comme l'insertion de la date du jour ; `{{time}}` par l'heure, `HH:MM` ; `{{title}}` par le titre du modèle. |
