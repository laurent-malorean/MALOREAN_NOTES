# 0105 — Serveurs MCP extérieurs dans la colonne Claude Code

Date : 27/11/2026. Spécification : `doc/specs/serveurs-mcp.md`. Révise la fiche 0032 (« aucun autre serveur MCP que celui de l'application »).

## Contexte

Dans VS Code, Claude Code reçoit tous les serveurs MCP de l'utilisateur : les connecteurs de son compte claude.ai (Noota, Notion, Slack…) et ceux qu'il a ajoutés à son Claude Code. La colonne Claude Code les bloquait tous, exprès (`--strict-mcp-config`, fiche 0032), pour que rien de ce qui est branché ailleurs n'arrive à Claude sans que l'utilisateur l'ait voulu. L'utilisateur veut choisir, serveur par serveur, ceux que Claude peut utiliser dans la colonne.

## Décision

- **Un choix exprès, par serveur, dans les Réglages** (onglet « Claude », rubrique « Serveurs MCP ») : seuls les serveurs cochés sont ouverts à Claude ; tous leurs outils sont permis d'office, y compris ceux qui écrivent dans le service. Aucun serveur n'est coché au départ. Le choix vaut pour tous les espaces de travail.
- **Seuls les noms des serveurs cochés sont gardés**, dans les préférences de l'application (`allowed_mcp_servers` de `preferences.json`), jamais dans l'espace de travail. L'application ne connecte rien elle-même, ne garde ni jeton ni mot de passe : elle réutilise la connexion que Claude Code a déjà (connecteur claude.ai, ou `claude mcp login` dans le Terminal).
- **La liste vient de Claude Code** (`claude mcp list`, port `ClaudeCode::external_servers`) : lue sur un fil d'arrière-plan, car Claude Code vérifie chaque serveur (8,6 s mesurées sur ce Mac pour 32 serveurs, dont un de plugin ; 13 s lors des essais de la spécification). Elle est demandée depuis le dossier personnel (jamais l'espace de travail, dont un `.mcp.json` ne doit rien changer à la liste) avec l'environnement réduit de la fiche 0032. Les serveurs des plugins de Claude Code (nom préfixé `plugin:`) n'en font pas partie ; un serveur coché que Claude Code ne connaît plus reste coché, « Introuvable ».
- **Ce que Claude reçoit à chaque tour** (le choix est relu à chaque message : cocher ou décocher vaut au message suivant, un tour en cours garde ce qu'il avait) :

| Cas | Ce que fait l'adaptateur |
|---|---|
| Aucun serveur coché | comme avant : `--strict-mcp-config`, seul le serveur de l'application passe |
| Un serveur ajouté dans le Terminal, coché | `claude mcp get <nom>` est lu au début du tour (en parallèle s'il y en a plusieurs), la description (`stdio`, `http` ou `sse`, avec son environnement ou ses en-têtes) est passée par `--mcp-config` à côté du serveur de l'application ; `--strict-mcp-config` reste. Un serveur que Claude Code ne décrit plus n'est pas ouvert |
| Un connecteur claude.ai, coché | les connecteurs arrivent d'eux-mêmes sans `--strict-mcp-config` : l'option n'est pas passée ; les connecteurs non cochés sont cachés par `--disallowed-tools mcp__claude_ai_X,…` (la liste vient de la dernière lecture, lue d'abord si elle ne l'a jamais été) |
| Tout serveur coché | son nom d'outil (`mcp__claude_ai_Noota`) est ajouté à `--allowed-tools` (tous ses outils, d'office) ; l'outil `ToolSearch` est ajouté à `--tools` et une consigne (`--append-system-prompt`) dit à Claude que les services mettent quelques secondes à se connecter et qu'il doit chercher leurs outils avec lui avant de répondre qu'ils n'existent pas |

- **Garde-fou du web** : l'usage d'un outil d'un serveur permis (`mcp__<serveur>__.*`) pose la marque du premier crochet, comme `WebSearch` et `WebFetch` : une réponse du dehors compte comme une lecture du web.
- **Rien d'autre ne s'ouvre** : les réglages de l'utilisateur et ceux de l'espace de travail restent ignorés (`--setting-sources ""`) ; les serveurs des plugins n'arrivent pas ; un `.mcp.json` posé dans les notes, même avec `enableAllProjectMcpServers` dans le dossier `.claude/`, ne lance rien (mesuré).
- **Affichage** : une action sur un outil d'un serveur permis se montre « Noota · search_records » (nom du serveur, point médian, nom de l'outil).

## Mesuré le 27/11/2026 (Claude Code 2.1.311, ce Mac)

- `claude mcp list` : une ligne `nom: cible - ✔ Connected | ! Needs authentication | ✘ Failed to connect — …` par serveur ; `claude mcp get <nom>` : `Type`, puis `Command`, `Args` (sur une seule ligne), `Environment` (`CLE=valeur`), ou `URL` et `Headers` ; aucune option JSON.
- `--disallowed-tools mcp__claude_ai_Notion,mcp__claude_ai_Slack` : la recherche d'outils de Claude ne trouve plus ces serveurs, Noota reste trouvé.
- `--strict-mcp-config` : aucun connecteur, et `ToolSearch` n'est même pas offert (rien à chercher).
- `allowedMcpServers` passé par `--settings` : n'ouvre rien (même Noota disparaît) ; non retenu.
- Un `.mcp.json` dans le dossier de travail, avec `enableAllProjectMcpServers` dans `.claude/settings.json` : aucun serveur lancé (une trace laissée par sa commande n'apparaît pas).
- Les connecteurs n'apparaissent pas toujours au début du tour : plusieurs essais de suite ont montré une liste vide au démarrage, d'où l'outil de recherche et la consigne.

## Conséquences

- Les arguments de `claude` changent selon les serveurs cochés ; `--disallowed-tools` et `--append-system-prompt` deviennent des options exigées de Claude Code (`REQUIRED_OPTIONS`).
- Un connecteur ajouté dans claude.ai après la dernière lecture de la liste n'est pas caché tant que la liste n'est pas relue (« Actualiser ») ; il n'est de toute façon pas permis d'office : son appel est refusé.
- La description d'un serveur ajouté, qui peut contenir un jeton, vit le temps du lancement de `claude` et n'est écrite nulle part ; les arguments d'une commande sont séparés aux espaces (Claude Code les donne sur une seule ligne).
- Le premier tour après le lancement de l'application, avec un connecteur coché et sans que les Réglages aient lu la liste, attend la lecture de la liste (une dizaine de secondes).
- Le contrat des commandes pour l'interface est dans `doc/specs/serveurs-mcp.md`, section 8. Aucun outil MCP n'est ajouté ni changé (`doc/mcp/` inchangé).
