# MALOREAN Notes

Application Mac de notes, toutes en Markdown. Rust + Tauri 2 + CodeMirror 6.

@CLAUDE.local.md

## Documents de référence

- `doc/produit.md` : vision, principes, périmètre.
- `doc/architecture.md` (+ `architecture.svg`) : couches, organisation du projet, parcours d'une action.
- `doc/code.md` : règles de qualité et leurs contrôles.
- `doc/ontology.md` : vocabulaire, à employer partout.
- `doc/decisions/` : fiches des décisions d'architecture.
- `doc/specs/` : spécifications fonctionnelles validées, une par fonction.

## Méthode

- **Ontologie d'abord** : un nouveau mot s'ajoute à `doc/ontology.md` avant d'apparaître dans le code.
- **Vocabulaire unique** : un seul mot par notion, partout (écrans, documents, code, tests) ; pas de synonymes ; le mot vient de `doc/ontology.md`.
- **TDD** : écrire le test qui échoue, puis le code minimal qui le fait passer, puis nettoyer. Pas de code de production sans test qui l'exige.
- Documentation à jour dans le même commit que l'évolution.

## Organisation du travail

- `todo.md` ne liste que ce qui est à produire (fonctions, bugs, code de qualité) ; les règles de développement vont dans `CLAUDE.md` et `doc/code.md` ; l'ordre des prochaines tâches est dans `CLAUDE.local.md`.
- **Bugs d'abord** : la section « Bugs » de `todo.md` passe avant toute nouvelle fonction.
- **Un agent par tâche**, avec une consigne qui se suffit à elle-même ; les agents travaillent l'un après l'autre, jamais deux en même temps sur la même branche.
- Chaque tâche : TDD, mini CI, commit, case cochée dans `todo.md` aussitôt.
- Une tâche marquée « à préciser » ou « à discuter » attend l'utilisateur : ne pas la coder.

## Mini CI avant chaque commit

- Avant chaque commit, lancer `./scripts/ci.sh` : secrets exclus, longueur des fichiers, mise en forme, lints sans avertissement, **tous les tests** (Rust et interface), dépendances, test de mutation du code modifié.
- Constats sur le temps de la CI, pièges connus (types générés à ajouter à l'index, `main.ts` à 150 lignes, mutants équivalents) et pistes : `doc/code.md`, section « Temps de la CI ».
- `./scripts/ci.sh --copie` joue la CI sur une copie figée pendant qu'on continue à travailler ; `./scripts/ci.sh --verifier` confirme que le code à commiter est celui qu'une CI complète a validé.
- **Plusieurs corrections, une seule CI complète** : pendant le développement, après chaque problème traité, lancer `./scripts/ci.sh --sans-mutation` (tout sauf les tests de mutation, quelques minutes) ; une fois le lot fini, lancer `./scripts/ci.sh` complet une seule fois (mutation comprise), puis commiter. Seul un passage complet autorise un commit ; ne pas relancer la CI complète après chaque correction.
- **Test de mutation limité au code modifié**, côté Rust comme côté interface, avec un seuil de 100 % sur ce code ; le test complet (`./scripts/ci.sh --complet`) se lance avant une livraison. Ne jamais retester tout le code à chaque commit.
- Si un contrôle échoue : ne pas commiter, corriger, relancer. Jamais de contournement (`--no-verify`, test désactivé, lint levé sans raison).
- L'envoi (push) ne relance pas la CI : ce qui part a déjà passé tous les contrôles.

## Secrets

- Aucun secret dans le code ni dans l'historique. `_SECRET/` reste toujours dans `.gitignore`.
