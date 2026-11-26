# 0096 : dire combien de notes n'ont pas de texte dans l'index de sens

## Contexte

Dans l'onglet « Index » des réglages, l'index des notes affichait « 58 notes indexées » et l'index de sens
« Notes : 56 », sans explication : l'écart ressemblait à une erreur. Il n'en est pas une : l'index de sens ne
range que les notes qui ont au moins un segment ; une note vide, ou réduite à un titre, n'en a aucun (un titre
sans texte ne fait pas de segment).

## Décisions

- **Le nombre est dit, pas caché** : « Notes : 56 (2 sans texte) ». La parenthèse n'apparaît que lorsque le
  nombre est au moins 1 ; rien à 0.
- **Le calcul est mesuré** : notes de l'index de mots (celles qu'il connaît) moins notes de l'index de sens
  (celles qui ont au moins un segment). L'index de sens est tenu à jour avec l'index de mots, note par note :
  il ne peut pas connaître une note que l'index de mots ignore, donc la différence compte exactement les notes
  sans segment.
- **Les notes pas encore indexées ne sont pas « sans texte »** : on part des notes que l'index de mots connaît,
  non de celles de l'espace de travail. Pendant une reconstruction, l'écart des deux index de notes ne vient pas
  gonfler le compte ; l'avancement se lit dans la barre de l'index des notes.
- **Où** : Rust ajoute `notesWithoutText` à l'état de la recherche par le sens (déjà envoyé à l'écran) ; l'écran
  l'écrit sur la ligne « Notes ». Sans espace de travail ouvert : 0.

## Contrôles

Test de session (une note avec texte, une réduite à un titre, une vide : 1 note, 2 sans texte), test de la
commande (nom du champ, 0 sans texte), tests de l'état et de l'écran (parenthèse présente à partir de 1,
absente à 0, séparateur de milliers).
