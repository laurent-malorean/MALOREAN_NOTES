# 0073 — Une icône devant chaque choix des menus du clic droit

- **Date** : 2026-11-25
- **Statut** : acceptée
- **Complète** la fiche 0067 (menu de création, ses icônes et ses raccourcis) et la fiche 0064 (bloc d'icônes d'affichage, icônes à trait fin).

## Contexte

Seuls le menu de création et le sélecteur d'espace de travail avaient des icônes ; les autres menus du clic droit (note, onglet, dossier, canvas, carte mentale, sélection de texte) n'étaient que du texte. Demande : mettre des icônes dans tous, en plus du texte, pour un aspect plus visuel et un seul style.

## Décision

- **Une colonne d'icônes dans le menu lui-même** (`showContextMenu`), pas dans chaque menu : un choix porte `icon` (le nom d'une icône du jeu) ou `swatch` (la pastille de couleur des cartes mentales, qui occupe la même colonne). Dès qu'un choix du menu a une icône ou une pastille, chaque choix reçoit la colonne (vide pour un choix sans icône), à la même largeur : icônes et noms restent alignés. Un menu sans aucune icône (l'aide du canvas, des lignes de texte grisées) ne réserve pas de colonne.
- **Un seul jeu d'icônes** (`ui/src/screens/app-icons.ts`, `appIcon`) : celui du menu de création (anciennement `new-content-icons.ts`), complété des dessins des menus. Les icônes que la barre de mise en forme (copier, Markdown) et le canvas (exporter, corbeille, modifier, image, flèches, alignement, zoom sur la sélection) dessinent déjà en sont reprises sans être redessinées (`FORMAT_ICON_PATHS`, `CANVAS_ICON_PATHS`). Un même sens a la même icône partout : « Note » du menu de création, « Nouvelle note » du dossier et « Ajouter une note » du canvas, par exemple.
- **Style de la barre du haut** : traits fins de 1,6 (comme la barre de mise en forme), grille de 24, bouts arrondis ; taille 15 px (`--context-menu-icon-size`), dans le thème. La couleur est celle du texte du choix (`currentColor`) : un choix grisé a une icône grisée, « Placer dans la corbeille » une icône de la couleur de son texte.
- **Décoratives** : l'icône et sa colonne sont `aria-hidden` ; le nom accessible d'un choix reste son texte. Texte, raccourcis, navigation au clavier, choix grisés, séparateurs et comportements ne changent pas ; la coche d'un choix en vigueur reste après son nom.

## Conséquences

- `MenuEntry.icon` n'est plus un élément SVG mais le nom d'une icône : le menu dessine, les appelants ne fabriquent rien.
- Tests : le jeu (dessins décoratifs, tous différents, repris de la barre et du canvas), la colonne (alignée, vide si besoin, après la coche), un contrôle qui ouvre tous les menus de l'application et échoue pour un choix sans icône ni pastille, parcours Playwright (note, dossier, onglet, thèmes clair et sombre, rectangles mesurés) et scénario de l'essai de l'application réelle.
- Il n'existe pas de menu du clic droit pour les étiquettes, le CRM ni la corbeille : rien à y ajouter.
