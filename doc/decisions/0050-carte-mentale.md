# 0050 — Carte mentale : une note dont le format est lu et écrit par le domaine, l'arbre et ses changements tenus par l'interface

- **Date** : 2026-11-23
- **Statut** : acceptée
- **Complète** les fiches 0034, 0037 et 0041 (types de contenu : un troisième type de fichier, `carte-mentale` ; format de l'index 7).

## Contexte

Spécification validée par l'utilisateur le 23/11 : `doc/specs/carte-mentale.md`. Une carte mentale est une note ordinaire (titre, renommage, étiquettes, historique, iCloud) dont le fichier reste du Markdown lisible : en-tête, titre, liste à puces dont chaque puce est un nœud, détails en lignes `>`, couleur en commentaire HTML, place des nœuds racines dans la propriété `racines`.

## Décision

- **Domaine** (`domain::mind_map`) : `MindMap::parse` lit la liste (retrait compté en espaces, tabulation = 4 ; lignes hors format ignorées) et la propriété `racines` (valeurs absentes ou fausses remplacées par la place par défaut) ; `MindMap::written_on(original)` réécrit seulement la liste et `racines` (`with_key_line`) et laisse le reste de l'en-tête et le titre tels quels ; un fichier déjà écrit comme le fait l'application se réécrit à l'identique. `indexed_nodes` donne chaque nœud avec son chemin, pour l'index.
- **Type de contenu** : `ContentType::MindMap` (`"carte-mentale"`) est un type de fichier ; l'index passe au format 7 pour reclasser les cartes déjà indexées.
- **Cas d'usage et commandes** : `CreateMindMap` (nom de fichier tiré du titre), `ReadMindMap`, `SaveMindMap` ; commandes `create_mind_map(folder, title)`, `read_mind_map(path)`, `save_mind_map(path, map)`. Une note qui n'est pas une carte est refusée : « cette note n'est pas une carte mentale ».
- **Interface** : la carte lue est un arbre (`MindMapItem`). Ses changements (ajouter, supprimer, déplacer, colorier…) sont des fonctions pures testées sans navigateur (`ui/src/state/mind-map*.ts`) ; l'interface enregistre l'arbre entier par `save_mind_map` après chaque changement. Rust reste seul à connaître le format du fichier.

## Conséquences

- Le premier lancement de cette version relit tout l'espace de travail une fois (format 7).
- Les règles de modification (annulation, conflit) vivent côté interface : une version du fichier plus récente que celle lue est reprise par relecture.
