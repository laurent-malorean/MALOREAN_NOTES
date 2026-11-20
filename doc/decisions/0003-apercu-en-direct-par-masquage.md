# 0003 — Aperçu en direct : masquer la syntaxe hors de la ligne en cours

- **Date** : 2026-11-16
- **Statut** : acceptée
- **Note (20/11/2026)** : les marques d'un lien entre notes sont cachées tant que le curseur ne touche pas le lien : voir la révision du 20/11 de la fiche 0016.

## Contexte

L'éditeur affichait le Markdown brut. On veut voir la note mise en forme (titres, gras, listes, cases à cocher) sans perdre le principe fondateur : le fichier reste exactement le Markdown tapé. Deux voies : un éditeur WYSIWYG (modèle de document interne, réécrit en Markdown à l'enregistrement), ou un aperçu dans l'éditeur Markdown lui-même.

## Décision

Aperçu en direct dans CodeMirror : la syntaxe (`#`, `**`, `>`, `[ ](…)`) est **masquée par des décorations**, des éléments sont **dessinés** à la place (puce, case à cocher cliquable, séparateur), et **la syntaxe réapparaît sur la ligne où se trouve le curseur**. Le calcul de ce qu'il faut masquer est une fonction pure, testée sans navigateur ; une extension CodeMirror l'applique à la partie visible du document.

## Conséquences

- Le fichier n'est jamais réécrit par l'affichage : aucune perte de format, aucune « correction » d'une note écrite ailleurs.
- On garde CodeMirror et toute l'architecture ; chaque élément (images, tableaux, blocs de code) s'ajoute un par un.
- Ce n'est pas un vrai WYSIWYG : la syntaxe se montre quand on édite une ligne, comme dans Obsidian ou Typora.
