# Bande du haut centrée

Spécification fonctionnelle (26/11/2026), demandée par l'utilisateur (« centre »). Ce document se lit seul.

## 1. Besoin

La bande du haut (gras, italique, lien, titres, listes, date ; copies ; focus, plan, machine à écrire, plein écran, Claude ; champ « Rechercher dans toutes les notes ») était collée à droite de la fenêtre, loin du texte. Elle doit être au milieu de ce qu'elle sert.

## 2. Comportement

- **Centrée dans la zone de l'éditeur** : le milieu de la bande est le milieu de la zone à droite des colonnes de navigation (et à gauche de la colonne Claude Code si elle est ouverte), pas celui de la fenêtre.
- **Panneaux cachés** : la zone s'élargit jusqu'au bord gauche de la fenêtre, mais la bande reste au milieu de l'espace à droite des boutons de fenêtre du Mac et du bouton des panneaux (jamais dessous). **Colonne Claude Code ouverte** : la zone rétrécit, la bande se centre dans ce qui reste.
- **Deux lignes** quand la place manque (règle inchangée) : la première ligne (mise en forme et copies) est centrée ; la seconde (affichage et recherche, qui prend toute la largeur restante) remplit la zone, donc elle est centrée aussi.
- **Rien d'autre ne change** : même ordre des boutons, mêmes groupes, mêmes seuils ; aucun bouton coupé, rien ne déborde, le champ de recherche n'est jamais repoussé hors de l'écran.

## 3. Vérifié

Parcours `top-bar-centered` (écart du milieu de chaque ligne à celui de la zone au plus 1 point), `top-bar-rows`, `display-tools` ; scénario « Bande du haut » de l'essai de l'application réelle (fiches 0092 et 0098).
