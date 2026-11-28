# Déplacer un bloc de texte

Spécification fonctionnelle rédigée le 27/11, **validée par l'utilisateur le 28/11** (demande de développement). Ce document se lit seul.

## 1. Idée

Comme dans Notion : quand on passe la souris sur un paragraphe, un titre, un élément de liste… deux petits boutons apparaissent dans la marge à sa gauche. Le premier ajoute un bloc dessous, le second, une poignée, permet de saisir le bloc et de le glisser ailleurs dans la note. Rien ne change dans le fichier que l'ordre des lignes de Markdown.

## 2. Vocabulaire

- **Bloc de texte** : un morceau de la note qui se déplace d'un seul geste (§ 3).
- **Poignée de bloc** : le bouton à six points (⋮⋮) dans la marge à gauche d'un bloc ; on le glisse vers le haut ou vers le bas pour déplacer le bloc.
- **Bouton d'insertion** : le bouton « + » à gauche de la poignée ; il ajoute un paragraphe vide sous le bloc.
- **Repère de dépôt** : la ligne horizontale colorée qui montre, pendant le glissement, où le bloc va tomber.

Ces mots entrent dans `doc/ontology.md` avant le code.

## 3. Ce qu'est un bloc de texte

Un bloc de texte est lu dans le Markdown de la note, au premier niveau :

- **un paragraphe** : les lignes qui se suivent jusqu'à une ligne vide ;
- **un titre** : sa ligne seule ; ses paragraphes ne le suivent pas **(à valider)** ;
- **un élément de liste** (à puces, numérotée, case à cocher), **avec tous ses sous-éléments** ;
- **une citation** : toutes ses lignes ;
- **un bloc de code** : de la ligne d'ouverture à la ligne de fermeture ;
- **un tableau**, **une ligne de séparation**, **une image** seule sur sa ligne.

L'en-tête de la note (le bloc YAML en tête de fichier) n'est pas un bloc de texte : il reste en haut et n'a pas de poignée.

## 4. Les boutons dans la marge

- Ils apparaissent **au survol du bloc** avec la souris, et disparaissent quand elle s'en va **(à valider)** ; ils sont dans la marge qui existe déjà à gauche du texte, sans le décaler.
- Un bloc multiligne (liste, tableau, code) a une seule paire de boutons, alignée sur sa première ligne.
- Même taille, mêmes couleurs et même survol que les autres boutons-icônes de l'application (valeurs du thème).
- Bulles d'aide : « Ajouter un bloc dessous » et « Glisser pour déplacer ».
- Absents sur une note en lecture seule (corbeille, cahier de recherche), et pendant une saisie vocale.

## 5. Déplacer en glissant

1. Appuyer sur la poignée et la glisser vers le haut ou vers le bas, comme dans Notion : le bloc entier se met en retrait grisé à sa place, et le repère de dépôt suit la souris entre les blocs.
2. Relâcher : le bloc est retiré d'où il était et posé à l'endroit du repère. Le curseur reste dans le bloc déplacé.
3. **Échap** pendant le glissement, ou relâcher sur la place d'origine : rien ne change. Un clic sur la poignée, sans glisser, ne fait rien : il n'y a pas de menu.
4. Près du haut ou du bas de la zone visible, la note défile toute seule pour atteindre une place éloignée.
5. Le glissement reste dans la même note : pas d'une note à une autre, ni d'une colonne à l'autre.

### 5.1 Ce qui se passe dans le fichier

- Seules les lignes du bloc changent de place ; le texte du bloc n'est pas modifié.
- **Lignes vides** : entre deux blocs de paragraphe, de titre, de citation, de code ou de tableau, il reste une seule ligne vide, avant comme après le bloc déplacé. Entre deux éléments d'une même liste, il n'y en a pas.
- **Élément de liste** : il prend le niveau de retrait de l'élément voisin devant lequel il est déposé ; ses sous-éléments le suivent en gardant leur retrait relatif **(à valider)**. Déposé entre deux paragraphes, il forme une liste à lui seul.
- **Liste numérotée** : les numéros sont refaits dans l'ordre, dans la liste de départ et dans celle d'arrivée.
- **Une seule étape d'annulation** : Cmd + Z remet le bloc à sa place d'origine en un coup, Cmd + Maj + Z le redéplace.
- Le changement s'enregistre, et entre dans l'historique des versions, comme n'importe quelle modification.

## 6. Le bouton d'insertion

- Un clic sur « + » ajoute **une ligne vide sous le bloc** (après le dernier sous-élément s'il s'agit d'une liste) et y place le curseur ; l'utilisateur écrit ensuite en Markdown comme d'habitude (`#`, `-`, `>`…). Aucun menu de types de bloc **(à valider)**.
- Sous un élément de liste, la nouvelle ligne est un nouvel élément de la même liste, au même niveau.
- Une seule étape d'annulation.

## 7. Où ça marche

- Dans l'éditeur de texte d'une note et dans celui d'un brouillon d'entrée de cahier de recherche : partout où l'on écrit du Markdown avec l'éditeur habituel **(à valider)**.
- Pas dans les champs de formulaire, les nœuds de canvas ni de carte mentale, ni dans une note en lecture seule.
- Au pointeur seulement. Pas de gestes tactiles dans cette version.

## 8. Contraintes techniques

- Aucun nouveau format de fichier : le déplacement est une modification de texte (une seule transaction de l'éditeur), vue par la synchronisation et les versions comme une édition ordinaire.
- Les blocs sont lus dans l'arbre syntaxique du Markdown de l'éditeur, pas par des expressions régulières sur le texte.
- Le repère de dépôt et le retrait grisé sont des décors de l'éditeur, jamais du contenu.
- Les mots affichés (bulles d'aide) sont en français.

## 9. Hors périmètre

- Déplacer plusieurs blocs d'un coup, sélectionner un bloc entier, copier ou dupliquer un bloc.
- Transformer un bloc en un autre type (menu « Transformer en »), menu de types au « + » ou à la barre oblique.
- Déplacer un titre avec toute sa section (le panneau Plan reste l'outil de la structure).
- Déplacer un bloc vers une autre note, une autre colonne ou un autre type de contenu.
- Colonnes côte à côte dans une note.
- Menu de la poignée, raccourci clavier ou boutons « Monter » et « Descendre » : le déplacement se fait uniquement en glissant la poignée.

## 10. À valider

1. Un titre se déplace seul, sans les paragraphes qui le suivent.
2. Les boutons apparaissent seulement au survol du bloc.
3. Un élément de liste prend le niveau de son voisin au dépôt, ses sous-éléments le suivent.
4. Le « + » ajoute une ligne vide dessous, sans menu de types de bloc.
5. Périmètre : les éditeurs de texte (notes, brouillons de cahier), jamais d'une note à l'autre.

## 11. Interface réalisée

- **Lecture des blocs** : dans l'arbre syntaxique du Markdown de l'éditeur, au premier niveau. Chaque élément de liste, à tous les niveaux, est un bloc (un sous-élément se déplace seul, avec ses propres sous-éléments) ; un bloc de HTML, une référence de lien ou du code indenté sont aussi des blocs. Une image seule sur sa ligne est un paragraphe. L'en-tête YAML n'est pas un bloc.
- **Boutons** : une seule paire (« + » puis ⋮⋮), posée dans la marge à gauche du texte (dans la place des 2 rem de marge de l'éditeur, 16 px par bouton), sur la première ligne du bloc survolé. Le bloc survolé est le plus profond qui contient la ligne sous la souris : sur la ligne d'un sous-élément, c'est lui ; sur celle de son parent, c'est le parent. Les boutons restent quand la souris va dans la marge à la hauteur du bloc ; ils s'effacent quand elle sort de l'éditeur, passe entre deux blocs ou sous la fin de la note, quand le texte change, en lecture seule et pendant une saisie vocale.
- **« + »** : sous un bloc quelconque, une ligne vide séparée du bloc et du bloc suivant par une ligne vide, le curseur dessus ; sous un élément de liste (après ses sous-éléments), un nouvel élément au même niveau, avec la même puce (ou le numéro suivant, les suivants renumérotés, ou la case à cocher). Une seule étape d'annulation.
- **Glisser** : seuil de 4 points avant que l'appui devienne un glissement (avant, un clic ne fait rien) ; le bloc est voilé aux couleurs du fond, le repère de dépôt (3 px, couleur d'accent) se pose devant le bloc le plus proche du pointeur, ou sous la dernière ligne de la note ; la note défile tant que le pointeur reste à moins de 48 px du haut ou du bas de la zone visible ; Échap, un changement du texte ou l'annulation du pointeur abandonnent. Aucun repère devant le bloc lui-même ni dans ses sous-éléments. Derrière lui, un paragraphe, un titre ou autre bloc non liste n'a pas de repère ; un élément de liste en a un (il peut y changer de niveau), et le dépôt ne change rien s'il garde son niveau.
- **Dépôt** : une seule transaction de l'éditeur (le plus court remplacement entre l'ancien et le nouveau texte), isolée dans l'historique ; le curseur est au début de la première ligne du bloc déplacé ; la note reprend le focus.
- **Lignes vides** : une seule ligne vide entre deux blocs (même si la note en avait davantage à cet endroit) ; aucune entre deux éléments de la même liste (une liste espacée perd ses lignes vides autour de l'élément déplacé) ; les lignes vides de tête, la fin de note et l'en-tête restent en place.
- **Éléments de liste** : l'élément prend le retrait de l'élément du même genre (puce ou numéroté) devant lequel il est déposé, à défaut de celui qui le précède (dernier élément d'une liste), sinon aucun retrait (il forme une liste à lui seul, séparée par une ligne vide). Ses sous-éléments gardent leur retrait relatif. Les numéros sont refaits dans la liste de départ et la liste d'arrivée à partir du numéro de départ de chaque liste, sous-listes numérotées comprises ; les autres listes ne sont pas touchées.
- **Limite** : un élément déposé entre la fin d'une sous-liste et l'élément suivant du niveau au-dessus prend le niveau de ce dernier (jamais celui de la fin de la sous-liste) ; pour le faire entrer dans la sous-liste, on le dépose devant un de ses éléments.
- **Où** : tous les éditeurs de texte d'une note, sauf en lecture seule (corbeille, cahier de recherche) ; une entrée de cahier s'écrit dans une zone de saisie à part, sans boutons.
- **Code** : lecture, déplacement et ajout sont des fonctions pures (`ui/src/editor/blocks/read-blocks.ts`, `move-block.ts`, `add-block.ts`, `renumber.ts`), testées sans écran ; les boutons et le glissement sont dans `block-handles.ts` et `block-drag.ts`. Décision : `doc/decisions/0106-deplacer-un-bloc.md`.
