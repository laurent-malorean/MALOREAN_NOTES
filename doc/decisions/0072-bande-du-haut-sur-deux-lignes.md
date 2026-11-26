# 0072 — Bande du haut : une ligne si la zone du milieu a la place, deux lignes propres sinon

- **Date** : 2026-11-25
- **Statut** : acceptée
- **Complétée** par la fiche 0098 (la bande du haut est unique, en haut de toute la fenêtre ; seuils inchangés).
- **Complète** la fiche 0064 (bloc d'icônes d'affichage, une seule ligne) ; elle remplace son troisième point (« la recherche rétrécit, puis le dernier bloc passe à la ligne »).

## Contexte

Avec la colonne Claude Code ouverte (ou des panneaux larges), la zone du milieu est étroite : la bande du haut passait sur deux lignes de façon bancale (mise en forme et copies avec un champ de recherche tronqué en première ligne, le bloc d'affichage seul en seconde).

## Décision

- **Une seule ligne quand la place suffit** (rien ne change), **deux lignes propres sinon** : mise en forme puis copies en haut ; affichage puis champ de recherche, qui prend toute la largeur restante, dessous. Jamais de recherche tronquée ni de ligne à moitié vide.
- **Une règle CSS, pas de JavaScript** : `.editor-tools` est un conteneur de requête (`container: editor-tools / inline-size`), donc le choix suit la largeur de la zone du milieu, pas celle de la fenêtre (marche avec la colonne Claude Code, des panneaux larges, le plein écran). Les trois éléments sont dans une seule rangée (`tool-rows`, un flex) ; sous le seuil, `@container (max-width: 44.1rem)` en fait une grille à deux colonnes (la barre de mise en forme sur toute la largeur, puis l'affichage et la recherche).
- **Seuil : 44,1 rem (705,6 points à 16 px)**. Largeur mesurée des trois blocs, de leurs écarts et de la recherche à son minimum (6 rem) : 705,1 points. Une requête de conteneur n'accepte pas de variable CSS, d'où la valeur écrite à l'endroit de la règle, expliquée en commentaire et gardée par le parcours `top-bar-rows` (il vérifie le basculement à 8 points de part et d'autre de 705 points). Si une icône est ajoutée à un bloc, le seuil se recalcule.
- **Plus étroit encore** (essai de l'application réelle : 254 points avec les panneaux et la colonne Claude Code ouverts dans une petite fenêtre) : sous 19,5 rem (312 points : l'affichage et la recherche à son minimum ne tiennent plus côte à côte), la recherche passe seule sur une troisième ligne, pleine largeur ; sous 389 points la mise en forme et les copies ne tiennent plus côte à côte non plus, et les copies passent sous la mise en forme. Rien ne déborde, rien n'est caché.
- **Pas de saut** : la requête de conteneur s'applique à la mise en page même, sans calcul ni attente ; la hauteur de la bande suit son contenu, les colonnes dessous s'ajustent (grille de l'éditeur).
- **Écartée pour l'instant** : réduire la recherche à une loupe.

## Conséquences

- Tests : parcours Playwright `top-bar-rows` (une ligne large ; deux lignes avec la colonne Claude Code ouverte, la recherche plus large que son maximum d'une ligne ; basculement à la largeur nécessaire en thèmes clair et sombre ; balayage de largeurs ; 17 boutons visibles et nommés à deux lignes) ; scénario de l'essai de l'application réelle avec la colonne Claude Code ouverte, qui vérifie dans la vraie fenêtre que la disposition suit la largeur de la zone du milieu.
