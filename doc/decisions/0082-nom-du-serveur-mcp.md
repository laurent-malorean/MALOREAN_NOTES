# 0082 — Le nom du serveur MCP : `malorean_notes` au lieu de `malorean`

- **Date** : 2026-11-26
- **Statut** : acceptée (spécification : `doc/specs/brancher-une-ia.md`)
- **Complète** les fiches 0040 (outils de l'application pour Claude) et 0056 (brancher une IA), qui nommaient le serveur `malorean`.

## Contexte

Le serveur MCP de l'application s'appelait `malorean`. Dans la liste des outils d'une IA (`mcp__malorean__<outil>`), ce nom ne dit pas de quelle application il s'agit, et il ne ressemble pas au nom de l'application, MALOREAN Notes.

## Décision

- Le serveur s'appelle **`malorean_notes`** : nom explicite, lisible dans la liste des outils de l'IA, cohérent avec le nom de l'application. Les outils deviennent `mcp__malorean_notes__<outil>`.
- Un seul endroit de vérité, la constante `APP_TOOLS_SERVER` : le nom annoncé par le protocole (`serverInfo.name`), les réglages donnés à Claude Code pour la colonne, le bloc Claude (`mcpServers.malorean_notes`), le bloc Codex (`[mcp_servers.malorean_notes]`) et les noms d'outils (`full_name`, `of_full_name`) en dérivent.
- Pas de compatibilité avec l'ancien nom : la colonne Claude Code reçoit sa configuration de l'application à chaque tour (rien n'est enregistré chez l'utilisateur), et un outil `mcp__malorean__…` n'est plus reconnu comme un outil de l'application.
- Inchangés : le nom du programme (`malorean-notes`), le nom de l'application, le dossier de données de l'application, les clés de préférences de l'interface.

## Conséquences

- **Ce que l'utilisateur doit faire** : recoller le bloc de configuration de l'onglet « Brancher une IA » dans `.mcp.json` (Claude) et dans `~/.codex/config.toml` (Codex), en retirant l'ancienne entrée `malorean`. La clé de branchement ne change pas.
- Un ancien bloc `malorean` continue de lancer la commande de branchement et de parler au serveur, mais l'IA voit ses outils sous l'ancien nom : toute autorisation écrite à la main pour `mcp__malorean__<outil>` (réglages de Claude Code, liste d'outils permis de Codex) ne vise plus rien et doit être réécrite avec `mcp__malorean_notes__<outil>`.
- Les fiches qui citent `malorean` pour le serveur portent une note datée renvoyant ici ; leur texte d'époque n'est pas réécrit.
- Tests : les noms complets d'outils, l'ancien nom refusé, `serverInfo.name`, les deux blocs (JSON et TOML) et leur affichage dans l'onglet.
