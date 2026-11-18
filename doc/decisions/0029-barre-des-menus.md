# 0029 — Barre des menus du Mac : décrite par la page, construite par Rust, une seule liste de commandes

- **Date** : 2026-11-18
- **Statut** : acceptée

## Contexte

Une application Mac a une barre des menus en haut de l'écran, en français, rangée comme le veut Apple (MALOREAN Notes, Fichier, Édition, Présentation, Fenêtre, Aide), où l'on retrouve chaque action avec son raccourci. Jusqu'ici, l'application montrait le menu par défaut de Tauri, en anglais, dont **Cmd+W ferme la fenêtre** alors que l'application le donne à « Fermer l'onglet ».

Les actions existent déjà : la liste des commandes de la palette (`state/commands.ts`), avec leur nom et leur raccourci, et ce que fait chacune (`app/commands.ts`). Les raccourcis étaient écrits une seconde fois dans une table de touches (`screens/shortcuts.ts`).

Pistes regardées :

- **Menu construit par la page avec l'API JavaScript des menus de Tauri** : aucun code Rust, mais il faut ouvrir à la page les permissions du module des menus, et le chemin du choix d'un élément passe par Tauri seul, sans test côté Rust possible. Rejeté.
- **Menu écrit en Rust** : les noms et les raccourcis seraient écrits une deuxième fois, dans une autre langue, et rien ne vérifierait qu'ils suivent la palette. Rejeté.
- **Menu décrit par la page, construit par Rust** : la page envoie au lancement une liste de menus (`install_menu`), chaque élément de commande tiré de la liste des commandes ; Rust ne fait que construire et renvoyer le choix. Retenu.

## Décision

- **Une seule liste** : la liste des commandes (et la palette elle-même, `PALETTE`) porte le nom et le raccourci de chaque action. La barre des menus (`state/app-menu.ts`, `APP_MENU`) ne donne que l'identifiant de la commande, et parfois un nom de menu (les points de suspension d'Apple : « Réglages… ») ; le raccourci vient de la liste, écrit pour le Mac (`Maj` → `Shift`). La table des touches de la page est elle aussi tirée de la liste (`keyOf`). Un raccourci n'est donc écrit qu'une fois ; un test vérifie que chaque élément désigne une commande connue, qu'aucune commande n'est deux fois dans la barre, que toute commande à raccourci y figure, et que deux commandes n'ont jamais la même touche.
- **Un seul chemin pour une touche : la page.** Une touche pressée arrive d'abord à la page (WebKit la lui donne avant la barre des menus) : l'éditeur prend les siennes (Cmd+F, Alt+Cmd+F, Cmd+Z…), puis le gestionnaire de raccourcis de la page prend celles des commandes et appelle `preventDefault`, ce qui empêche WebKit de la passer au menu. Le raccourci de l'élément de menu sert à le montrer, et n'agit que si ni l'éditeur ni la page n'ont pris la touche (par exemple Alt+Cmd+F hors de l'éditeur, que la page ne lit pas). Une commande ne part donc jamais deux fois. Les parcours, sans vraie barre des menus, passent par le même chemin que l'application.
- **Le choix d'un élément à la souris** arrive à la page par l'événement `menu-command` (l'identifiant de la commande) ; la page lance la même action que la palette. Comme les raccourcis, il est ignoré tant qu'une fenêtre de la page (réglages, choix, question) est ouverte.
- **Éléments standard** (`StandardItem`) faits par le Mac : À propos, Services, Masquer, Masquer les autres, Tout afficher, Quitter ; Annuler, Rétablir, Couper, Copier, Coller, Tout sélectionner (ils gardent l'éditeur et les champs de texte fonctionnels) ; Placer dans le Dock, Réduire/agrandir, Tout ramener au premier plan. Le menu Fenêtre et le menu Aide reçoivent leur rôle du Mac (liste des fenêtres, champ de recherche dans les menus).
- **Cmd+W ferme l'onglet, jamais la fenêtre** : le menu par défaut de Tauri est coupé (`enable_macos_default_menu(false)`), et la barre n'a pas d'élément « Fermer la fenêtre » ; Cmd+W n'appartient qu'à « Fermer l'onglet ». Le bouton rouge ferme la fenêtre.
- **Commandes d'une note grisées** (`NOTE_COMMANDS` : rechercher, rechercher et remplacer, fermer l'onglet, diviser la colonne, exporter, imprimer, copier) tant que la colonne active ne montre aucune note : la page suit les colonnes et appelle `enable_menu_items` quand cela change. Les demandes à Rust se suivent, pour qu'un grisage n'arrive jamais avant la barre.
- **Rust** : `crates/api/src/commands/menu.rs`, commandes synchrones `install_menu(menus)` et `enable_menu_items(ids, enabled)` (Tauri les lance sur le fil principal, le seul où le Mac construit des menus), et `chosen`, branché par `on_menu_event`, qui envoie `menu-command`. Types `AppMenu`, `MenuEntryItem`, `MenuRoleItem`, `StandardItem` exportés en TypeScript. Les tests IPC (`crates/api/tests/ipc_menu.rs`) tournent sans le lanceur de tests habituel (`harness = false`), sur le fil principal, pour construire de vrais menus dans le simulateur de Tauri.
- **Nouveaux raccourcis** : Cmd+N « Nouvelle note » (standard du Mac, libre) ; Alt+Cmd+F « Rechercher et remplacer » (nouvelle commande, déjà la touche de l'éditeur).

## Conséquences

- Ajouter une commande à la liste la met dans la palette ; lui donner un raccourci le fait lire par la page et le test exige de la ranger dans un menu.
- Tant que la page n'a pas construit la barre (quelques instants au lancement), seul le menu de l'application, vide, est montré : Cmd+W n'y ferme rien.
- La barre est construite par la page : si elle ne l'est pas (erreur), il n'y a ni menu Édition ni Copier/Coller au clavier hors de l'éditeur. L'erreur est montrée.
- Le passage des touches de la page vers la barre des menus suit le comportement de WebKit sur Mac ; il n'est vérifié que par l'essai réel, pas par les tests.
