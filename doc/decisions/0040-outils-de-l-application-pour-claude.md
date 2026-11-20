# 0040 — Outils de l'application pour Claude : un serveur MCP local, joint par un relais et une prise Unix, sans aucun port réseau

- **Date** : 2026-11-20
- **Statut** : acceptée
- **Complète** la fiche 0032 (colonne Claude Code) : Claude y reçoit, en plus de ses outils de fichiers et du web, les outils de l'application.

## Contexte

Dans la colonne Claude Code, Claude ne connaît les notes que par leurs fichiers : il parcourt le dossier pour chercher, ignore l'index, les modèles de note, l'historique des versions, et peut créer un fichier sans suivre les règles de l'application (nom tiré du titre, en-tête, dossier des pièces jointes, corbeille au lieu d'effacer). L'utilisateur veut que Claude passe par l'application (todo.md, « Pilotage par des IA », validé le 19/11) :

- **Partage** : changer le texte d'une note reste aux outils de fichiers de Claude (remplacer un passage par un autre couvre tous les cas) ; l'application n'offre que les actions qui ont ses propres règles.
- **Exigence** : ces outils ne répondent **que sur ce Mac**, sans aucun port réseau ; des tests le vérifient. Un mode réseau pourra venir plus tard : les outils ne doivent pas dépendre de leur transport.
- **Choisi** : un serveur MCP local (Claude Code sait déjà s'en servir). Une API OpenAPI pourra s'ajouter pour d'autres IA.
- Les IA désignent un espace de travail par son nom, jamais par un chemin sur le disque.

## Décision

### Le chemin d'une demande

```
Claude Code ──(entrée/sortie)── relais ──(prise Unix, dossier 0700)── application ── cas d'usage
```

- **Le relais est le programme de l'application lui-même**, lancé par Claude Code avec `--relais-mcp <prise> <clé>` : `main` le reconnaît avant tout le reste (ni Tauri, ni journal, rien d'écrit sur la sortie hors du protocole) et relie ligne à ligne l'entrée et la sortie de Claude Code à la prise (`infrastructure::relay`). Rien à embarquer en plus ; le relais ne lit ni ne change ce qui passe.
- **La prise locale** (`SocketPlace`, `LocalSocket`) est une prise Unix, dans un dossier neuf des fichiers temporaires de l'utilisateur (`$TMPDIR/malorean-outils-…/outils.sock`, chemin court : 104 octets au plus sur le Mac), dossier en `0700`, prise en `0600` : seul le compte de l'utilisateur peut la joindre. Effacée quand l'application se ferme. **Aucun port réseau** : ni TCP, ni UDP, ni écoute sur `localhost`.
- **La clé du tour** (`AppToolsKey`) : 128 bits tirés à chaque tour (clés de hachage choisies au hasard par le système et l'heure), passés au relais dans la configuration MCP, présentés par le relais sur la première ligne. L'application ne répond qu'à la clé du tour en cours ; le tour fini, plus rien ne répond. Un autre programme de l'utilisateur qui joindrait la prise sans la clé n'obtient qu'un refus. La vérification du programme à l'autre bout de la prise (`getpeereid`) n'est pas faite : elle demande du code `unsafe` ou une bibliothèque de plus, pour une protection que le dossier `0700` et la clé donnent déjà.
- **Le protocole** (`session/app_tools/mcp.rs`) : JSON-RPC, une demande par ligne. `initialize` (la version du protocole demandée par Claude Code est rendue, des instructions disent à Claude quand se servir des outils), `ping`, `tools/list`, `tools/call` ; une notification n'a pas de réponse ; toute autre méthode est refusée (`-32601`, ce que Claude Code reçoit pour sa sonde `server/discover`) ; sans la clé, tout est refusé (`-32001`). Une erreur d'outil est rendue comme telle à Claude (`isError`), avec ce que l'application dit à l'utilisateur.
- **Indépendant du transport** : le protocole et les outils ne connaissent que des lignes (`Session::answer_app_tools(clé, ligne)`) ; la prise n'est qu'un transport, qu'un mode réseau pourrait doubler sans toucher aux outils.

### Ce que Claude Code reçoit

L'adaptateur `ClaudeCodeCli`, construit avec le relais (`with_app_tools`, branché dans `app` : le programme de l'application et la prise), ajoute aux options de la fiche 0032, pour un tour qui porte une clé :

```
--strict-mcp-config --mcp-config '{"mcpServers":{"malorean":{"command":"<programme de l'application>","args":["--relais-mcp","<prise>","<clé>"]}}}'
--allowed-tools WebSearch,WebFetch,mcp__malorean__search_notes,mcp__malorean__list_tags,…
```

- `--strict-mcp-config` reste : seul ce serveur est chargé, aucun autre (réglages, `.mcp.json` du dossier).
- Chaque outil de l'application est **permis par son nom** dans `--allowed-tools`, un par un : rien d'autre n'est élargi (`--tools` ne change pas ; il ne vise que les outils de Claude Code).
- Sans relais (prise impossible à ouvrir) ou sans clé, rien ne change : Claude n'a que ses propres outils.

### Les outils

Ils passent par les cas d'usage, comme l'interface, et rendent ce qu'elle reçoit (mêmes types, écrits en JSON). Ils n'agissent que dans **l'espace de travail du tour** : si l'utilisateur en ouvre un autre pendant le tour, ils refusent (« l'espace de travail « Notes » de ce tour n'est plus ouvert : rien n'a été fait »). Les notes sont désignées par leur chemin depuis l'espace de travail ; un chemin invalide (`..`, absolu) est refusé comme dans l'interface.

| Outil | Ce qu'il fait |
|---|---|
| `search_notes` | Cherche avec l'index : mots (plein texte), étiquette, dossier (sous-dossiers compris), type de contenu (`note`) ; 100 notes au plus, les plus récentes d'abord, avec chemin, titre, dossier, étiquettes et extrait |
| `list_tags` | Les étiquettes et leur nombre de notes |
| `linking_notes` | Les liens entrants d'une note |
| `list_templates` | Les noms (titres) des modèles de note : les notes du dossier des modèles, que l'interface passe à chaque tour (il est gardé par l'interface, fiche 0019) |
| `list_versions` | Les versions d'une note, la plus récente d'abord |
| `read_version` | Le texte d'une version |

Leur liste, leurs noms et ce qu'ils visent sont dans le domaine (`domain::app_tools::AppTool`) ; ce que Claude en lit (description, schéma de l'entrée) dans `api` (`session/app_tools/catalog.rs`).

### Dans la colonne

Une action d'un outil de l'application (`mcp__malorean__…` dans le flux) devient `ActionKind::AppTool` ; l'interface la nomme en français : « Recherche dans l’index », « Étiquettes », « Liens entrants », « Modèles », « Historique », « Lecture d’une version » ; un outil inconnu, « Outil de l’application ». Sa cible est la recherche ou la note visée.

### Mesuré avec le vrai `claude` (20/11, 2.1.311, `--model haiku`, dossier jetable)

Options exactes de la fiche 0032, serveur ajouté par `--mcp-config` :

| Tentative | Résultat |
|---|---|
| `--restricted --strict-mcp-config --mcp-config …` | le serveur est chargé (`mcp_servers` : `malorean`, `connected`, source `dynamic`) ; la liste des outils du début ajoute ses outils (`mcp__malorean__…`) aux seuls outils de la fiche 0032 |
| Un outil de l'application absent de `--allowed-tools` | refusé (`permission_denied` : « no approval surface ») : chaque outil doit être permis par son nom |
| Premières lignes reçues par le serveur | `server/discover` (sonde, avec un identifiant : il faut y répondre, une erreur suffit), `initialize` (version `2025-11-25`), `notifications/initialized`, `tools/list`, puis un `tools/call` par action |
| Programme lancé | dans le dossier de l'espace de travail, avec quelques variables de Claude Code (`CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`…) |
| Tour complet par le relais (programme de l'application) et `Session::answer_app_tools` : chercher « pain », étiquettes, liens entrants, modèles, puis `list_versions` de `../../etc/passwd` et `search_notes` dans `../` | les quatre premiers rendent ce qu'attend l'interface ; les deux derniers refusés (« nom de note invalide », « dossier invalide ») ; les actions arrivent dans le flux sous leur nom `mcp__malorean__…` |

### Tests

- La prise et le relais (`infrastructure/tests/local_socket.rs`) : un échange complet par le relais ; prise Unix en `0600` dans un dossier en `0700` ; disparue à la fermeture ; et, pendant un échange, **aucune prise réseau ouverte par le programme** (`lsof -a -p <programme> -i` ne rend rien, alors que `-U` voit bien les prises Unix).
- Le protocole sur ses lignes (`mcp.rs`), chaque outil par son protocole sur des faux (`session/app_tools/tests.rs`), dont la clé (refusée hors d'un tour, d'un autre tour, ou après le tour ; un tour refusé pendant un autre ne la change pas) et l'espace de travail du tour.
- Les options de Claude Code avec et sans outils de l'application (faux Claude Code) ; le contrat du port joue un tour qui porte une clé, sur le faux et sur l'adaptateur.

## Conséquences

- Claude cherche avec l'index et connaît les règles de l'application sans relire les fichiers ; ce qu'il change par ses outils de fichiers reste suivi comme avant (surveillance, historique).
- Chaque tour lance un relais de plus (le programme de l'application, sans interface), quelques millisecondes.
- Si la prise ne peut pas être ouverte au lancement, la colonne marche comme avant, sans les outils de l'application (un avertissement dans le journal).
- Un autre programme du même compte, qui lirait les arguments de `claude` pendant un tour, pourrait lire la clé : il pourrait de toute façon lire et écrire les notes de l'utilisateur. La prise protège des autres comptes et du réseau.
