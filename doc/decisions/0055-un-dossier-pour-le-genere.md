# 0055 — Un dossier pour le généré : `build/`

- **Date** : 2026-11-25
- **Statut** : acceptée, demande de l'utilisateur
- **Complète** les fiches 0049 (CI) et 0054 (essai de l'application réelle).

## Contexte

Les outils écrivaient à côté du code, dans `ui/` : `dist`, `dist-essai`, `coverage`, `reports`, `test-results`, `playwright-report`, `.stryker-tmp`, `.vitest`. Le code se mélangeait au généré : huit lignes dans `.gitignore`, autant d'exclusions dans ESLint, Prettier, la copie figée de la CI et le contrôle de la longueur des fichiers.

## Décision

Tout ce que les outils fabriquent va dans **un seul dossier `build/` à la racine du dépôt**, un sous-dossier par outil, ignoré par git d'une seule ligne (`/build/`).

- `build/ui-dist` : l'interface construite (Vite `outDir` ; Tauri `frontendDist` dans `crates/app/tauri.conf.json`).
- `build/ui-dist-essai` : l'interface d'essai (`scripts/essai-application.sh`, fiche 0054).
- `build/coverage` : la couverture de Vitest (`coverage.reportsDirectory`).
- `build/vitest` : les pièces jointes de Vitest (`attachmentsDir`).
- `build/test-results` : les résultats de Playwright (`outputDir`).
- `build/reports` : le rapport de mutation de l'interface et son résultat incrémental `stryker-incremental.json`.
- `build/stryker-tmp` : le bac à sable de Stryker.
- `build/playwright-report` : le dossier prévu pour un rapport HTML de Playwright ; le rapporteur actuel (`list`) n'en écrit pas.

`ui/` ne garde que le code, ses réglages et `node_modules/` (npm l'impose). Les chemins se lisent depuis `ui/` (`../build/...`) ; les contrôles qui n'ont plus rien à exclure dans `ui/` (ESLint, Prettier) perdent leurs lignes. La copie figée de la CI exclut `/build` et y reprend le résultat incrémental de Stryker. Stryker ne trouve pas un `node_modules` qui est un lien ; dans la copie jetable de `scripts/test-ui-mutations.sh`, le lien est posé à la racine de la copie, au-dessus de `ui/` et de `build/`.

## Conséquences

- Nettoyer le généré, c'est supprimer `build/`. Un nouvel outil écrit dans `build/<outil>`.
- Les dossiers de travail par fonction (`worktrees/<fonction>`) ont chacun leur `build/`.
- Rust garde `target/` (Cargo, `CARGO_TARGET_DIR`) : ce n'est pas du ressort de cette fiche.
