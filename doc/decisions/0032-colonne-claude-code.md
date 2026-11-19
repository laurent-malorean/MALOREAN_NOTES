# 0032 — Colonne Claude Code : piloter l'outil `claude` en arrière-plan, en flux JSON, limité aux notes de l'espace de travail

- **Date** : 2026-11-19
- **Statut** : acceptée

## Contexte

L'utilisateur veut discuter avec Claude Code dans une colonne de l'application, comme le module de VS Code, pour qu'il lise, crée et modifie les notes de l'espace de travail ouvert. Il a déjà Claude Code installé (`/opt/homebrew/bin/claude`, version 2.1.311 vérifiée le 19/11) et connecté avec son abonnement Claude (`claude auth status` : `loggedIn: true`, `authMethod: claude.ai`). Aucune clé, aucun compte payant à créer.

Autorisations validées par l'utilisateur le 19/11 : Claude lit, crée et modifie les notes de l'espace de travail sans demander ; aucun accès hors de ce dossier, aucune commande système, aucun accès au web.

**Révision du 19/11 au soir** : l'utilisateur veut que Claude ait accès au web (chercher sur le web, lire des pages web) ; Claude répondait qu'il n'y avait pas accès. Le reste ne change pas : rien hors du dossier, aucune commande système, aucun serveur MCP, réglages de l'utilisateur et du projet ignorés. Règle de sécurité décidée par l'utilisateur contre les instructions cachées dans une page : quand Claude a lu le web pendant une réponse, il ne crée ni ne modifie de note dans cette réponse sans l'accord de l'utilisateur (voir « Garde-fou du web »).

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
       [--model haiku|sonnet|opus|fable] [--effort low|medium|high|xhigh|max]
       --tools Read,Write,Edit,Glob,Grep,Agent,WebSearch,WebFetch
       --allowed-tools WebSearch,WebFetch
       --permission-mode acceptEdits --permission-prompts none
       --restricted --strict-mcp-config --disable-slash-commands
       --forward-subagent-text
       [--settings <crochets du garde-fou du web>]
```

- **Le message** est écrit sur l'entrée de `claude`, jamais passé en argument : un message qui commence par `-` ne peut pas devenir une option.
- **Continuer la conversation** : le premier événement (`system`, `init`) et le bilan (`result`) portent l'identifiant de la conversation (`session_id`) ; l'application le garde et le rend par `--resume` au message suivant. « Nouvelle conversation » et le passage à un autre espace de travail l'oublient. Il n'est gardé qu'en mémoire, pas d'un lancement de l'application à l'autre.
- **Arrêter** : le programme `claude` du tour est tué. Ce qu'il a écrit reste écrit ; la conversation continue au message suivant.
- **L'abonnement de l'utilisateur** : `claude` lit sa propre connexion (trousseau du Mac).
- **Le modèle et le niveau d'effort** (réglages du tour) : tant que l'utilisateur n'a rien choisi, ni `--model` ni `--effort` ne sont passés, et Claude Code garde ses propres choix. Choisis sur leur pastille, ils sont passés à chaque tour, y compris avec `--resume` : une conversation se continue avec un autre modèle. Valeurs vérifiées dans `claude --help` (2.1.311), sans appeler le modèle : `--model` prend un alias du dernier modèle d'une famille (`haiku`, `sonnet`, `opus`, `fable`, du plus léger au plus capable), `--effort` un niveau (`low`, `medium`, `high`, `xhigh`, `max`). La page n'envoie que des valeurs de ces listes (types `ClaudeModelItem`, `EffortItem` ; une autre valeur est refusée par Rust avant tout lancement) ; l'adaptateur les traduit en options. Le choix est gardé dans le stockage de la page, d'un lancement à l'autre ; la pastille montre le nom de la famille (« Opus · Medium »), pas le numéro de version, que seul le flux du tour connaît.
- **L'environnement transmis** : vidé, puis seules quelques variables de l'application sont rendues (dossier personnel, utilisateur, `PATH`, shell, fichiers temporaires, langue, `CLAUDE_CONFIG_DIR` pour trouver la connexion, proxy du réseau et ses certificats). Mesuré le 19/11 : lancée depuis un terminal, l'application transmettait plus de 80 variables, dont des clés d'API, l'accès à l'agent SSH, et les variables d'une session Claude Code parente (`CLAUDECODE`, `CLAUDE_CODE_*`, dont une prise de messagerie et son jeton). Aucune clé d'API n'arrive donc à `claude` (c'est toujours l'abonnement qui sert, jamais une facturation à l'usage), ni `ANTHROPIC_BASE_URL` ou `CLAUDE_CODE_USE_BEDROCK` (qui changeraient qui répond et qui paie), ni aucun réglage de Claude Code par variable. Avec ce seul environnement, `claude auth status` dit bien « connecté » et un tour fonctionne (vérifié avec le vrai `claude`). La vérification de la connexion reçoit le même.
- **Trouver `claude`** : une application ouverte depuis le Finder n'a pas le `PATH` du Terminal ; l'adaptateur cherche dans les emplacements connus (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, `~/.claude/local`) puis dans le `PATH`.

### Autorisations et options qui les imposent

Vérifiées dans `claude --help` (2.1.311), sans appeler le modèle :

| Règle | Option |
|---|---|
| Seulement lire, chercher, créer, modifier des fichiers, lancer des sous-agents, chercher sur le web et lire des pages web | `--tools Read,Write,Edit,Glob,Grep,Agent,WebSearch,WebFetch` : les seuls outils offerts au modèle ; ni `Bash` ni aucun outil qui lance du code. Nommer `WebFetch` le garde malgré `--restricted` |
| Le web sans rien demander | `--allowed-tools WebSearch,WebFetch` : sans cette règle, chaque recherche et chaque lecture de page demande une autorisation, refusée d'office (mesuré) |
| Sans rien demander | `--permission-mode acceptEdits` : les créations et modifications de fichiers sont acceptées d'office |
| Ce qui demanderait une autorisation est refusé | `--permission-prompts none` : personne ne répond, la demande est refusée d'office |
| Rien hors du dossier de l'espace de travail | `--restricted` : les outils de fichiers sont confinés aux dossiers de travail ; il retire aussi les outils qui lancent du code (et `WebFetch` quand `--tools` ne le nomme pas), ignore les réglages de l'utilisateur et du projet (qui pourraient autoriser davantage) et refuse le contournement des autorisations |
| Pas de serveurs MCP (qui pourraient toucher au web ou au système) | `--strict-mcp-config`, sans `--mcp-config` |
| Pas de commandes ni de compétences lancées par un message qui commence par `/` | `--disable-slash-commands` |
| Après une lecture du web, aucune création ni modification sans l'accord de l'utilisateur | `--settings` avec les deux crochets du garde-fou du web, à chaque tour sauf celui que l'utilisateur autorise |

Les sous-agents passent par les mêmes limites, garde-fou du web compris.

#### Mesuré avec le vrai `claude` (19/11 au matin, 2.1.311, sans le web)

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

Restent appliqués, comme le dit `claude --help` : les réglages imposés par un administrateur du Mac (absents ici) et `--settings` (jamais passé). Le flux du premier tour est gardé pour les tests (`escapes_refused.jsonl`, chemins remplacés par `/Users/moi`). Une action dont l'outil ou le sous-agent est hors des autorisations finit en erreur sans `permission_denied` : l'adaptateur la reconnaît à ce que dit son issue (« No such tool available », « denied by the current permission settings ») et l'annonce refusée, comme les autres. La colonne rappelle en une ligne discrète, sous la zone du message, ce que Claude peut faire : lire, créer et modifier les notes de cet espace de travail, sans demander, et chercher et lire sur le web, ses modifications attendant alors l'accord de l'utilisateur ; rien d'autre (ni autre dossier, ni commande).

#### Mesuré avec le vrai `claude` (19/11 au soir, 2.1.311, avec le web)

Dix petits tours (`--model haiku`, environnement réduit, options exactes ci-dessus), dans le même genre de dossier jetable : réglages `.claude/settings.json` et `.claude/settings.local.json` qui autorisent tout, avec des crochets qui laissent une trace s'ils tournent ; `.mcp.json` avec un serveur qui laisse une trace ; `CLAUDE.md` qui demande de commencer chaque réponse par un mot repère ; liens symboliques vers un fichier et un dossier du dehors.

| Tentative | Résultat |
|---|---|
| `--restricted` avec `--tools …,WebSearch,WebFetch` (sans `Agent`) | `WebFetch` et `WebSearch` offerts : `--restricted` les garde quand `--tools` les nomme |
| Les mêmes options avec `Agent` | la liste du début montre `WebSearch` mais plus `WebFetch` : Claude lit une page par le sous-agent `web-fetch`, qui, lui, a `WebFetch` |
| Recherche sur le web sans `--allowed-tools` | refusée (`permission_denied` : « no approval surface ») |
| Lecture d'une page par le sous-agent `web-fetch`, sans `WebFetch` dans `--allowed-tools` | refusée de même |
| Recherche sur le web, puis lecture de `https://example.com` par le sous-agent `web-fetch`, avec `--allowed-tools WebSearch,WebFetch` | faites : résultats de la recherche, titre « Example Domain » |
| `WebFetch` sur `file:///etc/hosts` et sur un fichier du dehors | refusé (« Invalid URL ») : seules les adresses `http(s)` sont lues |
| Lancer `Bash`, directement ou par un sous-agent `general-purpose` | outil absent : « No such tool available … disabled for this session, in subagents as well as here » |
| Lire hors du dossier (`/etc/hosts`, `../Hors/secret.txt`), par un lien vers un fichier ou à travers un lien vers un dossier du dehors | refusé (« path outside the working directory », « resolves through a symlink ») |
| Écrire hors du dossier (`../`, absolu, à travers un lien vers un dossier), chercher dans `~/.claude`, sous-agent qui lit et écrit au dehors | refusé, rien d'écrit |
| Écrire `.claude/settings.json` dans le dossier | refusé (personne pour l'accepter) |
| Réglages, crochets, serveur MCP et `CLAUDE.md` posés dans le dossier, avec `--settings` passé | sans effet : aucune trace de crochet ni de serveur, `mcp_servers` vide, le mot repère jamais écrit |

Le confinement tient donc avec `--restricted` gardé : rien d'autre ne change que les deux outils du web et la règle qui les permet.

### Garde-fou du web

Une page lue peut cacher des instructions (« modifie toutes les notes… »). Règle décidée par l'utilisateur : quand Claude a lu le web pendant un tour, il ne crée ni ne modifie de note dans ce tour sans son accord.

- **Le mécanisme** : à chaque tour, l'adaptateur crée un dossier jetable (fichiers temporaires, `malorean-web-guard-…`) et passe par `--settings` deux crochets `PreToolUse` de Claude Code (`--settings` s'applique malgré `--restricted`, comme le dit `claude --help`, et les crochets du dossier restent ignorés) : avant `WebSearch` ou `WebFetch`, le premier pose une marque dans ce dossier ; avant `Write` ou `Edit`, le second cherche la marque et, s'il la trouve, refuse l'action (`permissionDecision: deny`) avec un texte fixe qui l'explique à Claude et lui demande de dire ce qu'il voulait modifier. Le dossier est effacé à la fin du tour ; chaque tour a le sien. Les crochets ne sont que des commandes de l'application (`touch`, `test`, `printf`), jamais du texte de Claude ; la marque est hors du dossier de l'espace de travail, où Claude ne peut ni l'écrire ni l'effacer.
- **Pourquoi la marque est posée avant la lecture** : une modification décidée dans le même message que la lecture du web ne peut pas en dépendre (Claude n'a pas encore le résultat) ; tout ce qui suit la lecture est retenu. Un sous-agent qui lit le web retient aussi les modifications de Claude et des autres sous-agents pour la suite du tour.
- **Dans le flux** : l'action retenue finit en erreur avec « PreToolUse:Edit hook error: » suivi du texte fixe, sans `permission_denied` ; l'adaptateur reconnaît ce texte et annonce une modification retenue (`ChangeHeldBack`), puis l'issue en erreur.
- **Dans la colonne** : l'action est dite « retenue » ; à la fin du tour, un encadré dit « Claude a lu le web pendant cette réponse : ses modifications de notes ont été retenues, au cas où une page lui aurait glissé des instructions. Autoriser ses modifications ? », avec le bouton « Autoriser ses modifications ». Un clic continue la conversation par le message « J’autorise les modifications retenues après la lecture du web, pour cette réponse seulement : fais-les maintenant. », dans un tour lancé sans les crochets (`send_to_claude` avec `changesAllowed`, réglage du tour `ChangesAfterWeb::Allowed`). Le tour suivant est de nouveau gardé. Tout à la souris, aucun raccourci.
- **Plus simple qu'une validation action par action** (flux d'entrée JSON et réponses aux demandes d'autorisation) : rien de plus à lire ni à écrire pendant le tour, et un seul clic de l'utilisateur.

Mesuré avec le vrai `claude` (19/11 au soir, options exactes, crochets tels que l'adaptateur les écrit) :

| Tour | Résultat |
|---|---|
| Écrire une note, chercher sur le web, puis écrire une autre note et en modifier une | la première écrite ; après la recherche, l'écriture refusée par le crochet (« PreToolUse:Write hook error: … ») ; Claude s'arrête et dit ce qu'il voulait faire |
| Sous-agent `web-fetch` qui lit une page, puis Claude qui écrit, puis un sous-agent `general-purpose` qui modifie une note | la lecture faite ; l'écriture de Claude et les deux modifications du sous-agent retenues |
| Chercher sur le web, puis modifier `a.md` et faire créer une note par un sous-agent | la modification retenue ; Claude n'a pas lancé le sous-agent et a dit ce qu'il voulait modifier (flux gardé pour les tests : `web_held_back.jsonl`, chemins remplacés par `/Users/moi`) |
| Conversation continuée sans les crochets, avec le message d'autorisation | les deux modifications faites (`a.md` modifiée, note créée par le sous-agent) |

Verrous : les arguments exacts (avec et sans modèle et niveau d'effort, conversation continuée comprise) et l'environnement exact (liste des variables gardées) sont fixés par des tests du faux Claude Code ; une option ou une variable de plus fait échouer la CI. Le garde-fou du web aussi : ses crochets sont joués par le vrai shell dans les tests (rien avant une lecture du web, refus avec le texte fixe après, chemin du dossier bien protégé même avec une apostrophe), le faux Claude Code vérifie que son dossier existe pendant le tour et qu'il est effacé après, et qu'aucun crochet n'est passé au tour autorisé. Confirmé sur les flux enregistrés le 19/11 (2.1.311) : l'action qui lance un sous-agent s'appelle `Agent` (la liste d'outils du début l'appelle encore `Task` ; l'adaptateur accepte les deux noms). La construction de ces arguments est une fonction pure de l'adaptateur, testée ; le faux Claude Code vérifie qu'ils sont bien passés.

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

`claude auth status --json` (n'appelle pas le modèle) : `loggedIn` dit si l'utilisateur est connecté. Introuvable, pas connecté ou en erreur, la colonne dit quoi faire (installer Claude Code ; « Se connecter » dans la colonne, ou `claude auth login` dans le Terminal). Pas connecté, `claude` sort en erreur mais le dit quand même : seule sa réponse compte ; une réponse illisible veut dire « en erreur ». Le programme est cherché à chaque vérification et à chaque tour : installé après le lancement de l'application, il est trouvé. Seul un fichier exécutable compte.

### Compte Claude

À la demande de l'utilisateur (19/11), la colonne montre avec quel compte Claude Code est connecté, et permet d'en changer.

- **Le compte montré** : de la réponse de `claude auth status --json` (champs vérifiés le 19/11 sur 2.1.311 : `loggedIn`, `authMethod`, `apiProvider`, `email`, `orgId`, `orgName`, `subscriptionType`, `projectsDirectory`, `configDirectory`), seuls `loggedIn`, `email` et `orgName` sont lus. L'adresse et le nom de l'organisation vont à la page, à chaque vérification de la connexion, et ne sont gardés qu'à l'écran : **jamais écrits dans le journal** (les formes de débogage du compte et de la vérification les taisent, ce qu'un test vérifie), **ni sur le disque, ni dans les préférences ou le stockage de la page, ni dans les données des tests** (qui n'emploient que des comptes inventés, `moi@example.com`).
- **Se déconnecter** : `claude auth logout`. **Se connecter** : `claude auth login --claudeai` (vérifié dans `claude auth login --help` : `--claudeai` est l'abonnement, par défaut ; `--console` serait la facturation à l'usage, jamais passée). Claude Code ouvre lui-même le navigateur sur la page de connexion, attend le retour sur une adresse locale, et écrit « If the browser didn't open, visit: <adresse> » : l'adaptateur lit sa sortie et son erreur ligne à ligne et donne la première adresse `https://` de chaque ligne (l'adresse de connexion), que la page montre avec « Copier le lien ». L'entrée de `claude` reste ouverte jusqu'à la fin : fermée, il cesserait d'attendre (« Input ended before a code was pasted »). Réussie, la connexion sort sans erreur ; sinon, la colonne dit « la connexion n'a pas abouti » et quoi faire, sans répéter ce que `claude` a écrit.
- **Changer de compte** : se déconnecter, puis se connecter aussitôt.
- **Même programme, même environnement** que les tours (variables gardées seulement) ; **un seul programme `claude` à la fois** : pendant un tour, ni connexion ni déconnexion (Claude Code occupé), et inversement ; « Arrêter » (`stop_claude`) annule une connexion qui attend le navigateur. La page grise aussi ces actions pendant un tour, et empêche d'écrire à Claude pendant une connexion.
- **Pour tout le Mac** : la connexion de Claude Code est celle du trousseau ; la changer ici la change pour Claude Code dans le Terminal et dans VS Code, ce que la colonne rappelle sous les boutons.
- Après une connexion ou une déconnexion réussie, la conversation en cours est oubliée (côté Rust et dans la colonne) ; après toute fin, la connexion est revérifiée et le compte montré change.
- **Affichage** : en haut de la colonne, un bloc repliable (« Compte Claude · adresse · organisation », « non connecté », « vérification… ») ; déplié, les boutons, la progression (« Connexion : terminez-la dans le navigateur qui vient de s'ouvrir… »), puis l'issue (« Connecté : Claude Code utilise ce compte, aussi dans le Terminal et VS Code. », « Connexion annulée. »). Tout à la souris, sans raccourci clavier (fiche 0033).
- **Tests** : le faux Claude Code répond aussi à `auth logout` et `auth login` (il garde son état dans un dossier jetable ; sa connexion « en attente du navigateur » attend sur son entrée, ce qui vérifie qu'elle reste ouverte). Le vrai `claude auth login` ou `logout` n'est jamais lancé par un test ni à la main pendant le développement (il déconnecterait l'utilisateur).

### Hexagonal

- Port `ClaudeCode` dans `application`, dans ses mots : vérifier la connexion (avec le compte Claude), se déconnecter, se connecter, envoyer un message (dossier, identifiant de conversation éventuel) en rendant les événements de Claude au fil de l'eau, arrêter.
- Adaptateur `ClaudeCodeCli` dans `infrastructure` : lance le programme, écrit le message, lit la sortie ligne à ligne sur un fil à part, traduit chaque ligne.
- Faux `FakeClaudeCode` et contrat `testing` joué sur le faux et sur l'adaptateur, comme les autres ports.
- `api` relaie les événements à la page au fur et à mesure ; la page tient l'état de la colonne (fonctions pures dans `ui/src/state/`).

### Colonne de discussion

- Commandes `send_to_claude` (le message), `stop_claude`, `new_conversation`, à côté de `claude_status`. `send_to_claude` joue le tour sur un fil d'arrière-plan et se termine avec lui ; chaque événement part aussitôt à la page (événement Tauri `claude-event`, type `ClaudeEventItem`). Le début de la conversation n'est pas envoyé : la session garde l'identifiant, avec l'espace de travail où la conversation a commencé, pour `--resume` ; il est oublié par « Nouvelle conversation » et à l'ouverture d'un espace de travail.
- `api` ajoute aux événements chaque note modifiée (`changedNote`) : une action `Write` ou `Edit` réussie dont la cible (absolue, ou relative au dossier) est une note (`.md`, chemin sûr) de l'espace de travail. Une écriture refusée ou en erreur ne compte pas.
- Sa largeur se règle en tirant son bord gauche, entre un minimum et un maximum, gardée d'un lancement à l'autre (fiche 0018, révision du 19/11).
- La colonne s'affiche ou se masque par sa commande (Ctrl+Cmd+L, libre dans l'application, l'éditeur et macOS), le bouton « Claude » des outils de l'éditeur, la palette et le menu Présentation. Elle vérifie la connexion à chaque ouverture. Un message de Claude est mis en forme par le rendu des notes (même analyseur que l'éditeur, HTML de la note jamais interprété) ; un lien de ses messages ne fait pas quitter l'application, ses images ne sont pas chargées. Une erreur du tour suivant un « Arrêter » est dite « Réponse arrêtée » ; les autres sont montrées telles que Rust les écrit. Quand un tour annonce plusieurs bilans, la colonne ne montre que le dernier ; une note modifiée deux fois dans un tour n'est montrée qu'une fois.

### Barre de saisie

Sous la zone du message, une rangée de pastilles, comme Claude Code dans VS Code, toutes utilisables à la souris :

- **Modèle et niveau d'effort** dans une même pastille (« Opus · Medium », « Modèle par défaut » sans choix) : un clic ouvre leur choix, deux groupes du plus bas au plus haut, « Par défaut » en tête de chacun, l'actuel coché ; un clic ailleurs ou Échap le ferme.
- **Sous-agents en cours** (« ● 1 agent »), cachée quand aucun ne travaille : un clic déplie la carte des agents.
- **Durée de la réponse**, mise à jour chaque seconde pendant le tour, cachée ensuite.
- **Notes jointes** : la note ouverte dans la colonne active est jointe d'office (suivie à chaque changement des colonnes) ; sa croix la retire jusqu'à ce qu'une autre note s'ouvre. « + » ouvre la fenêtre de choix de l'ouverture rapide sur les notes de l'espace de travail ; les notes ainsi jointes sont retirées une fois le message parti. Le message envoyé se termine par « Notes jointes (chemins depuis l'espace de travail) : » et la liste de leurs chemins : Claude les lit lui-même, avec ses outils limités à l'espace de travail ; rien de leur contenu ne passe par l'application. La conversation montre sous le message les titres des notes jointes.
- **Envoyer**, qui devient un carré d'arrêt (« Arrêter ») pendant la réponse.

Pas de pastille des autorisations (elles sont fixes, voir plus haut) ni de commandes en `/` (`--disable-slash-commands`).

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
- Avec le web, Claude peut lire ce qu'une page dit ; ce qu'il en rapporte reste dans la conversation, et le garde-fou du web empêche qu'une page fasse modifier des notes sans l'accord de l'utilisateur. Un crochet qui ne pourrait pas tourner (shell absent) laisserait passer la modification : l'historique des versions garde alors la version d'avant.
- `--restricted` ignore les réglages de l'utilisateur pour Claude Code (ses autorisations, ses crochets) : dans l'application, Claude se comporte toujours de la même façon, quel que soit le réglage du Terminal.
- Le mode non interactif saute la question de confiance du dossier : c'est l'utilisateur qui a choisi l'espace de travail.
