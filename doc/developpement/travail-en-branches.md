# Travailler par fonction : une branche et un dossier de travail

Méthode décidée le 23/11/2026. Elle remplace le travail de tous les agents sur la seule branche `main`, où chaque vérification bloquait la suite.

## Principe

Une **fonction** (un changement qui a un sens pour l'utilisateur : « cahier de recherche », « carte mentale ») se développe sur **sa propre branche**, dans **son propre dossier de travail** (un `git worktree`). On la pousse, la CI longue la vérifie sans que personne l'attende, puis elle est fusionnée dans `main`. Pendant ce temps, une autre fonction avance ailleurs.

## Nommage (sans exception)

- Le nom vient de **la fonction**, en kebab-case, jamais de l'agent qui la fait : `cahier-de-recherche`, `carte-mentale`, `reglages-en-onglets`. Aucun nom du genre `agent-…`.
- Branche : `<fonction>`. Dossier : `worktrees/<fonction>`, à la racine du projet (visible dans l'éditeur, ignoré par git : `worktrees/` est dans `.gitignore`). **Jamais dans `.claude/`** : le code source n'a pas à y vivre.

## Créer

```
git worktree add worktrees/<fonction> -b <fonction>
```

Pas par l'option d'isolation de l'outil d'agent, qui crée un dossier et une branche au nom généré.

## Travailler dans le dossier

- L'agent exécute toutes ses commandes dans `worktrees/<fonction>` et n'écrit jamais dans le dossier principal.
- Le dossier n'a ni `target/` ni `ui/node_modules` : un dossier de compilation par fonction (`CARGO_TARGET_DIR=$HOME/Library/Caches/malorean-notes-target-<fonction>`, jamais dans iCloud), et `npm ci` dans `ui/`. La première compilation est longue (le moteur de calcul du sens) ; le disque est limité, donc ce dossier de compilation se supprime avec le reste à la fin.
- Les commits suivent la barrière de commit (`./scripts/ci.sh`, voir `CLAUDE.md`). Le crochet `post-commit` du dépôt est partagé par tous les dossiers de travail : il ne lance de mutation que pour le domaine, sans bloquer.

- **Avant de rendre la main**, l'agent lance `./scripts/ci.sh` (barrière, déjà passée à chaque commit) puis `./scripts/ci.sh --fonction` dans son dossier : 10 minutes au plus, **sans mutation**. La mutation se joue sur GitHub, par groupes parallèles (fiche 0059) ; un survivant se corrige à la tâche suivante, jamais une barrière. `./scripts/ci.sh --branche` (mutation du diff de la branche sur le Mac) reste possible à la demande, jamais imposé.

## Publier et fusionner

- La branche se pousse (`git push origin <fonction>`), jamais directement dans `main`.
- La fusion dans `main` est faite par l'agent principal après la CI de fin de fonction (`./scripts/ci.sh --fonction`), jamais par l'agent qui a développé la fonction.
- Avant de fusionner : `git fetch` puis rebaser ou fusionner `main` dans la branche, pour traiter les conflits dans la branche et non dans `main`.

## Nettoyer, après la fusion

```
git worktree remove worktrees/<fonction>
git branch -d <fonction>
git push origin --delete <fonction>
rm -rf ~/Library/Caches/malorean-notes-target-<fonction>
```

## À savoir

- Deux fonctions qui touchent aux mêmes fichiers se fusionnent l'une après l'autre ; la seconde se met à jour sur `main` avant de fusionner.
- Les statistiques de temps (`stats.md`) comptent les agents de toutes les fonctions.
- Une fonction vit quelques heures ou quelques jours ; au-delà, la découper.
