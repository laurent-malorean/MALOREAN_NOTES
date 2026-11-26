# 0083 — Application fabriquée sur GitHub : un tag `vX.Y.Z` donne un `.dmg` dans les Releases

- **Date** : 2026-11-26
- **Statut** : acceptée, demande de l'utilisateur (réactivée le 25/11, après le MCP)
- **Complète** les fiches 0054 (construction de l'application d'essai) et 0059 (travaux GitHub).

## Contexte

L'application ne se construisait que sur le Mac du développeur (`tauri build --bundles app`). Il faut pouvoir la télécharger : un `.dmg` dans les Releases du dépôt, fabriqué sur un Mac de GitHub. Le dépôt est public : les minutes Mac de GitHub ne sont pas comptées.

## Décision

1. **Versions Majeur.mineur.correctif.** Le travail `.github/workflows/application.yml` se déclenche sur un tag `vX.Y.Z` (rien d'autre : pas de suffixe) et à la demande (`workflow_dispatch`). À la demande, sans tag, il fabrique le `.dmg` et le garde comme artefact de l'exécution, sans créer de Release : c'est l'essai.
2. **Le numéro a deux sources**, qui doivent être identiques : `version` de `[workspace.package]` dans `Cargo.toml` (toutes les crates en héritent) et `version` de `ui/package.json` (`crates/app/tauri.conf.json` la lit : `"version": "../../ui/package.json"`). `scripts/version-coherente.sh [vX.Y.Z]` les compare, et compare le tag sans son `v` ; il refuse un numéro qui n'est pas de la forme Majeur.mineur.correctif. La première tâche du travail (`verifier`, sur Linux, quelques secondes) le joue : un numéro incohérent échoue avant toute compilation. La barrière de commit le rejoue (`scripts/test-version-coherente.sh`) dès que `Cargo.toml`, `ui/package.json`, un script ou un travail GitHub change, et `--fonction` aussi.
3. **Fabrication** (tâche `fabriquer`, `macos-latest`, Apple Silicon) : la chaîne de `scripts/essai-application.sh`, sans ses options d'essai (ni `--features essai`, ni identifiant ou nom d'essai, ni `MALOREAN_ESSAI_BUILD`). Interface par `npm ci` puis `npm run build` dans `ui/` (écrit `build/ui-dist`, le `frontendDist` de la configuration Tauri), puis, depuis la racine, `tauri build --bundles app,dmg --config '{"build":{"beforeBuildCommand":""}}'` (la commande d'interface par défaut de Tauri cherche un `package.json` au mauvais endroit, voir `doc/developpement/architecture.md`). Le programme annexe `binaries/malorean-writing` (assistant d'écriture) est construit par `crates/app/build.rs` avec le `swiftc` du runner. Caches : `Swatinem/rust-cache` (Rust) et le cache npm de `actions/setup-node`. Toutes les actions sont épinglées à une version exacte.
4. **Release** (tâche `publier`, seulement sur un tag) : `gh release create <tag> <dmg> --verify-tag` avec le `GITHUB_TOKEN` du travail, sans action tierce. Le `.dmg` s'appelle `MALOREAN-Notes-<numéro>-aarch64.dmg`. La description dit : « Application non signée : au premier lancement, clic droit sur l'application puis Ouvrir. »
5. **Permissions minimales** : `contents: read` pour tout le travail ; `contents: write` seulement sur la tâche `publier`, qui n'extrait pas le code. Aucun secret.
6. **Pas de signature ni de notarisation Apple pour l'instant** (aucun secret de signature) ; elle reste dans « De côté » (`todo.md`). Pas de binaire universel : Apple Silicon seulement (le runner `macos-latest`). Intel viendra avec la signature, si l'utilisateur le demande.

## Conséquences

- Livrer une version : monter le numéro dans les deux fichiers, commiter, `git tag vX.Y.Z`, envoyer le tag (procédure : `doc/developpement/architecture.md`, « Fabriquer une version »).
- Un tag dont le numéro diffère de `Cargo.toml` ou de `ui/package.json` ne produit rien : le travail échoue au premier contrôle. Une Release déjà créée n'est pas écrasée (`gh release create` échoue si elle existe).
- Le planning de la mutation de nuit et ce travail sont indépendants.
- Limite connue : le travail n'a pas pu être joué depuis le Mac de développement (le jeton du projet ne peut pas le lancer) ; son premier essai se fait depuis l'onglet Actions, « Run workflow », sans tag.
- Tests : `scripts/test-version-coherente.sh` (numéros identiques ou non, tag identique ou non, formes refusées, version d'une dépendance jamais prise pour celle du paquet, le dépôt réel cohérent, forme du travail GitHub : déclencheurs, permissions, ordre des tâches, bundles, aucune option d'essai).
