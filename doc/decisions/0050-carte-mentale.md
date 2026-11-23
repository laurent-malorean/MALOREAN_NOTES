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
- **Couleurs** : les 10 couleurs de la palette sont dans le thème (`--mind-map-<nom>`) ; fond d'un nœud coloré = 18 % de sa couleur sur le fond, par `color-mix`.
- **Plier** : les branches pliées sont gardées dans le stockage de l'interface, par chemin de note, jamais dans le fichier.
- **Création** : clic droit sur un dossier ou la racine (« Nouvelle note », « Nouvelle carte mentale », « Nouveau cahier de recherche »), palette, menu Fichier ; le nom est redemandé tant qu'il est vide (`app/new-contents.ts`).

## Conflit d'enregistrement (§ 8)

Avant chaque écriture, l'écran relit le fichier. S'il n'est plus tel que l'écran l'avait lu, les changements faits depuis (`state/mind-map-ops.ts` : texte, ajout, suppression, déplacement) sont refaits un à un sur sa nouvelle version (`screens/mind-map-saver.ts`) : un nœud est reconnu à son chemin ; un ajout dont le parent a disparu devient un nœud racine ; une suppression d'un nœud déjà disparu n'a rien à faire ; un changement de texte ou de couleur sans son nœud, un déplacement sans son nœud ou sa cible, ou une annulation, sont abandonnés : la carte est rechargée et « La carte est rechargée. » s'affiche. Un changement venu d'ailleurs pendant un enregistrement est montré dès qu'il est fini.

## Recherche (§ 9)

- Index au format 8 : table `nodes` (et `nodes_text`) rattachée à sa carte, comme les entrées d'un cahier ; `ContentType::Node` (« noeud »), conteneur = la carte, chemin du nœud gardé dans le résumé (`NoteSummary::node`) et rendu jusqu'à l'écran (`SearchResultItem.node`). La carte n'est cherchée par les mots que par son titre et ses étiquettes (`searchable_text`), pas par le texte de ses nœuds.
- Sens : chaque nœud donne un segment (`mind_map::segments`), de titre complet « titre de la carte > titre du nœud » et de texte son détail ; le chemin du nœud est gardé avec le segment (colonne `node`, comptée dans sa clé). Un résultat de sens est la carte, trouvée par son meilleur segment ; il ouvre la carte sur ce nœud.
- Liens : le texte du fichier contient déjà les `[[…]]` des nœuds : les liens entrants de la note désignée montrent la carte, et `[[titre de la carte]]` se résout comme pour une note (testé). Le filtre par étiquette voit la carte, ses étiquettes étant dans l'en-tête.
- Écran : « Nœud » est le nom montré du type ; un clic sur un résultat avec un chemin de nœud ouvre la carte et la fait « révéler » ce nœud (`Pane.revealNode`).

## Conséquences

- Le premier lancement de cette version relit tout l'espace de travail une fois (format 8).
- Les règles de modification (annulation, conflit) vivent côté interface.
