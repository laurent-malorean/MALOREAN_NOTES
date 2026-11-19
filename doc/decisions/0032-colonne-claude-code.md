# 0032 — Colonne Claude Code : piloter l'outil `claude` en arrière-plan, en flux JSON, limité aux notes de l'espace de travail

- **Date** : 2026-11-19
- **Statut** : acceptée

## Contexte

L'utilisateur veut discuter avec Claude Code dans une colonne de l'application, comme le module de VS Code, pour qu'il lise, crée et modifie les notes de l'espace de travail ouvert. Il a déjà Claude Code installé (`/opt/homebrew/bin/claude`, version 2.1.311 vérifiée le 19/11) et connecté avec son abonnement Claude (`claude auth status` : `loggedIn: true`, `authMethod: claude.ai`). Aucune clé, aucun compte payant à créer.

Autorisations validées par l'utilisateur le 19/11 : Claude lit, crée et modifie les notes de l'espace de travail sans demander ; aucun accès hors de ce dossier, aucune commande système, aucun accès au web.

Trois façons de faire ont été pesées :

- **Un terminal intégré** qui lance `claude` en mode interactif : rien à comprendre du dialogue, mais ce n'est pas une discussion de l'application — pas de notes modifiées cliquables, pas de carte des agents, un émulateur de terminal à embarquer. Écarté.
- **Le kit de développement d'agents (Agent SDK)** : il donne la main sur chaque outil et chaque autorisation, mais il impose d'embarquer Node à côté de Rust (un moteur d'exécution de plus à livrer, signer et mettre à jour). Écarté pour l'instant.
- **Piloter l'outil `claude` installé**, en mode non interactif, en lisant ses événements en JSON au fil de l'eau. Retenu : rien à embarquer ni à lier, l'abonnement de l'utilisateur est utilisé tel quel, et c'est le même schéma que l'assistant Swift (fiche 0031) : un programme séparé, lancé par Rust, qui parle sur son entrée et sa sortie ; un plantage ne touche que ce programme.

À reconsidérer (alors avec le kit de développement d'agents ou le flux d'entrée JSON de `claude`) si l'on veut valider chaque modification une par une, brancher nos propres outils (chercher dans les notes, créer depuis un modèle) ou tenir plusieurs conversations à la fois.

## Décision

### Lancement

Un tour = un lancement de `claude`, dans le dossier de l'espace de travail ouvert (dossier courant du programme lancé) :

```
claude -p --output-format stream-json --verbose
       [--resume <identifiant de la conversation>]
       --tools Read,Write,Edit,Glob,Grep,Agent
       --permission-mode acceptEdits --permission-prompts none
       --restricted --strict-mcp-config --disable-slash-commands
       --forward-subagent-text
```

- **Le message** est écrit sur l'entrée de `claude`, jamais passé en argument : un message qui commence par `-` ne peut pas devenir une option.
- **Continuer la conversation** : le premier événement (`system`, `init`) et le bilan (`result`) portent l'identifiant de la conversation (`session_id`) ; l'application le garde et le rend par `--resume` au message suivant. « Nouvelle conversation » et le passage à un autre espace de travail l'oublient. Il n'est gardé qu'en mémoire, pas d'un lancement de l'application à l'autre.
- **Arrêter** : le programme `claude` du tour est tué. Ce qu'il a écrit reste écrit ; la conversation continue au message suivant.
- **L'abonnement de l'utilisateur** : `claude` lit sa propre connexion (trousseau du Mac). Le modèle est celui choisi par défaut par l'utilisateur.
- **L'environnement transmis** : vidé, puis seules quelques variables de l'application sont rendues (dossier personnel, utilisateur, `PATH`, shell, fichiers temporaires, langue, `CLAUDE_CONFIG_DIR` pour trouver la connexion, proxy du réseau et ses certificats). Mesuré le 19/11 : lancée depuis un terminal, l'application transmettait plus de 80 variables, dont des clés d'API, l'accès à l'agent SSH, et les variables d'une session Claude Code parente (`CLAUDECODE`, `CLAUDE_CODE_*`, dont une prise de messagerie et son jeton). Aucune clé d'API n'arrive donc à `claude` (c'est toujours l'abonnement qui sert, jamais une facturation à l'usage), ni `ANTHROPIC_BASE_URL` ou `CLAUDE_CODE_USE_BEDROCK` (qui changeraient qui répond et qui paie), ni aucun réglage de Claude Code par variable. Avec ce seul environnement, `claude auth status` dit bien « connecté » et un tour fonctionne (vérifié avec le vrai `claude`). La vérification de la connexion reçoit le même.
- **Trouver `claude`** : une application ouverte depuis le Finder n'a pas le `PATH` du Terminal ; l'adaptateur cherche dans les emplacements connus (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, `~/.claude/local`) puis dans le `PATH`.

### Autorisations et options qui les imposent

Vérifiées dans `claude --help` (2.1.311), sans appeler le modèle :

| Règle | Option |
|---|---|
| Seulement lire, chercher, créer, modifier des fichiers et lancer des sous-agents | `--tools Read,Write,Edit,Glob,Grep,Agent` : les seuls outils offerts au modèle ; ni `Bash`, ni `WebFetch`, ni `WebSearch` |
| Sans rien demander | `--permission-mode acceptEdits` : les créations et modifications de fichiers sont acceptées d'office |
| Ce qui demanderait une autorisation est refusé | `--permission-prompts none` : personne ne répond, la demande est refusée d'office |
| Rien hors du dossier de l'espace de travail | `--restricted` : les outils de fichiers sont confinés aux dossiers de travail ; il retire aussi les outils qui lancent du code et `WebFetch`, ignore les réglages de l'utilisateur et du projet (qui pourraient autoriser davantage) et refuse le contournement des autorisations |
| Pas de serveurs MCP (qui pourraient toucher au web ou au système) | `--strict-mcp-config`, sans `--mcp-config` |
| Pas de commandes ni de compétences lancées par un message qui commence par `/` | `--disable-slash-commands` |

Les sous-agents passent par les mêmes limites.

#### Mesuré avec le vrai `claude` (19/11, 2.1.311)

Trois petits tours (`--model haiku`, options exactes ci-dessus), dans un dossier jetable qui contenait aussi, pour tenter d'élargir les droits : un `.claude/settings.json` et un `.claude/settings.local.json` qui autorisent `Bash`, `WebFetch`, la lecture et l'écriture partout, un dossier de plus et `bypassPermissions`, avec des crochets (`SessionStart`, `PreToolUse`) ; un `.mcp.json` avec un serveur ; un `CLAUDE.md` dans le dossier et un dans le dossier parent ; un lien symbolique vers un fichier du dehors et un vers un dossier du dehors. Les réglages de l'utilisateur autorisent aussi `Bash`, `WebFetch` et `WebSearch`. Un tour avec l'environnement réduit, un avec tout l'environnement d'un terminal.

| Tentative | Résultat |
|---|---|
| Lire un fichier hors du dossier (chemin absolu, `/etc/hosts`, `..` relatif ou absolu) | refusé (`permission_denied` : « path outside the working directory ») |
| Lire par un lien symbolique vers un fichier du dehors, ou à travers un lien vers un dossier du dehors | refusé (« resolves through a symlink to … ») |
| Écrire hors du dossier (absolu, `../`, à travers un lien vers un dossier du dehors) | refusé, rien d'écrit |
| Chercher (`Glob`, `Grep`) hors du dossier, dont `~/.claude` | refusé |
| Lancer une commande (`Bash`), lire le web (`WebFetch`) | outil absent : « No such tool available … disabled for this session, in subagents as well as here » |
| Sous-agent `general-purpose` qui lit `/etc/hosts` et lance `Bash` | mêmes refus que Claude lui-même |
| Sous-agent qui n'a que des outils interdits (`web-fetch`) | non lancé : « every tool it may use is denied by the current permission settings » |
| Écrire `.claude/settings.json` dans le dossier | refusé (personne pour l'accepter) |
| Modifier une note, en créer une, y compris dans un sous-dossier | fait, sans rien demander |
| Réglages, crochets, serveur MCP et `CLAUDE.md` posés dans le dossier ou au-dessus | sans effet : aucun crochet lancé, aucun serveur (`mcp_servers` vide), aucun outil en plus (`Task, Edit, Glob, Grep, Read, Write`), aucune extension installée par l'utilisateur, aucun `CLAUDE.md` lu |

Restent appliqués, comme le dit `claude --help` : les réglages imposés par un administrateur du Mac (absents ici) et `--settings` (jamais passé). Le flux du premier tour est gardé pour les tests (`escapes_refused.jsonl`, chemins remplacés par `/Users/moi`). Une action dont l'outil ou le sous-agent est hors des autorisations finit en erreur sans `permission_denied` : l'adaptateur la reconnaît à ce que dit son issue (« No such tool available », « denied by the current permission settings ») et l'annonce refusée, comme les autres. La colonne rappelle en une ligne discrète, sous la zone du message, ce que Claude peut faire : lire, créer et modifier les notes de cet espace de travail, sans demander ; rien d'autre.

Verrous : les arguments exacts et l'environnement exact (liste des variables gardées) sont fixés par des tests du faux Claude Code ; une option ou une variable de plus fait échouer la CI. Confirmé sur les flux enregistrés le 19/11 (2.1.311) : l'action qui lance un sous-agent s'appelle `Agent` (la liste d'outils du début l'appelle encore `Task` ; l'adaptateur accepte les deux noms). La construction de ces arguments est une fonction pure de l'adaptateur, testée ; le faux Claude Code vérifie qu'ils sont bien passés.

### Événements

`--verbose` est exigé par `-p` avec `stream-json`. Chaque ligne de la sortie est un objet JSON, traduit par l'adaptateur en événement de Claude (`ClaudeEvent`) :

- `system` / `init` : début, identifiant de la conversation ;
- `assistant` : un message (blocs `text`) ou une action lancée (blocs `tool_use` : outil, entrée, identifiant) ;
- `user` : l'issue d'une action (blocs `tool_result`, rattachés par `tool_use_id`) ;
- `parent_tool_use_id` non vide : le message ou l'action appartient au sous-agent lancé par cette action (`--forward-subagent-text` fait suivre les textes des sous-agents) ; une action `Agent` (description, consigne) ouvre un sous-agent, son issue le clôt ;
- `result` : le bilan (réussi ou en erreur, durée, jetons, nombre de tours).
- `system` / `permission_denied` (`tool_use_id`) : une action refusée par les autorisations ; son issue (`tool_result` en erreur) suit ;
- `system` / `task_notification` (`tool_use_id`, `status`, `usage` : `total_tokens`, `tool_uses`, `duration_ms`) : la fin d'un sous-agent.

Constaté sur les flux enregistrés (19/11, 2.1.311) : un sous-agent est lancé **en arrière-plan** ; l'issue de l'action `Agent` arrive tout de suite (« lancé ») et ne dit pas qu'il a fini : c'est `task_notification` qui le dit. Claude répond alors une seconde fois dans le même programme : un deuxième `system` / `init` (même conversation) et un deuxième `result` suivent. Le tour se termine donc à la fin du programme, pas au premier bilan ; le dernier bilan fait foi. Un `claude` qui sort en erreur après avoir donné un bilan (conversation inconnue : `result` en erreur avec `errors`, code de sortie 1) termine le tour normalement, le bilan dit pourquoi ; sans bilan, le tour échoue. Les jetons d'un bilan additionnent ceux lus (dont le cache) et écrits.

Une ligne illisible ou d'un type inconnu est ignorée (Claude Code évolue vite). Une note modifiée par Claude se déduit des actions `Write` et `Edit` réussies dont le fichier est dans l'espace de travail, désigné par son chemin depuis l'espace de travail. La carte des agents se construit par des fonctions pures, à partir de ces seuls événements (voir « Carte des agents »).

### Vérification de la connexion

`claude auth status --json` (n'appelle pas le modèle) : `loggedIn` dit si l'utilisateur est connecté. Introuvable, pas connecté ou en erreur, la colonne dit quoi faire (installer Claude Code, taper `claude auth login` dans le Terminal). Seul `loggedIn` est lu : l'adresse et l'organisation du compte, aussi rendues, ne sont ni gardées, ni montrées, ni écrites dans le journal. Pas connecté, `claude` sort en erreur mais le dit quand même : seule sa réponse compte ; une réponse illisible veut dire « en erreur ». Le programme est cherché à chaque vérification et à chaque tour : installé après le lancement de l'application, il est trouvé. Seul un fichier exécutable compte.

### Hexagonal

- Port `ClaudeCode` dans `application`, dans ses mots : vérifier la connexion, envoyer un message (dossier, identifiant de conversation éventuel) en rendant les événements de Claude au fil de l'eau, arrêter.
- Adaptateur `ClaudeCodeCli` dans `infrastructure` : lance le programme, écrit le message, lit la sortie ligne à ligne sur un fil à part, traduit chaque ligne.
- Faux `FakeClaudeCode` et contrat `testing` joué sur le faux et sur l'adaptateur, comme les autres ports.
- `api` relaie les événements à la page au fur et à mesure ; la page tient l'état de la colonne (fonctions pures dans `ui/src/state/`).

### Colonne de discussion

- Commandes `send_to_claude` (le message), `stop_claude`, `new_conversation`, à côté de `claude_status`. `send_to_claude` joue le tour sur un fil d'arrière-plan et se termine avec lui ; chaque événement part aussitôt à la page (événement Tauri `claude-event`, type `ClaudeEventItem`). Le début de la conversation n'est pas envoyé : la session garde l'identifiant, avec l'espace de travail où la conversation a commencé, pour `--resume` ; il est oublié par « Nouvelle conversation » et à l'ouverture d'un espace de travail.
- `api` ajoute aux événements chaque note modifiée (`changedNote`) : une action `Write` ou `Edit` réussie dont la cible (absolue, ou relative au dossier) est une note (`.md`, chemin sûr) de l'espace de travail. Une écriture refusée ou en erreur ne compte pas.
- La colonne s'affiche ou se masque par sa commande (Ctrl+Cmd+L, libre dans l'application, l'éditeur et macOS), le bouton « Claude » des outils de l'éditeur, la palette et le menu Présentation. Elle vérifie la connexion à chaque ouverture. Un message de Claude est mis en forme par le rendu des notes (même analyseur que l'éditeur, HTML de la note jamais interprété) ; un lien de ses messages ne fait pas quitter l'application, ses images ne sont pas chargées. Une erreur du tour suivant un « Arrêter » est dite « Réponse arrêtée » ; les autres sont montrées telles que Rust les écrit. Quand un tour annonce plusieurs bilans, la colonne ne montre que le dernier ; une note modifiée deux fois dans un tour n'est montrée qu'une fois.

### Carte des agents

- Construite **dans la page**, par des fonctions pures (`ui/src/state/agent-map.ts`), à partir des événements que la colonne reçoit déjà (`claude-event`) : rien de plus à envoyer par Rust, et la page tient déjà l'état de la conversation. (La première version de cette fiche la plaçait dans le domaine ; la page reçoit les événements un par un et n'a pas d'autre état à partager avec Rust.)
- Une action « sous-agent » (`Agent`, ou `Task`) ouvre un sous-agent : sa description est la cible de l'action, « Sous-agent » à défaut. Son parent est le sous-agent auteur de l'action (`agent`), rien pour Claude lui-même ; un parent inconnu le met à la racine.
- Ses actions sont comptées au fil des actions lancées dont il est l'auteur (dont les sous-agents qu'il lance) ; à sa fin (`task_notification`), l'état, la durée, les jetons et le nombre d'actions annoncés remplacent ce qui était compté. Durée et jetons ne sont connus qu'à la fin.
- L'issue réussie de l'action qui le lance ne dit rien (il travaille en arrière-plan) ; refusée ou en erreur, il est en erreur.
- Fin du tour : arrêté ou en erreur, les sous-agents encore en cours sont interrompus ; fini normalement, ils sont terminés (Claude Code attend ses sous-agents avant de sortir).
- Affichage : en haut de la colonne, sous l'en-tête, un bloc repliable (`details`), replié au départ et caché tant qu'aucun sous-agent n'a été lancé ; replié, « Carte des agents · 2 sous-agents · 1 en cours » ; déplié, l'arbre, chaque sous-agent avec sa description et « terminé · 3,3 s · 8 523 jetons · 2 actions ». Redessiné à chaque événement sans se replier ; vidé par « Nouvelle conversation » et le passage à un autre espace de travail. Le faux Claude Code des parcours rejoue un tour avec un sous-agent qui en lance un autre (`claudeAgents=1`), sur le modèle du flux enregistré.

### Tests : jamais le vrai Claude

- L'adaptateur reçoit le chemin du programme à lancer. Les tests et la CI lui donnent un **faux Claude Code** : un petit script qui écrit les arguments et le dossier courant reçus dans un fichier, puis rejoue des lignes `stream-json` enregistrées. Le vrai `claude` n'est jamais lancé par un test.
- Les lignes rejouées sont enregistrées une fois, à la main, avec le vrai `claude` (`--model haiku`, message trivial, dans un dossier jetable), jamais dans un vrai espace de travail.
- La page est testée avec le faux pont (parcours Playwright), qui émet des événements de Claude.

## Conséquences

- Rien à embarquer, rien à payer en plus : l'utilisateur se sert de son abonnement ; `cargo-deny` n'a rien de nouveau à vérifier tant qu'aucune bibliothèque n'est ajoutée.
- L'application dépend du format du flux de Claude Code, qui n'est pas figé : les lignes inconnues sont ignorées, et les enregistrements des tests sont à refaire quand le format change.
- Chaque tour relance `claude` (quelques secondes de démarrage) ; la conversation reprend par son identifiant.
- On ne valide pas chaque modification avant qu'elle soit écrite : l'historique des versions (fiche 0030) garde la version d'avant, et une note ouverte se recharge sans écraser la frappe (fiche 0014).
- `--restricted` ignore les réglages de l'utilisateur pour Claude Code (ses autorisations, ses crochets) : dans l'application, Claude se comporte toujours de la même façon, quel que soit le réglage du Terminal.
- Le mode non interactif saute la question de confiance du dossier : c'est l'utilisateur qui a choisi l'espace de travail.
