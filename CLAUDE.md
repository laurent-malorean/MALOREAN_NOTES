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

## CI à trois niveaux (doc/decisions/0047, doc/specs/ci-plus-rapide.md)

- **Niveau 1, barrière de commit** : avant chaque commit, `./scripts/ci.sh` (moins de 3 minutes ; moins d'une minute pour de la documentation Markdown seule). Secrets exclus, vocabulaire, longueur des fichiers, mise en forme, lints sans avertissement, dépendances, tests des seules crates touchées (et de leurs dépendantes), côté interface formatage, types, lints et tests des fichiers touchés. **La barrière autorise le commit et le push** ; si elle échoue : ne pas commiter, corriger, relancer. Jamais de contournement (`--no-verify`, test désactivé, lint levé sans raison).
- **Niveau 2, mutation du diff du commit, en arrière-plan** : après chaque commit, le crochet git `post-commit` (posé une fois par `scripts/install-hooks.sh`) mute le seul diff de ce commit sur une copie figée, pendant que le travail continue ; `./scripts/ci.sh --verdict` donne le résultat. Seuil 100 %. Des survivants ouvrent une **dette de mutation** : la barrière refuse le commit suivant, sauf s'il la corrige (il change un fichier cité par le verdict ou un test de la même crate). Pas d'autre chemin. Le push n'est jamais bloqué.
- **Niveau 3, livraison** : `./scripts/ci.sh --complet` (couverture globale, parcours complets et ralentis, mutation de tout le code) est obligatoire avant une livraison, refusée si une dette de mutation est ouverte. `--copie` joue un passage sur une copie figée pendant qu'on continue ; `--verifier` confirme que le code est celui d'un passage réussi ; `--sans-mutation` joue le niveau 3 sans mutation.
- **Écrire les tests qui tuent les mutants en même temps que le code** : la mutation vient après le commit, mais la règle des 100 % reste entière. Constats sur le temps de la CI, pièges connus et pistes : `doc/code.md`, section « Temps de la CI ».
- L'envoi (push) ne relance pas la CI.

## Secrets

- Aucun secret dans le code ni dans l'historique. `_SECRET/` reste toujours dans `.gitignore`.
