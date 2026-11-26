# 0074 — Espaces de travail pour les IA : un espace autorisé par case à cocher, un paramètre `workspace`, l'espace choisi ouvert en arrière-plan

- **Date** : 2026-11-25
- **Statut** : acceptée (spécification : `doc/specs/brancher-une-ia.md`)
- **Complète** la fiche 0040 (outils de l'application : jusqu'ici, les outils visaient l'espace du tour) et la fiche 0056 (Brancher une IA : jusqu'ici, l'IA branchée visait l'espace ouvert à l'instant de l'appel).

## Contexte

Une IA branchée (Codex, extension Claude de VS Code, Claude Code hors de l'application) n'avait que l'espace de travail ouvert chez l'utilisateur : elle ne pouvait ni savoir lesquels existent ni en choisir un. L'utilisateur veut qu'elle puisse travailler sur ses autres espaces, mais sans que rien ne lui soit visible sans son accord : le Mac contient parfois des espaces privés (journal, carnet personnel).

## Décision

- **Un espace autorisé** : chaque espace de travail a un état « autorisé pour les IA », **décoché au départ**. Il est gardé avec la liste des espaces de travail, dans les préférences de l'application (`preferences.json`, un champ `allowed` par espace, absent quand il vaut faux), **jamais dans l'espace de travail**. La clé de branchement n'y change rien : la révoquer ou la recréer laisse les cases telles quelles. Retirer un espace de la liste oublie sa case ; le renommer la garde.
- **Une case par espace**, dans l'onglet « Brancher une IA » des Réglages, avec ou sans clé : la liste des espaces de l'utilisateur, une case à cocher chacun (commandes `list_ai_workspaces` et `set_workspace_allowed`). La fenêtre des Réglages garde sa taille fixe : le contenu défile à l'intérieur.
- **Ce que voit l'IA : des noms, jamais des chemins.** Les réglages de l'application (thème, largeur du texte…) ne lui sont jamais ouverts.
- **L'outil `list_workspaces`** (la liste des espaces pour une IA) : seulement les espaces autorisés, chacun avec son `name` et `open` (vrai pour celui qui est ouvert chez l'utilisateur). Aucun espace autorisé : `workspaces` vide et un `message` qui renvoie à l'onglet « Brancher une IA ».
- **Le paramètre facultatif `workspace`** sur chaque autre outil :
  - sans lui, l'outil vise l'espace ouvert chez l'utilisateur, **s'il est autorisé** (sinon l'erreur liste les noms permis, ou renvoie à l'onglet s'il n'y en a aucun) ; dans la colonne Claude Code, c'est l'espace du tour, **sans condition** (aucun changement de comportement : la colonne est celle de l'utilisateur) ;
  - avec lui, le nom doit être celui d'un espace autorisé (majuscules ignorées) ; un nom inconnu et un nom non autorisé donnent **la même erreur**, qui liste les noms permis : elle ne révèle pas qu'un espace non autorisé existe. La colonne Claude Code peut aussi nommer son propre espace du tour, autorisé ou non.
  - l'autorisation est relue **à chaque appel** : une case décochée, ou un espace retiré de la liste, pendant le travail de l'IA, refuse l'appel suivant (« rien n'a été fait ») et rien n'est écrit ailleurs.
- **L'espace visé s'ouvre en arrière-plan.** Si ce n'est pas l'espace ouvert chez l'utilisateur, l'application l'ouvre **le temps de l'appel** (son stockage, son index de mots et de sens, son historique, ses gestes en attente) et le referme : l'écran, l'espace ouvert, la surveillance du dossier, le travailleur du sens et les versions en attente de l'utilisateur ne bougent pas. Choisi plutôt que de changer l'espace de l'utilisateur (ce qui lui ferait perdre son écran) ou de dupliquer chaque outil pour un espace donné (les outils passent par les mêmes méthodes que l'interface, qui lisent toutes l'espace ouvert à un seul endroit : ce endroit est redirigé, pour le seul fil qui joue l'outil, vers l'espace visé ; un autre fil, celui de l'interface, ne voit rien). Un dossier disparu ou illisible est une erreur du stockage ; rien n'est écrit ailleurs.
- **Les règles de l'application s'appliquent à l'identique** à l'espace visé (corbeille, dossier des pièces jointes, cahiers en ajout seul, historique des versions, index de recherche).
- **Ce qui reste à l'espace ouvert** : `viewed_note` et `show_note` parlent de l'écran de l'utilisateur ; avec un `workspace` qui n'est pas l'espace ouvert, ils sont refusés (ils ne visent que l'espace ouvert). Le dossier des modèles, choisi par l'interface pour l'espace du tour, n'est connu d'aucun autre : sur un autre espace, `list_templates` et `create_note_from_template` disent qu'aucun dossier des modèles n'est choisi (corrigé par la fiche 0077 : le dossier des modèles est gardé par le moteur, avec chaque espace, et lu pour l'espace visé).
- **Le calcul des vecteurs de sens** ne tourne que pour l'espace ouvert : une note créée dans un autre espace est cherchée par ses mots tout de suite, par son sens quand l'espace sera ouvert (la recherche par le sens le dit déjà, `reason`).

## Conséquences

- Par défaut, une IA branchée ne voit aucun espace : elle reçoit une liste vide et le renvoi vers l'onglet. Avant cette fiche, elle agissait sur l'espace ouvert ; cocher l'espace rétablit ce comportement.
- Le serveur MCP garde son nom (`malorean`) ; le renommer est une tâche à part.
- Tests : la règle des espaces autorisés (liste des espaces, renommage, retrait, noms permis, messages) ; les préférences sur le faux et sur le vrai fichier (contrat, ancien fichier sans le champ) ; les commandes (noms et JSON) ; l'outil `list_workspaces` et le paramètre sur les outils, par le protocole sur des faux (deux espaces, stockages distincts) ; l'espace ouvert qui ne change pas ; l'espace décoché en cours de travail ; l'onglet des Réglages (tests d'écran, parcours Playwright) ; l'essai de l'application réelle.
