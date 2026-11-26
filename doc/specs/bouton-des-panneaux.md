# Barre de la fenêtre et bouton des panneaux latéraux

Spécification fonctionnelle (26/11/2026), demandée par l'utilisateur : « pouvoir cacher les 2 colonnes de navigation comme dans Obsidian ». Ce document se lit seul.

## 1. Besoin

Cacher d'un geste la liste des dossiers et la liste des notes (les deux colonnes de gauche), pour que les colonnes d'édition prennent toute la largeur, et les rendre d'un geste, depuis un bouton toujours au même endroit, même quand elles sont cachées.

## 2. Comportement

- **Une barre tout en haut de la fenêtre**, sur toute sa largeur, à la place de la barre de titre du Mac. À gauche, les trois boutons de fenêtre du Mac (rouge, jaune, vert) ; juste à droite, le bouton des panneaux latéraux. Le reste de la fenêtre commence sous cette barre.
- **Le bouton des panneaux latéraux** s'appelle « Panneaux latéraux ». Sa bulle d'aide dit « Panneaux latéraux (Cmd+0) ». Il est toujours visible quand un espace de travail est ouvert, panneaux montrés comme cachés, toujours à la même place. Il n'y en a pas sur l'écran d'accueil.
- **Un clic cache ensemble les deux listes** (dossiers et notes) ; les colonnes d'édition prennent la place. **Un second clic les rend**, à la largeur qu'elles avaient. Il n'y a pas de bouton séparé pour chaque liste.
- **L'icône dit l'état** : un panneau plein (cadre, séparation, trois traits de liste) quand les listes sont montrées ; un panneau vide (cadre, séparation en pointillé) quand elles sont cachées.
- **Les autres moyens restent** : Cmd+0, la palette de commandes (« Panneaux latéraux ») et le menu Présentation. Tous agissent sur le même réglage, gardé d'un lancement à l'autre, comme avant ; le bouton en suit l'état quel que soit le moyen employé.
- **Le plein écran garde la disposition** : en plein écran, les listes restent montrées ou cachées comme avant, et le bouton reste là.
- **La bande du haut de l'éditeur n'a plus ce bouton** : son bloc d'icônes d'affichage garde Focus, Plan, Machine à écrire, Plein écran et Claude. Elle passe sur deux lignes un peu plus tard (quand la zone du milieu est plus étroite que 42 rem), puisqu'elle a un bouton de moins.
- **La barre sert aussi à déplacer la fenêtre** : on la saisit par un endroit vide pour la tirer ; un double-clic l'agrandit ou la rend à sa taille, comme la barre de titre du Mac. Un clic sur le bouton ne déplace rien.

## 3. Vérifié

Parcours `window-bar`, `side-panels`, `top-bar-rows` et `display-tools` ; scénario de l'essai de l'application réelle (fiche 0085).
