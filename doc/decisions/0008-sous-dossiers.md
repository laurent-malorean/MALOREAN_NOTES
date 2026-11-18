# 0008 — Sous-dossiers : une note est désignée par son chemin depuis la bibliothèque

- **Date** : 2026-11-16
- **Statut** : acceptée

## Contexte

Jusqu'ici, une bibliothèque n'avait qu'un niveau : une note était désignée par son seul nom de fichier. On veut ranger les notes dans de vrais dossiers du disque, à toute profondeur, les créer, les renommer et les déplacer depuis une colonne de dossiers.

## Décision

- Le domaine connaît trois valeurs : **nom de dossier** (`FolderName`, tel que l'utilisateur l'a écrit, jamais caché ni terminé par `.assets`), **dossier** (`Folder`, suite de noms ; la racine est la bibliothèque) et **chemin de note** (`NotePath`, dossier + nom de fichier). Tout ce qui vient de la page est converti en l'une d'elles à l'entrée ; un chemin qui sortirait de la bibliothèque ne peut pas s'écrire.
- Entre la page et Rust, une note ou un dossier voyage sous forme de chemin relatif : `Travail/Réunions/lundi.md`, `Travail/Réunions`, `""` pour la racine.
- Le nom d'une note suit toujours son titre, mais seulement parmi les notes de **son** dossier : deux dossiers peuvent contenir chacun `idee.md`.
- Le port de stockage liste les notes d'un dossier (sans ses sous-dossiers), tous les dossiers, crée un dossier et **déplace** un dossier. Renommer un dossier, c'est le déplacer à côté de lui-même : une seule opération à tester. Les règles (pas de dossier dans lui-même, la racine ne bouge pas) sont dans les cas d'usage, pas dans le stockage.
- Sur le disque, les dossiers cachés, les dossiers de pièces jointes et les liens symboliques ne sont pas des dossiers de notes. Les noms sont comparés à l'identique : sur un disque qui ignore la casse, renommer `travail` en `Travail` fonctionne.
- Le glisser-déposer de la fenêtre est laissé à la page (`dragDropEnabled: false`) : c'est elle qui gère le déplacement des dossiers, et plus tard celui des notes et des images.

## Conséquences

- Une image relative est cherchée à côté de la note, dans son dossier.
- Déplacer ou renommer un dossier change le chemin des notes qu'il contient : la page enregistre d'abord la note ouverte, puis suit son nouveau chemin.
- Déplacer une note d'un dossier à l'autre passe par le même port (`move_note`, dont le renommage dans son dossier est un cas particulier). La note emporte son dossier de pièces jointes, qui reste à côté d'elle : ses liens relatifs restent justes. Si son nom est pris dans le dossier d'arrivée, elle reçoit le premier suffixe libre (`-2`, `-3`…) et ses liens vers ses pièces jointes suivent ; la poser sur son propre dossier ne fait rien.
- Après un déplacement de note, la liste reste sur le dossier affiché (la note en disparaît). Si c'était la note ouverte, ce qui vient d'être tapé est enregistré d'abord, puis elle reste ouverte sous son nouveau chemin.
- Dans la colonne des dossiers, chaque dossier a son icône ; ceux qui ont des sous-dossiers ont une flèche de dépliage qui les plie ou les déplie sans les choisir (→ et ← au clavier). Les dossiers pliés font partie de l'état de l'écran ; ils sont gardés pour chaque bibliothèque dans le stockage de la page, comme la disposition des colonnes, et suivent un dossier renommé ou déplacé. Choisir un dossier, ou y déposer une note, déplie ceux qui le contiennent : le dossier affiché reste toujours visible.
