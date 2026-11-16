# MALOREAN Notes

Application Mac de notes, toutes en Markdown. Rust + Tauri 2 + CodeMirror 6.

@CLAUDE.local.md

## Documents de référence

- `doc/produit.md` : vision, principes, périmètre.
- `doc/architecture.md` (+ `architecture.svg`) : couches, organisation du projet, parcours d'une action.
- `doc/code.md` : règles de qualité et leurs contrôles.
- `doc/ontology.md` : vocabulaire, à employer partout.

## Méthode

- **Ontologie d'abord** : un nouveau mot s'ajoute à `doc/ontology.md` avant d'apparaître dans le code.
- **TDD** : écrire le test qui échoue, puis le code minimal qui le fait passer, puis nettoyer. Pas de code de production sans test qui l'exige.
- Documentation à jour dans le même commit que l'évolution.

## Mini CI avant push

- Avant chaque push, lancer `./scripts/ci.sh` : secrets exclus, longueur des fichiers, mise en forme, lints sans avertissement, **tous les tests** (Rust et interface), dépendances.
- Si un contrôle échoue : ne pas pousser, corriger, relancer. Jamais de contournement (`--no-verify`, test désactivé, lint levé sans raison).

## Secrets

- Aucun secret dans le code ni dans l'historique. `_SECRET/` reste toujours dans `.gitignore`.
