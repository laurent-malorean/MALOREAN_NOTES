# 0095 : le numéro d'entrée d'un cahier de recherche

## Contexte

Pour citer une section d'un cahier de recherche, l'ancre (`2026-11-20-09h42`) est trop longue à dire ou à écrire.
L'utilisateur veut un numéro court, croissant, visible à côté de chaque entrée.

## Décision

- **Le numéro est la position de l'entrée dans le cahier** (ordre du fichier, à partir de 1). Un cahier ne se modifie
  jamais et l'on n'y ajoute qu'à la fin (fiche 0041) : le numéro d'une entrée est donc stable. Il est **calculé**,
  jamais écrit dans le fichier Markdown : aucune migration, les cahiers existants sont numérotés d'office.
- **Affichage** : 4 chiffres (`0001`), au-delà de 9999 le nombre complet (`10000`) ; un rectangle fin dans la marge
  gauche, en face de la première ligne de l'entrée, aux couleurs du thème. Le cahier a une marge gauche élargie pour
  que le rectangle ne recouvre jamais le texte (colonne étroite comprise).
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
un cahier vide ni une note ordinaire, alignement sur la première ligne, pas de chevauchement du texte (largeur
étroite), une entrée ajoutée prend le numéro suivant ; clic copie la référence et montre le message. Tests Rust :
numéro de l'entrée ajoutée, y compris pour l'outil `add_entry`.
