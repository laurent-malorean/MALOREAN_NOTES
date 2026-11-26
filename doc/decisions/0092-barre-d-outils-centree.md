# 0092 : la bande du haut est centrée dans la zone de l'éditeur

- **Date** : 2026-11-26
- **Statut** : acceptée, demande de l'utilisateur (« centre »)
- **Complète** les fiches 0072 (une ou deux lignes) et 0085 (seuils recalculés).

## Contexte

La bande du haut (barre de mise en forme, copies, affichage, recherche) était rangée contre le bord droit de la zone de l'éditeur, loin du texte, avec un grand vide à sa gauche.

## Décision

- **Chaque ligne de la bande est centrée dans la zone de l'éditeur** (la zone à droite des panneaux latéraux, à gauche de la colonne Claude Code), pas dans toute la fenêtre : elle reste centrée par rapport au contenu qu'elle sert. Panneaux cachés, la zone s'élargit et la bande suit ; colonne Claude Code ouverte, la zone rétrécit et la bande se centre dans ce qui reste.
- **Une règle CSS, aucun JavaScript** : `justify-content: center` sur la rangée `tool-rows`, sur la barre de mise en forme et, sous le seuil, sur la barre de mise en forme dans la grille à deux lignes (elle était alignée à gauche).
- **Rien d'autre ne change** : même ordre, mêmes blocs, mêmes seuils (42,05 rem et 17,45 rem). Une ligne : les quatre éléments centrés ; la recherche grandit jusqu'à 20 rem puis la bande se centre. Deux lignes : la première (mise en forme et copies) est centrée ; la seconde (affichage et recherche, qui prend toute la largeur restante) remplit la zone, donc son milieu est celui de la zone.

## Conséquences

- Tests : parcours Playwright `top-bar-centered` (milieu de chaque ligne = milieu de la zone à 1 point près : fenêtre large, juste au-dessus et au-dessous du seuil, deux lignes, colonne Claude Code ouverte puis fermée, panneaux cachés puis montrés, panneaux cachés avec la colonne Claude Code ; aucun bouton coupé, aucun débordement de la bande ni de la page). Les parcours `top-bar-rows`, `display-tools`, `format-bar` et `window-bar` passent sans changement.
- Scénario « Bande du haut » de l'essai de l'application réelle : le même centrage mesuré dans la vraie fenêtre.
