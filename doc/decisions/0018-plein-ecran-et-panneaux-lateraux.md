# 0018 — Plein écran et panneaux latéraux : deux réglages indépendants

- **Date** : 2026-11-17
- **Statut** : acceptée

## Contexte

Le plein écran cachait d'office les listes des dossiers et des notes. Avec les colonnes (fiche 0017), on veut souvent garder ces listes en plein écran pour passer d'une note à l'autre ; à l'inverse, on veut parfois les cacher sans quitter la fenêtre.

## Décision

- **Le plein écran ne change pas la disposition** : il agrandit la fenêtre, rien de plus. Les panneaux latéraux restent montrés ou cachés comme avant d'y entrer, et comme avant d'en sortir. Il vient du bouton, de Ctrl+Cmd+F, de la palette, ou du Mac (bouton vert, menu) ; la fenêtre fait foi.
- **Les panneaux latéraux** (listes des dossiers et des notes, ensemble) se cachent ou se montrent par un bouton, Ctrl+Cmd+S ou la palette, en plein écran comme en dehors. Les colonnes prennent alors toute la largeur, chacune gardant sa part.
- Leur choix est gardé dans le stockage de la page (`localStorage`), comme le mode focus (fiche 0011) : c'est un confort d'affichage. S'il est refusé, les panneaux sont montrés.
- Les deux réglages sont reliés à l'écran par un même module, `ui/src/screens/window-display.ts`, testé avec une fenêtre simulée.

## Conséquences

- Entrer en plein écran ne cache plus rien : qui veut seulement le texte cache aussi les panneaux (un clic ou Ctrl+Cmd+S), et ce choix tient au relancement.
- Ctrl+Cmd+S est pris par l'application ; aucune autre touche ne l'utilisait.
- On ne peut pas cacher une seule des deux listes.
