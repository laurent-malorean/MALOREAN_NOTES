# Une seule bande en haut de la fenêtre

Spécification fonctionnelle (26/11/2026), demandée par l'utilisateur : « On perd une ligne juste pour ça, repense ton design » (option choisie : une seule bande avec la barre d'outils). Ce document se lit seul.

## 1. Besoin

Le haut de la fenêtre avait deux étages : une barre fine qui ne portait que le bouton des panneaux latéraux (à côté des boutons rouge, jaune et vert du Mac), puis, dessous, les outils (mise en forme, copies, affichage, recherche). Une ligne entière de l'écran était perdue pour un seul bouton. Il n'y a plus qu'une bande.

## 2. Comportement

- **Une seule bande** tout en haut, de gauche à droite : les trois boutons du Mac, le bouton des panneaux latéraux, puis les outils (mise en forme, copies, affichage) au milieu de la zone de l'éditeur, puis la recherche. Les listes (dossiers, notes) et les colonnes d'édition commencent sous cette bande.
- **Gain de hauteur** : le haut des onglets monte d'environ 40 points (94 → 54 points).
- **Les boutons du Mac sont au milieu de la première ligne de la bande**, comme le bouton des panneaux.
- **Les outils ne passent jamais sous les boutons du Mac ni sous le bouton des panneaux** : panneaux montrés, ils sont dans la zone à droite des listes ; panneaux cachés, la zone s'élargit jusqu'au bord gauche mais les outils restent au milieu de l'espace à droite de ces boutons.
- **Fenêtre étroite ou colonne Claude Code ouverte** : la règle des deux lignes est inchangée (mise en forme et copies en haut, affichage et recherche dessous) ; la bande grandit, les boutons du Mac et le bouton des panneaux restent sur la première ligne. Aucun bouton coupé, rien ne déborde.
- **Rien d'autre ne change** : le bouton des panneaux (nom, bulle d'aide, Cmd+0, icône selon l'état), l'ordre et les groupes des outils, le glisser de la fenêtre par un vide de la bande (un double-clic l'agrandit), jamais par un bouton ni par le champ de recherche.
- **Plein écran du Mac** : les boutons du Mac disparaissent mais leur place reste réservée à gauche (point connu, comme avant).

## 3. Vérifié

Parcours `window-bar`, `top-bar-centered`, `top-bar-rows` et `display-tools` ; scénarios « Bande du haut » de l'essai de l'application réelle (fiche 0098). Le centrage des boutons du Mac eux-mêmes se vérifie à l'œil dans la vraie fenêtre.
