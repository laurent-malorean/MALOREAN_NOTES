# Une seule bande en haut de la fenêtre

Spécification fonctionnelle (26/11/2026), demandée par l'utilisateur : « On perd une ligne juste pour ça, repense ton design » (option choisie : une seule bande avec la barre d'outils). Ce document se lit seul.

## 1. Besoin

Le haut de la fenêtre avait deux étages : une barre fine qui ne portait que le bouton des panneaux latéraux (à côté des boutons rouge, jaune et vert du Mac), puis, dessous, les outils (mise en forme, copies, affichage, recherche). Une ligne entière de l'écran était perdue pour un seul bouton. Il n'y a plus qu'une bande.

## 2. Comportement

- **Une seule bande** tout en haut, de gauche à droite : les trois boutons du Mac, le bouton des panneaux latéraux, puis les outils (mise en forme, copies, affichage) au milieu de la zone de l'éditeur, puis la recherche. Les listes (dossiers, notes) et les colonnes d'édition commencent sous cette bande.
- **Gain de hauteur** : le haut des onglets monte d'environ 40 points (94 → 54 points).
- **Les boutons du Mac sont au milieu de la première ligne de la bande**, comme le bouton des panneaux.
- **Les outils ne passent jamais sous les boutons du Mac ni sous le bouton des panneaux** : panneaux montrés, ils sont dans la zone à droite des listes ; panneaux cachés, la zone s'élargit jusqu'au bord gauche mais les outils restent au milieu de l'espace à droite de ces boutons.
- **Fenêtre étroite ou colonne Claude Code ouverte** : la règle des deux lignes est inchangée (mise en forme et copies en haut, affichage et recherche dessous) ; la bande grandit, les boutons du Mac et le bouton des panneaux restent sur la première ligne. Aucun bouton coupé, rien ne déborde. À 1100 points de large avec les deux listes montrées, la zone de l'éditeur est trop étroite pour une ligne : la bande est sur deux lignes (environ 98 points) ; listes cachées, elle tient sur une ligne. Dans une zone très étroite, chaque ligne (mise en forme, copies, affichage, recherche) est centrée.
- **De l'air entre les blocs** (28/11/2026, demande de l'utilisateur : les blocs étaient presque collés) : 12 points entre deux blocs voisins (mise en forme, copies, affichage, recherche), contre 6,4 points avant. La valeur est celle du thème (`--tool-block-gap`, un pas de l'échelle d'espacement). Ce surplus agrandit la largeur d'une ligne : la bande passe sur deux lignes à 722,4 points utiles (45,15 rem) au lieu de 705,6, et la recherche seule sur une troisième ligne sous 283,2 points (17,7 rem) au lieu de 279,2.
- **La recherche a la hauteur d'un bloc** : le champ « Rechercher dans toutes les notes » mesure exactement la hauteur d'une pilule (37,2 points, variable du thème `--format-pill-height`), au lieu de 25 ; il est donc aligné sur les blocs, en haut comme en bas, sur une ligne comme sur deux. Sa largeur et son comportement ne changent pas.
- **Rien d'autre ne change** : le bouton des panneaux (nom, bulle d'aide, Cmd+0, icône selon l'état), l'ordre et les groupes des outils, le glisser de la fenêtre par un vide de la bande (un double-clic l'agrandit), jamais par un bouton ni par le champ de recherche.
- **Plein écran du Mac** : les boutons du Mac disparaissent mais leur place reste réservée à gauche (point connu, comme avant).

## 3. Vérifié

Parcours `window-bar`, `top-bar-centered`, `top-bar-rows`, `top-bar-spacing` (écart d'au moins 12 points entre blocs voisins, hauteur de la recherche égale à celle d'une pilule, en thèmes clair et sombre, sur une, deux et trois lignes, sans débordement) et `display-tools` ; scénarios « Bande du haut » de l'essai de l'application réelle (fiche 0098). Le centrage des boutons du Mac eux-mêmes se vérifie à l'œil dans la vraie fenêtre.
