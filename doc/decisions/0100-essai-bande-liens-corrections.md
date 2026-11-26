# 0100 — Quatre échecs de l'essai de l'application réelle après la bande du haut unique : deux défauts de l'application, deux de scénario

- **Date** : 2026-11-26
- **Statut** : acceptée
- **Complète** les fiches 0054 (essai de l'application réelle), 0072 et 0098 (bande du haut), 0071 (menu des liens).

## Contexte

L'essai de l'application réelle (fenêtre de 1100 × 720 points) joué sur la bande du haut unique a échoué sur quatre scénarios. Les parcours Playwright à fenêtre large ne les voyaient pas. Les trois premiers se rejouent maintenant dans WebKit, à 1100 × 720, par le parcours `essai-window` (il joue les scénarios eux-mêmes) ; le quatrième par un parcours de `link-menu` dont l'écran ne se redessine pas.

## Décision

1. **Bouton des panneaux : « la bande tient en 56 points au plus » (98 mesurés) : défaut du scénario.** À 1100 points avec les deux listes montrées (200 et 280 points), la zone de l'éditeur n'a que 620 points : moins que les 672 points d'une ligne d'outils (fiche 0072). Deux lignes sont voulues, la bande fait 98 points. Le scénario mesure maintenant selon la place réelle : une ligne d'outils (56 points au plus) quand la zone a 672 points, deux lignes (100 points au plus) sinon, et, listes cachées, une ligne. La bande unique gagne toujours la barre de la fenêtre (38 points), sur une ou deux lignes ; la seconde ligne vient de la largeur, pas de la bande unique, et la supprimer à 1100 points demanderait de changer le seuil de 672 points, une décision de conception à part.
2. **Colonne Claude Code ouverte : une ligne décalée de 40 points : défaut de l'application.** Dans une zone plus étroite que l'affichage et la recherche à leur minimum (moins de 17,45 rem), l'affichage, seul sur sa ligne, restait collé à gauche de sa colonne alors que la fiche 0092 veut chaque ligne centrée. La règle CSS du seuil de 17,45 rem centre maintenant l'affichage sur toute la largeur. Le parcours `top-bar-rows` qui exigeait l'affichage collé à gauche exige désormais qu'il soit centré.
3. **Hauteur de l'arborescence : « la hauteur gardée est retrouvée : écart de -100 px » : défaut du scénario, pas de la poignée.** Le scénario monte une seconde liste des dossiers hors écran, dans une boîte de 260 points de large, pour relire le stockage. Depuis la bande unique, cette liste contient aussi la bande du haut, qui passe sur plusieurs lignes à cette largeur et vole de la hauteur à l'arborescence (la hauteur gardée est bornée par la place, comme voulu). Le scénario cache la bande de cette liste de mesure.
4. **Menu des liens `[[` hors de la fenêtre (0, 720) : défaut de l'application, qui existait avant la bande.** Le menu se posait dans un callback de mesure de CodeMirror, exécuté au prochain dessin de l'écran. Quand la fenêtre ne redessine pas (cachée, recouverte, ce qui est le cas de l'essai si l'écran est utilisé), le menu restait à la position où la page le met sans coordonnées : en bas à gauche, hors de la fenêtre. Le scénario n'avait jamais été vert sur ses vérifications de placement (la correction du 25/11 portait sur l'ouverture du menu). Le menu se pose maintenant dès la fin de la mise à jour de l'éditeur, sans attendre un dessin, et reste caché tant qu'il n'est pas posé ou si le curseur est hors de l'écran. Le parcours reproduit le défaut en rendant `requestAnimationFrame` sans effet, ce qui donne exactement les mesures de l'essai (x = 0, y = 720, 384 × 63,19).

## À confirmer par un nouvel essai réel

Le point 4 est reproduit en WebKit en supprimant les dessins ; qu'une fenêtre de l'essai recouverte ne redessine pas est l'explication la plus probable, non confirmée dans la vraie fenêtre. Les points 1 à 3 se jouent dans WebKit comme dans l'application ; le nouvel essai les confirme.
