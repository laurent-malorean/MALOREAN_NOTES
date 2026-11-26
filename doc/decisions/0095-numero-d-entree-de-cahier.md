# 0095 : le numéro d'entrée d'un cahier de recherche

## Contexte

Pour citer une section d'un cahier de recherche, l'ancre (`2026-11-20-09h42`) est trop longue à dire ou à écrire.
L'utilisateur veut un numéro court, croissant, visible à côté de chaque entrée.

## Décision

- **Le numéro est la position de l'entrée dans le cahier** (ordre du fichier, à partir de 1). Un cahier ne se modifie
  jamais et l'on n'y ajoute qu'à la fin (fiche 0041) : le numéro d'une entrée est donc stable. Il est **calculé**,
  jamais écrit dans le fichier Markdown : aucune migration, les cahiers existants sont numérotés d'office.
- **Affichage** : 4 chiffres (`0001`), au-delà de 9999 le nombre complet (`10000`) ; un bouton dans la marge gauche,
  centré sur la première ligne de l'entrée, aux couleurs du thème. Il se lit et se vise sans effort (retour de
  l'utilisateur du 26/11 : « bien trop petit ») : texte à chasse fixe de la taille du texte du cahier (18 px par défaut,
  il suit le réglage de taille), hauteur d'une cible de clic (32 px, `--target-size`), retraits de 12 px, coins de
  8 px (`--control-radius`), largeur de 4 chiffres (71 px à 18 px de texte ; avant : 48 × 19 px, texte de 11 px). Plus
  haut que la ligne (29,7 px), il déborde dans la marge sans rien repousser (position absolue) ; deux entrées
  voisines sont au moins à 44 px l'une de l'autre (ligne + espace avant l'entrée), soit 12 px de vide entre deux
  numéros : pas de chevauchement. Le cahier a une marge gauche élargie (92 px, avant 66 px) pour que le bouton ne
  recouvre jamais le texte, y compris un nombre de 5 chiffres (colonne étroite comprise).
- **Où il est calculé** : à l'écran, par l'éditeur, au même endroit que la barre d'entrée (le n-ième élément de liste
  du premier niveau du cahier) ; l'écran lit le texte du cahier, pas la liste d'entrées de Rust. L'outil `add_entry`
  rend en plus le numéro de l'entrée ajoutée (`number`, calculé par le domaine dans `Entry`), peu coûteux puisque le
  domaine lit déjà les entrées.
- **Le numéro est un bouton** (focus clavier, infobulle et nom accessible « Copier la référence de l'entrée 0007 »).
  Un clic copie `Titre du cahier · 0007` par la copie en texte brut existante et affiche « Référence copiée ».
- **Choix écartés** : un lien par numéro dans une autre note (étape suivante, pas de syntaxe inventée ici ; le lien
  `[[note#ancre]]` n'existe pas, et `(#ancre)` ne marche que dans le cahier lui-même) ; une renumérotation ; une
  recherche par numéro.

## Contrôles

Tests d'écran de l'éditeur : numéros dans l'ordre, sur 4 chiffres, nombre complet au-delà de 9999, aucun numéro dans
un cahier vide ni une note ordinaire, taille du texte et hauteur de cible, centrage sur la première ligne à 1 px près, pas de chevauchement du texte
(largeur étroite, grande taille de texte) ni des numéros voisins, une entrée ajoutée prend le numéro suivant ; clic copie la référence et montre le message. Tests Rust :
numéro de l'entrée ajoutée, y compris pour l'outil `add_entry`.
