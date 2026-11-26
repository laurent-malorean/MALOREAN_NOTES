# 0085 — Bouton des panneaux latéraux : dans la barre de la fenêtre, à côté des boutons de fenêtre du Mac

- **Date** : 2026-11-26
- **Statut** : acceptée, demande de l'utilisateur (« pouvoir cacher les 2 colonnes de navigation comme dans Obsidian »)
- **Complète** les fiches 0018 (panneaux latéraux), 0064 (bloc d'icônes d'affichage) et 0072 (bande du haut sur deux lignes).

## Contexte

Cacher et montrer ensemble la liste des dossiers et celle des notes existait déjà (Cmd+0, menu Présentation, réglage gardé), mais le bouton « Panneaux » était noyé dans le bloc d'icônes d'affichage de l'éditeur, loin et peu visible. Dans Obsidian, un bouton « panneau latéral » est tout en haut à gauche de la fenêtre, à côté des trois boutons rouge, jaune et vert, toujours visible, même panneaux cachés ; son icône dit l'état.

## Décision

1. **Une barre de la fenêtre** (`window-bar`) remplace la barre de titre du Mac : `titleBarStyle: "Overlay"`, `hiddenTitle: true` et `trafficLightPosition` (x 14, y 19, le centre des trois boutons est à 19 points du haut, au milieu d'une barre de 38 points) dans `crates/app/tauri.conf.json`. La barre est fixe, tout en haut, sur toute la largeur ; la fenêtre commence dessous (`#app` a pour marge haute la hauteur de la barre). Les tailles (38 points de haut, 78 points réservés aux boutons de fenêtre, bouton de 30 points) sont dans `theme.css`.
2. **On la saisit pour déplacer la fenêtre** (`data-tauri-drag-region`, un clic sur le bouton ne déplace rien) ; le double-clic l'agrandit, comme la barre de titre du Mac (permission `core:window:allow-internal-toggle-maximize`, déjà dans `core:default`). Permission ajoutée : `core:window:allow-start-dragging` (seul ajout de `capabilities/default.json`).
3. **Le bouton des panneaux latéraux** y est posé, à droite de la place des boutons de fenêtre : vrai bouton, nom accessible « Panneaux latéraux », bulle d'aide « Panneaux latéraux (Cmd+0) » (nom et raccourci viennent de la liste des commandes), `aria-pressed` (vrai : montrés), cible de 30 points. **Son icône dit l'état** : « panneau plein » (cadre, séparation, trois traits de liste) quand les panneaux sont montrés, « panneau vide » (cadre et séparation en pointillé) quand ils sont cachés ; les deux dessins sont dans le jeu d'icônes `app-icons.ts` (`side-panels-shown`, `side-panels-hidden`). Il est caché sur l'accueil (aucun espace de travail ouvert).
4. **L'ancien bouton « Panneaux » est retiré** du bloc d'outils d'affichage : un seul contrôle pour une action. Le bloc a cinq boutons (Focus, Plan, Machine à écrire, Plein écran, Claude). L'entrée du menu Présentation, la palette et Cmd+0 restent, et agissent sur le même réglage (`malorean.side-panels`).
5. **Comportement inchangé** : un clic cache ou montre ensemble les deux listes ; pas de cache séparé de chacune (pas demandé).
6. **Bande du haut : seuils recalculés** (le bloc d'affichage perd un bouton de 1,8 rem et un écart de 0,25 rem, soit 32,8 points). Largeur mesurée des trois blocs, des écarts et de la recherche à son minimum : 672,3 points (avant : 705,1). Seuil des deux lignes : **42,05 rem** (672,8 points, avant 44,1 rem) ; seuil de la recherche seule sur une troisième ligne : l'affichage et la recherche à son minimum demandent 277,2 points, seuil **17,45 rem** (279,2 points, avant 19,5 rem). La fiche 0072 garde ses valeurs d'époque.
7. **La fenêtre de recherche** reste sous le champ : son décalage du haut (`--search-window-top`) ajoute la hauteur de la barre de la fenêtre.

## Conséquences

- Tests : `window-bar.browser.test.ts` (barre, bouton, nom, bulle d'aide, icône selon l'état), `layout`, `screen-view` (bouton caché sur l'accueil), `window-display` (l'icône suit le clic et le raccourci), `app-icons`, `format-bar`, `editor-tools` ; parcours Playwright `window-bar` (barre en haut, bouton à droite des boutons de fenêtre, cible de 28 points au moins, panneaux cachés le bouton reste visible à la même place, Cmd+0, fenêtre étroite avec la colonne Claude Code), `top-bar-rows` et `display-tools` (seuils, 16 boutons) ; scénario « Barre de la fenêtre : bouton des panneaux latéraux » de l'essai de l'application réelle.
- Seul l'essai de l'application réelle montre la vraie fenêtre du Mac : la position exacte des trois boutons de fenêtre (`trafficLightPosition`) et le glisser de la barre s'y voient, pas dans un navigateur.
- Écarté : un bouton par colonne (deux contrôles) ; la barre de titre native du Mac avec un bouton dans la barre d'outils de l'éditeur (pas visible panneaux cachés, pas à côté des boutons de fenêtre).
