# 0050 — Carte mentale : une note dont le format est lu et écrit par le domaine, l'arbre et ses changements tenus par l'interface

- **Date** : 2026-11-23
- **Statut** : acceptée
- **Complète** les fiches 0034, 0037 et 0041 (types de contenu : un troisième type de fichier, `carte-mentale`, et un type d'élément, le nœud ; format de l'index 8).

## Contexte

Spécification validée par l'utilisateur le 23/11 : `doc/specs/carte-mentale.md`. Une carte mentale est une note ordinaire (titre, renommage, étiquettes, historique, iCloud) dont le fichier reste du Markdown lisible : en-tête, titre, liste à puces dont chaque puce est un nœud, détails en lignes `>`, couleur en commentaire HTML, place des nœuds racines dans la propriété `racines`.

## Décision

- **Domaine** (`domain::mind_map`) : `MindMap::parse` lit la liste (retrait compté en espaces, tabulation = 4 ; lignes hors format ignorées) et la propriété `racines` (valeurs absentes ou fausses remplacées par la place par défaut) ; `MindMap::written_on(original)` réécrit seulement la liste et `racines` (`with_key_line`) et laisse le reste de l'en-tête et le titre tels quels ; un fichier déjà écrit comme le fait l'application se réécrit à l'identique. `indexed_nodes` donne chaque nœud avec son chemin, pour l'index.
- **Type de contenu** : `ContentType::MindMap` (`"carte-mentale"`) est un type de fichier ; l'index passe au format 7 pour reclasser les cartes déjà indexées.
- **Cas d'usage et commandes** : `CreateMindMap` (nom de fichier tiré du titre), `ReadMindMap`, `SaveMindMap` ; commandes `create_mind_map(folder, title)`, `read_mind_map(path)`, `save_mind_map(path, map)`. Une note qui n'est pas une carte est refusée : « cette note n'est pas une carte mentale ».
- **Interface** : la carte lue est un arbre (`MindMapItem`). Ses changements (ajouter, supprimer, déplacer, colorier…) sont des fonctions pures testées sans navigateur (`ui/src/state/mind-map*.ts`) ; l'interface enregistre l'arbre entier par `save_mind_map` après chaque changement. Rust reste seul à connaître le format du fichier.

- **Colonne** : si la note montrée déclare `type: carte-mentale`, la carte (`screens/mind-map-view.ts`) remplace l'éditeur de texte, caché mais gardé pour l'enregistrement et l'historique (`screens/mind-map-pane.ts`). La disposition (`state/mind-map-layout.ts`), la vue (`state/mind-map-viewport.ts`), l'arbre (`state/mind-map.ts`) et l'annulation (`state/mind-map-history.ts`, 50 changements) sont des fonctions pures ; la mesure du texte vient du style, par un nœud caché. Le Markdown du titre et du détail passe par le rendu des notes ; les liens `[[titre]]` sont réécrits en liens avant le rendu.
- **Couleurs** : les 10 couleurs de la palette sont dans le thème (`--palette-<nom>`, renommées le 24/11 : voir la fiche 0052) ; fond d'un nœud coloré = 18 % de sa couleur sur le fond, par `color-mix`.
- **Plier** : les branches pliées sont gardées dans le stockage de l'interface, par chemin de note, jamais dans le fichier.
- **Création** : clic droit sur un dossier ou la racine (« Nouvelle note », « Nouvelle carte mentale », « Nouveau cahier de recherche »), palette, menu Fichier ; le nom est redemandé tant qu'il est vide (`app/new-contents.ts`).

## Conflit d'enregistrement (§ 8)

Avant chaque écriture, l'écran relit le fichier. S'il n'est plus tel que l'écran l'avait lu, les changements faits depuis (`state/mind-map-ops.ts` : texte, ajout, suppression, déplacement) sont refaits un à un sur sa nouvelle version (`screens/mind-map-saver.ts`) : un nœud est reconnu à son chemin ; un ajout dont le parent a disparu devient un nœud racine ; une suppression d'un nœud déjà disparu n'a rien à faire ; un changement de texte ou de couleur sans son nœud, un déplacement sans son nœud ou sa cible, ou une annulation, sont abandonnés : la carte est rechargée et « La carte est rechargée. » s'affiche. Un changement venu d'ailleurs pendant un enregistrement est montré dès qu'il est fini.

## Recherche (§ 9)

- Index au format 8 : table `nodes` (et `nodes_text`) rattachée à sa carte, comme les entrées d'un cahier ; `ContentType::Node` (« noeud »), conteneur = la carte, chemin du nœud gardé dans le résumé (`NoteSummary::node`) et rendu jusqu'à l'écran (`SearchResultItem.node`). La carte n'est cherchée par les mots que par son titre et ses étiquettes (`searchable_text`), pas par le texte de ses nœuds.
- Sens : chaque nœud donne un segment (`mind_map::segments`), de titre complet « titre de la carte > titre du nœud » et de texte son détail ; le chemin du nœud est gardé avec le segment (colonne `node`, comptée dans sa clé). Un résultat de sens est la carte, trouvée par son meilleur segment ; il ouvre la carte sur ce nœud.
- Liens : le texte du fichier contient déjà les `[[…]]` des nœuds : les liens entrants de la note désignée montrent la carte, et `[[titre de la carte]]` se résout comme pour une note (testé). Le filtre par étiquette voit la carte, ses étiquettes étant dans l'en-tête.
- Écran : « Nœud » est le nom montré du type ; un clic sur un résultat avec un chemin de nœud ouvre la carte et la fait « révéler » ce nœud (`Pane.revealNode`).

## Claude (§ 10)

- Outil `create_mind_map` (« Création d'une carte mentale » dans la colonne) : `title`, `folder` (racine par défaut, créé avec ses parents), `content` facultatif (la liste de départ, réécrite comme l'application l'écrit : `domain::mind_map::with_list`) ; passe par `CreateNote`, rend le chemin ; il change une note, donc le garde-fou du web le retient.
- Consigne : les instructions du serveur d'outils et la description de l'outil disent le format en bref et de n'écrire dans la liste que des puces et des lignes de détail, sans jamais toucher à `racines`. Claude lit et écrit le fichier avec ses outils de fichiers ; une carte ouverte se met à jour par la surveillance du dossier.
- `search_notes` rend aussi, sans type demandé, les nœuds : `path` (fichier de la carte) et `node` (chemin du nœud) ; `content_type` accepte `carte-mentale`.
- « Montrer une note » ouvre la note dans la colonne : une carte s'y montre en carte.

## Conséquences

- Le premier lancement de cette version relit tout l'espace de travail une fois (format 8).
- Les règles de modification (annulation, conflit) vivent côté interface.

## Double-clic et image (corrections du 23/11)

- **Double-clic sur un nœud** : un clic redessine tous les nœuds, et le navigateur ne dit plus ni « clic » ni « double-clic » quand l'élément pressé a été remplacé entre l'appui et le relâchement. La carte capture donc le pointeur à l'appui (comme la carte de référence) et retrouve le nœud sous le pointeur par `document.elementFromPoint`, sans quoi un double-clic sur un nœud existant ne le modifiait pas. Le bouton de pliage n'est pas capturé (son clic doit lui arriver).
- **Image de la carte** (§ 6.6) : `screens/mind-map-image.ts` recopie les nœuds et les liens affichés, chacun avec ses styles calculés, dans une image SVG (`foreignObject`), dessinée sur un canevas puis lue en PNG ; le cadre (marge de 40 points, 2 pixels par point) est calculé par `state/mind-map-image.ts`. L'interface envoie l'image à Rust en base64 dans des arguments JSON (`export_image(destination, png)`), pas en corps brut avec un en-tête comme `attach_file` : un corps brut n'arrive pas quand Tauri bascule de `ipc://` sur `postMessage` (il devient une liste JSON, l'image paraissait « pas reçue en entier »), et WebKit peut tronquer un gros corps ; Rust écrit le fichier par le port `ExportStore::write_image`. `ExportFormat::Png` ne sert qu'au nom proposé et au filtre de la fenêtre d'enregistrement ; le choix du format au clavier de l'export d'une note reste PDF ou Markdown.

## Image de la carte : nœuds décalés ou absents (correction du 24/11)

Dans l'application, l'image PNG montrait la carte décalée vers le haut et à gauche : des nœuds sortaient du cadre (haut coupé), les autres tombaient à côté de leurs liens, laissant des liens vers des emplacements vides. Cause, reproduite dans WebKit avec la carte de l'utilisateur : les nœuds (HTML dans `foreignObject`) étaient placés par un `x`/`y` sur le `foreignObject`, une translation du groupe SVG et des marges négatives ; WebKit n'applique pas ces décalages au contenu HTML comme aux liens (tracés SVG), d'où deux repères différents. Un `viewBox` qui met à l'échelle le `foreignObject` donne le même défaut (nœuds réduits de moitié). Règle retenue : le `foreignObject` couvre toute l'image à l'origine, sans aucun `x`/`y`, `viewBox` ni transformation SVG ; les nœuds sont posés en positions absolues dans un conteneur HTML décalé du coin du cadre (`left`/`top`) et mis à l'échelle (2) en CSS ; seuls les liens passent par la transformation SVG. Le test `e2e/mind-map-image.spec.ts` relit le PNG : taille du cadre égale à la carte plus 40 points de marge de chaque côté, et chaque nœud a sa zone dessinée.
