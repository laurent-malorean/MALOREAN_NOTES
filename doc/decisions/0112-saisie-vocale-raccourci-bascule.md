# 0112 — Saisie vocale : le raccourci est une bascule livrée une seule fois, par la fenêtre d'abord

Date : 28/11/2026. Spécification : `doc/specs/saisie-vocale.md`, section « Raccourci et bips ». Fiches voisines : 0109 (le raccourci se choisit), 0113 (une touche seule).

## Contexte

Constat de l'utilisateur dans l'application réelle, après avoir choisi un raccourci : (a) un premier essai démarre la dictée, (b) le même raccourci ne l'arrête pas (il faut le bouton du micro), (c) un nouvel essai au clavier ne fait plus rien. Le refus d'un raccourci pris et « Rétablir le raccourci par défaut » fonctionnent. Le raccourci choisi n'est pas connu ; une combinaison avec Option (Ctrl+Option+E…) est le cas probable, car elle passait seulement par la barre des menus du Mac.

## Ce qui a été vérifié

- La logique de bascule de la saisie vocale est saine : démarrer, arrêter, redémarrer, y compris pendant la préparation, se joue deux fois de suite sans défaut par le clic et par un appel direct (tests existants).
- Le défaut se trouve donc dans la **livraison** de la touche. Un test joue la logique réelle (saisie vocale, raccourcis de la fenêtre, barre des menus reconstruite, faux moteur) avec un Mac simulé qui livre à la barre des menus la touche que la page n'a pas prise. Deux défauts réels sont montrés :
  - une pression livrée **deux fois** (par la fenêtre et par la barre des menus) fait deux bascules : sans garde, deux démarrages (le test mesurait `[2, 0]`) ou un démarrage aussitôt arrêté, c'est-à-dire « rien ne se passe » ; la répétition d'une touche maintenue fait de même ;
  - une combinaison avec **Option** n'était lue par la fenêtre à aucune condition (la touche était laissée à la barre des menus) : le démarrage de la dictée donne le focus à l'éditeur, où WebKit traite Option+E (et I, N, U, `) comme une **touche morte** (accent à venir) au lieu de la laisser arriver au menu ; ce que le test ne prouve pas, faute de vrai macOS, mais c'est la lecture qui explique les trois signes : le premier essai part du réglage (focus hors de l'éditeur, le menu prend la touche), les suivants, l'éditeur ayant le focus, ne passent plus, et la touche par défaut (sans Option, prise par la fenêtre) n'est pas touchée.
- Ce que le test ne peut pas montrer : l'ordre exact dans lequel le Mac livre une touche sans Cmd (Ctrl+Option+E) à la page et à la barre des menus. Il est donc couvert dans les deux ordres possibles.

## Décision

- **La fenêtre prend toute combinaison elle-même, lue à sa touche physique** (`event.code` : `KeyE`, `Digit7`, `F5`), avec ou sans Option (`screens/shortcuts.ts`). La touche prise (`preventDefault`) n'arrive ni à la saisie de texte (pas de touche morte, pas de « ´ » écrit dans la note), ni à la barre des menus. La barre des menus garde l'accélérateur (elle l'affiche et sert de filet si la page ne prend pas la touche). Effet de bord voulu : « Rechercher et remplacer » (Option+Cmd+F) est lu de même par la fenêtre.
- **Une pression, une bascule** (`state/shortcut-landing.ts`) : une commande qui est une bascule (la saisie vocale) ne compte qu'une livraison par pression. Le clavier de la fenêtre et la barre des menus partagent la garde : une seconde livraison dans les 100 ms (`SHORTCUT_ONCE_MS`) est ignorée, comme la répétition d'une touche maintenue (`event.repeat`). La seconde livraison n'est jamais celle d'un second geste : un doigt ne presse pas deux fois en moins de 100 ms. Les autres commandes ne sont pas gardées. La touche seule (fiche 0113) a son propre détecteur et n'est pas livrée par la barre des menus.
- Le clic sur le micro n'est pas gardé : il ne passe par aucun de ces deux chemins.

## À essayer à la main

Choisir Ctrl+Option+E (Réglages > Saisie vocale > Raccourci) ; fermer les réglages ; presser pour démarrer, presser pour arrêter, presser pour redémarrer, presser pour arrêter ; refaire avec une combinaison sans Option (Ctrl+Maj+E), puis avec le raccourci par défaut rétabli. Le texte de la note ne doit recevoir aucun caractère composé.
