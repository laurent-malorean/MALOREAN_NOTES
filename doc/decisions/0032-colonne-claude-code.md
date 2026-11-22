# 0032 — Colonne Claude Code : piloter l'outil `claude` en arrière-plan, en flux JSON, limité aux notes de l'espace de travail

- **Date** : 2026-11-19
- **Statut** : acceptée

## Contexte

L'utilisateur veut discuter avec Claude Code dans une colonne de l'application, comme le module de VS Code, pour qu'il lise, crée et modifie les notes de l'espace de travail ouvert. Il a déjà Claude Code installé (`/opt/homebrew/bin/claude`, version 2.1.311 vérifiée le 19/11) et connecté avec son abonnement Claude (`claude auth status` : `loggedIn: true`, `authMethod: claude.ai`). Aucune clé, aucun compte payant à créer.

Autorisations validées par l'utilisateur le 19/11 : Claude lit, crée et modifie les notes de l'espace de travail sans demander ; aucun accès hors de ce dossier, aucune commande système, aucun accès au web.

**Révision du 19/11 au soir** : l'utilisateur veut que Claude ait accès au web (chercher sur le web, lire des pages web) ; Claude répondait qu'il n'y avait pas accès. Le reste ne change pas : rien hors du dossier, aucune commande système, aucun serveur MCP, réglages de l'utilisateur et du projet ignorés. Règle de sécurité décidée par l'utilisateur contre les instructions cachées dans une page : quand Claude a lu le web pendant une réponse, il ne crée ni ne modifie de note dans cette réponse sans l'accord de l'utilisateur (voir « Garde-fou du web »).

**Révision du 20/11** : Claude reçoit aussi les outils de l'application (chercher avec l'index, modèles, historique…), par un seul serveur MCP local, celui de l'application, joint sans aucun port réseau (fiche 0040). Rien d'autre ne change : aucun autre serveur MCP, chaque outil de l'application permis par son nom.

Trois façons de faire ont été pesées :

- **Un terminal intégré** qui lance `claude` en mode interactif : rien à comprendre du dialogue, mais ce n'est pas une discussion de l'application — pas de notes modifiées cliquables, pas de carte des agents, un émulateur de terminal à embarquer. Écarté.
- **Le kit de développement d'agents (Agent SDK)** : il donne la main sur chaque outil et chaque autorisation, mais il impose d'embarquer Node à côté de Rust (un moteur d'exécution de plus à livrer, signer et mettre à jour). Écarté pour l'instant.
- **Piloter l'outil `claude` installé**, en mode non interactif, en lisant ses événements en JSON au fil de l'eau. Retenu : rien à embarquer ni à lier, l'abonnement de l'utilisateur est utilisé tel quel, et c'est le même schéma que l'assistant Swift (fiche 0031) : un programme séparé, lancé par Rust, qui parle sur son entrée et sa sortie ; un plantage ne touche que ce programme.

À reconsidérer (alors avec le kit de développement d'agents ou le flux d'entrée JSON de `claude`) si l'on veut valider chaque modification une par une, brancher nos propres outils (chercher dans les notes, créer depuis un modèle) ou faire répondre plusieurs conversations en même temps (les onglets de conversation, ajoutés le 20/11, en tiennent plusieurs, mais une seule répond à la fois ; voir « Onglets de conversation »).

## Décision

### Lancement

Un tour = un lancement de `claude`, dans le dossier de l'espace de travail ouvert (dossier courant du programme lancé) :

```
claude -p --output-format stream-json --verbose
       [--resume <identifiant de la conversation>]
       [--model haiku|sonnet|opus|fable] [--effort low|medium|high|xhigh|max]
       --tools Read,Write,Edit,Glob,Grep,Agent,WebSearch,WebFetch
       --allowed-tools WebSearch,WebFetch
       --permission-mode acceptEdits --strict-mcp-config
       [--mcp-config <serveur de l'application>]
       --disable-slash-commands --setting-sources ""
       [--settings <crochets du garde-fou du web>]
```

- **Le message** est écrit sur l'entrée de `claude`, jamais passé en argument : un message qui commence par `-` ne peut pas devenir une option.
- **Continuer la conversation** : le premier événement (`system`, `init`) et le bilan (`result`) portent l'identifiant de la conversation (`session_id`) ; Rust l'annonce à l'interface (`conversationStarted`), qui le garde dans l'onglet de conversation et le rend avec le message suivant de cet onglet ; Rust le passe par `--resume`. Rust ne garde aucune conversation. L'identifiant n'est gardé qu'en mémoire, pas d'un lancement de l'application à l'autre (révision du 20/11 : avant les onglets de conversation, la session Rust gardait la seule conversation en cours).
- **Arrêter** : le programme `claude` du tour est tué. Ce qu'il a écrit reste écrit ; la conversation continue au message suivant.
- **L'abonnement de l'utilisateur** : `claude` lit sa propre connexion (trousseau du Mac).
- **Le modèle et le niveau d'effort** (réglages du tour) : tant que l'utilisateur n'a rien choisi, ni `--model` ni `--effort` ne sont passés, et Claude Code garde ses propres choix. Choisis sur leur pastille, ils sont passés à chaque tour, y compris avec `--resume` : une conversation se continue avec un autre modèle. Valeurs vérifiées dans `claude --help` (2.1.311), sans appeler le modèle : `--model` prend un alias du dernier modèle d'une famille (`haiku`, `sonnet`, `opus`, `fable`, du plus léger au plus capable), `--effort` un niveau (`low`, `medium`, `high`, `xhigh`, `max`). La page n'envoie que des valeurs de ces listes (types `ClaudeModelItem`, `EffortItem` ; une autre valeur est refusée par Rust avant tout lancement) ; l'adaptateur les traduit en options. Le choix est gardé dans le stockage de la page, d'un lancement à l'autre ; la pastille montre le nom de la famille (« Opus · Medium ») tant qu'aucune réponse n'a dit quel modèle a répondu, puis sa version (« Opus 5.5 · Medium », voir « Charge annoncée par Claude Code »).
- **L'environnement transmis** : vidé, puis seules quelques variables de l'application sont rendues (dossier personnel, utilisateur, `PATH`, shell, fichiers temporaires, langue, `CLAUDE_CONFIG_DIR` pour trouver la connexion, proxy du réseau et ses certificats). Mesuré le 19/11 : lancée depuis un terminal, l'application transmettait plus de 80 variables, dont des clés d'API, l'accès à l'agent SSH, et les variables d'une session Claude Code parente (`CLAUDECODE`, `CLAUDE_CODE_*`, dont une prise de messagerie et son jeton). Aucune clé d'API n'arrive donc à `claude` (c'est toujours l'abonnement qui sert, jamais une facturation à l'usage), ni `ANTHROPIC_BASE_URL` ou `CLAUDE_CODE_USE_BEDROCK` (qui changeraient qui répond et qui paie), ni aucun réglage de Claude Code par variable. Avec ce seul environnement, `claude auth status` dit bien « connecté » et un tour fonctionne (vérifié avec le vrai `claude`). La vérification de la connexion reçoit le même.
- **Trouver `claude`** : une application ouverte depuis le Finder n'a pas le `PATH` du Terminal ; l'adaptateur cherche dans les emplacements connus (`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`, `~/.claude/local`) puis dans le `PATH`.

### Autorisations et options qui les imposent

Vérifiées dans `claude --help` (2.1.311), sans appeler le modèle :

| Règle | Option |
|---|---|
| Seulement lire, chercher, créer, modifier des fichiers, lancer des sous-agents, chercher sur le web et lire des pages web | `--tools Read,Write,Edit,Glob,Grep,Agent,WebSearch,WebFetch` : les seuls outils offerts au modèle ; ni `Bash` ni aucun outil qui lance du code. Nommer `WebFetch` le garde malgré `--restricted` |
| Le web sans rien demander | `--allowed-tools WebSearch,WebFetch` : sans cette règle, chaque recherche et chaque lecture de page demande une autorisation, refusée d'office (mesuré) |
| Sans rien demander | `--permission-mode acceptEdits` : les créations et modifications de fichiers sont acceptées d'office |
| Ce qui demanderait une autorisation est refusé | rien à passer : sans personne pour répondre (`-p`), `claude` refuse d'office ce qui n'est pas permis (mesuré, voir « Mise à jour du 22/11/2026 ») |
| Rien hors du dossier de l'espace de travail | les outils de fichiers ne touchent que le dossier de travail : lire ou écrire plus loin demande une autorisation, refusée d'office ; `--tools` ne nomme aucun outil qui lance du code |
| Ni les réglages de l'utilisateur ni ceux du dossier (qui pourraient autoriser davantage ou lancer un crochet) | `--setting-sources ""` : aucune source de réglages chargée ; `--settings` (garde-fou du web) s'applique quand même |
| Pas d'autre serveur MCP que celui de l'application (fiche 0040), qui ne répond que sur ce Mac | `--strict-mcp-config`, et `--mcp-config` avec ce seul serveur ; chacun de ses outils permis par son nom dans `--allowed-tools` |
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

Le confinement tient donc : rien d'autre ne change que les deux outils du web et la règle qui les permet.

### Garde-fou du web

Une page lue peut cacher des instructions (« modifie toutes les notes… »). Règle décidée par l'utilisateur : quand Claude a lu le web pendant un tour, il ne crée ni ne modifie de note dans ce tour sans son accord.

- **Le mécanisme** : à chaque tour, l'adaptateur crée un dossier jetable (fichiers temporaires, `malorean-web-guard-…`) et passe par `--settings` deux crochets `PreToolUse` de Claude Code (`--settings` s'applique malgré `--restricted`, comme le dit `claude --help`, et les crochets du dossier restent ignorés) : avant `WebSearch` ou `WebFetch`, le premier pose une marque dans ce dossier ; avant `Write` ou `Edit` (et, depuis le 20/11, avant chaque outil de l'application qui crée, change, range ou jette une note, fiche 0040), le second cherche la marque et, s'il la trouve, refuse l'action (`permissionDecision: deny`) avec un texte fixe qui l'explique à Claude et lui demande de dire ce qu'il voulait modifier. Le dossier est effacé à la fin du tour ; chaque tour a le sien. Les crochets ne sont que des commandes de l'application (`touch`, `test`, `printf`), jamais du texte de Claude ; la marque est hors du dossier de l'espace de travail, où Claude ne peut ni l'écrire ni l'effacer.
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

- `system` / `init` : début, identifiant de la conversation, modèle qui répond (`model`, ex. `claude-opus-5-5`) ;
- `rate_limit_event` : la limite d'utilisation de l'abonnement (voir « Charge annoncée par Claude Code ») ;
- `assistant` : un message (blocs `text`) ou une action lancée (blocs `tool_use` : outil, entrée, identifiant) ;
- `user` : l'issue d'une action (blocs `tool_result`, rattachés par `tool_use_id`) ;
- `parent_tool_use_id` non vide : le message ou l'action appartient au sous-agent lancé par cette action  ; une action `Agent` (description, consigne) ouvre un sous-agent, son issue le clôt ;
- `result` : le bilan (réussi ou en erreur, durée, jetons, nombre de tours), avec les jetons de la dernière requête (`usage.iterations`) et, par modèle, la taille de son contexte (`modelUsage.<modèle>.contextWindow`).
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
- Après une connexion ou une déconnexion réussie, les conversations sont oubliées : l'interface ferme les onglets de conversation de chaque espace de travail, il en reste un vide (un autre compte ne pourrait pas les continuer) ; après toute fin, la connexion est revérifiée et le compte montré change.
- **Affichage** : en haut de la colonne, un bloc repliable (« Compte Claude · adresse · organisation », « non connecté », « vérification… ») ; déplié, les boutons, la progression (« Connexion : terminez-la dans le navigateur qui vient de s'ouvrir… »), puis l'issue (« Connecté : Claude Code utilise ce compte, aussi dans le Terminal et VS Code. », « Connexion annulée. »). Tout à la souris, sans raccourci clavier (fiche 0033).
- **Tests** : le faux Claude Code répond aussi à `auth logout` et `auth login` (il garde son état dans un dossier jetable ; sa connexion « en attente du navigateur » attend sur son entrée, ce qui vérifie qu'elle reste ouverte). Le vrai `claude auth login` ou `logout` n'est jamais lancé par un test ni à la main pendant le développement (il déconnecterait l'utilisateur).

### Hexagonal

- Port `ClaudeCode` dans `application`, dans ses mots : vérifier la connexion (avec le compte Claude), se déconnecter, se connecter, envoyer un message (dossier, identifiant de conversation éventuel) en rendant les événements de Claude au fil de l'eau, arrêter.
- Adaptateur `ClaudeCodeCli` dans `infrastructure` : lance le programme, écrit le message, lit la sortie ligne à ligne sur un fil à part, traduit chaque ligne.
- Faux `FakeClaudeCode` et contrat `testing` joué sur le faux et sur l'adaptateur, comme les autres ports.
- `api` relaie les événements à la page au fur et à mesure ; la page tient l'état de la colonne (fonctions pures dans `ui/src/state/`).

### Colonne de discussion

- Commandes `send_to_claude` (le message, la conversation à continuer ou `null`, les réglages du tour) et `stop_claude`, à côté de `claude_status`. `send_to_claude` joue le tour sur un fil d'arrière-plan et se termine avec lui ; chaque événement part aussitôt à l'interface (événement Tauri `claude-event`, type `ClaudeEventItem`), dont le début de la conversation (`conversationStarted`, son identifiant). La conversation reçue de l'interface n'est passée à `--resume` que si elle ressemble à un identifiant de Claude Code (lettres, chiffres, `-`, `_`, sans `-` au début) : sinon le tour est refusé avant tout lancement (« la conversation à continuer est inconnue »), et rien de l'interface ne peut devenir une option. (La commande `new_conversation` a disparu le 20/11 : ouvrir une conversation neuve ne touche plus Rust.)
- `api` ajoute aux événements chaque note modifiée (`changedNote`) : une action `Write` ou `Edit` réussie dont la cible (absolue, ou relative au dossier) est une note (`.md`, chemin sûr) de l'espace de travail. Une écriture refusée ou en erreur ne compte pas.
- Sa largeur se règle en tirant son bord gauche, entre un minimum et un maximum, gardée d'un lancement à l'autre (fiche 0018, révision du 19/11).
- La colonne s'affiche ou se masque par sa commande (Ctrl+Cmd+L, libre dans l'application, l'éditeur et macOS), le bouton « Claude » des outils de l'éditeur, la palette et le menu Présentation. Elle vérifie la connexion à chaque ouverture. Un message de Claude est mis en forme par le rendu des notes (même analyseur que l'éditeur, HTML de la note jamais interprété) ; un lien de ses messages ne fait pas quitter l'application, ses images ne sont pas chargées. Une erreur du tour suivant un « Arrêter » est dite « Réponse arrêtée » ; les autres sont montrées telles que Rust les écrit. Quand un tour annonce plusieurs bilans, la colonne ne montre que le dernier ; une note modifiée deux fois dans un tour n'est montrée qu'une fois.

### Barre de saisie

Sous la zone du message, une rangée de pastilles, comme Claude Code dans VS Code, toutes utilisables à la souris :

- **Modèle et niveau d'effort** dans une même pastille (« Opus · Medium », « Modèle par défaut » sans choix ; après une réponse, la version du modèle qui a répondu, « Opus 5.5 · Medium », sauf si une autre famille a été choisie depuis) : un clic ouvre leur choix, deux groupes du plus bas au plus haut, « Par défaut » en tête de chacun, l'actuel coché ; un clic ailleurs ou Échap le ferme.
- **Sous-agents en cours**, toujours visible (« ● 0 agent », « ● 1 agent », « ● 2 agents ») : un clic déplie la carte des agents ; sans sous-agent, la carte dépliée dit « Aucun sous-agent lancé dans cette conversation. » et se cache de nouveau une fois repliée.
- **Durée de la réponse**, mise à jour chaque seconde pendant le tour, montrée seulement sur l'onglet de conversation qui répond, cachée ensuite.
- **Limite d'utilisation** (« Session 16 % · 59 min ») et **remplissage du contexte** (« Contexte 42 % »), détaillés dans leur bulle d'aide, cachés tant que Claude n'a pas répondu (voir « Charge annoncée par Claude Code »).
- **Notes jointes** : la note ouverte dans la colonne active est jointe d'office (suivie à chaque changement des colonnes) ; sa croix la retire jusqu'à ce qu'une autre note s'ouvre. « + » ouvre la fenêtre de choix de l'ouverture rapide sur les notes de l'espace de travail ; les notes ainsi jointes sont retirées une fois le message parti. Le message envoyé se termine par « Notes jointes (chemins depuis l'espace de travail) : » et la liste de leurs chemins : Claude les lit lui-même, avec ses outils limités à l'espace de travail ; rien de leur contenu ne passe par l'application. La conversation montre sous le message les titres des notes jointes.
- **Envoyer**, qui devient un carré d'arrêt (« Arrêter ») pendant la réponse.

Pas de pastille des autorisations (« Auto » dans VS Code : elles sont fixes, voir plus haut) ni de commandes en `/` (`--disable-slash-commands`) : ces deux pastilles du module de VS Code restent dehors, voulu.

Revue de la capture du module de VS Code (20/11) : « + », « / », une horloge (« 56m »), « ● 1 agent », « Opus 5.5 Medium », la note jointe et sa croix, « Auto », Envoyer. Tout y est, sauf « / » et « Auto » (ci-dessus) et l'horloge. Vérifié dans le code du module installé (`anthropic.claude-code` 2.1.328, sa page `webview/index.js`), l'horloge **n'est pas** le temps avant la remise à zéro de la limite : c'est le temps qui reste au **cache de la conversation** chez Anthropic (« Prompt cache warm, about 56 min left. »), compté depuis la dernière requête sur la durée de vie du cache (1 heure ou 5 minutes, lue dans `usage.cache_creation`) ; passé ce temps, le message suivant relit toute la conversation sans cache et use davantage la limite. Laissée de côté pour l'instant : elle ne dit pas où en est la limite, que la pastille de la limite d'utilisation montre ; à ajouter si l'utilisateur la veut (tout est dans le flux, sans appel de plus).

### Charge annoncée par Claude Code

Ce que le vrai `claude` donne, sans aucun appel de plus au modèle, mesuré le 20/11 (2.1.311, `--model haiku`, un message trivial, dossier jetable ; flux gardé pour les tests : `usage.jsonl`) :

| Ligne du flux | Ce qu'elle donne | Ce qu'en fait l'application |
|---|---|---|
| `system` / `init` | `model` : `claude-haiku-5-5` | Version du modèle : « Haiku 5.5 » sur la pastille du modèle (famille connue et numéros d'un ou deux chiffres, la date ignorée) |
| `rate_limit_event`, une fois par réponse | `rate_limit_info` : `status` (`allowed`, `allowed_warning`, `rejected`), `unifiedWindows.five_hour` et `.seven_day`, chacune avec `utilization` (part de 0 à 1, ici 0,16 et 0,43) et `resetsAt` (secondes depuis 1970) ; aussi `rateLimitType`, `overageStatus`, `isUsingOverage` | Limite d'utilisation : session (5 heures) et semaine, en pourcentage arrondi, avec leur remise à zéro ; `rejected` = limite atteinte. Les autres champs (dépassement payant, alerte décidée par Anthropic) ne sont pas montrés |
| `result` | `usage.iterations` : les jetons de la dernière requête (lus, cache lu, cache écrit, écrits) ; `modelUsage.<modèle>.contextWindow` : 1 000 000 pour Haiku 5.5 | Remplissage du contexte : la somme de la dernière requête sur la taille du contexte du modèle annoncé au début (le seul du bilan, à défaut) |

Rien d'autre : le flux ne donne pas le niveau d'effort appliqué par défaut (seulement `per_turn_effort_active`), et `claude --help` n'a ni option ni commande qui donne la limite hors d'un tour : elle reste inconnue tant que Claude n'a pas répondu une fois depuis le lancement de l'application. Le `usage` cumulé du bilan additionne toutes les requêtes du tour : il ne mesure pas le contexte (sur un flux enregistré, 48 260 jetons cumulés pour 10 095 dans le contexte à la fin).

- Le lecteur du flux retient le modèle annoncé par `init` pour trouver, dans le bilan, la taille de son contexte ; une limite sans période complète et non atteinte n'est pas annoncée.
- La page garde la dernière charge reçue (`ui/src/state/claude-load.ts`). La limite vaut pour tout l'abonnement : elle est commune à tous les onglets de conversation ; le modèle et le contexte sont ceux de la conversation, gardés par son onglet (un nouvel onglet part de zéro, un changement de compte aussi).
- Pastille de la limite : la période la plus utilisée (la session à égalité), « Session 16 % · 59 min » ou « Semaine 43 % · 5 j 3 h » ; le temps avant la remise à zéro est recalculé chaque minute (« 59 min », « 3 h 05 », « 5 j 3 h ») ; une remise à zéro passée depuis la dernière réponse repart de 0 %. Couleur d'alerte à partir de 80 % (le seuil des jauges d'utilisation du module de VS Code) ; atteinte : « Limite atteinte · 30 min », sur fond d'erreur. Sa bulle d'aide dit ce que c'est et détaille les deux périodes.
- Pastille du contexte : « Contexte 42 % », couleur d'alerte à partir de 80 % ; sa bulle d'aide donne les jetons et rappelle que « Nouvelle conversation » repart d'un contexte vide.

### Carte des agents

- Construite **dans la page**, par des fonctions pures (`ui/src/state/agent-map.ts`), à partir des événements que la colonne reçoit déjà (`claude-event`) : rien de plus à envoyer par Rust, et la page tient déjà l'état de la conversation. (La première version de cette fiche la plaçait dans le domaine ; la page reçoit les événements un par un et n'a pas d'autre état à partager avec Rust.)
- Une action « sous-agent » (`Agent`, ou `Task`) ouvre un sous-agent : sa description est la cible de l'action, « Sous-agent » à défaut. Son parent est le sous-agent auteur de l'action (`agent`), rien pour Claude lui-même ; un parent inconnu le met à la racine.
- Ses actions sont comptées au fil des actions lancées dont il est l'auteur (dont les sous-agents qu'il lance) ; à sa fin (`task_notification`), l'état, la durée, les jetons et le nombre d'actions annoncés remplacent ce qui était compté. Durée et jetons ne sont connus qu'à la fin.
- L'issue réussie de l'action qui le lance ne dit rien (il travaille en arrière-plan) ; refusée ou en erreur, il est en erreur.
- Fin du tour : arrêté ou en erreur, les sous-agents encore en cours sont interrompus ; fini normalement, ils sont terminés (Claude Code attend ses sous-agents avant de sortir).
- Affichage : en haut de la colonne, sous l'en-tête, un bloc repliable (`details`), replié au départ et caché tant qu'aucun sous-agent n'a été lancé (sauf déplié par la pastille des sous-agents : il dit alors qu'il n'y en a aucun) ; vidé alors qu'il était déplié, il se replie ; replié, « Carte des agents · 2 sous-agents · 1 en cours » ; déplié, l'arbre, chaque sous-agent avec sa description et « terminé · 3,3 s · 8 523 jetons · 2 actions ». Redessiné à chaque événement sans se replier ; chaque onglet de conversation a la sienne, montrée avec lui. Le faux Claude Code des parcours rejoue un tour avec un sous-agent qui en lance un autre (`claudeAgents=1`), sur le modèle du flux enregistré.

### Onglets de conversation

Demandé par l'utilisateur le 20/11 : plusieurs conversations ouvertes à la fois dans la colonne, une par onglet, comme le module de VS Code.

- **La barre** : sous l'en-tête, un onglet par conversation, avec son titre et sa croix ; un clic montre sa conversation. Le titre vient du premier message de l'utilisateur, sur une ligne, raccourci à 30 caractères (« … »), « Nouvelle conversation » jusque-là. « Nouvelle conversation » ouvre un onglet vide à la fin de la barre, le montre et met le curseur dans la zone du message ; les autres conversations restent dans leurs onglets. Tout à la souris, aucun raccourci (fiche 0033).
- **Ce que garde chaque onglet** (fonctions pures, `ui/src/state/claude-tabs.ts`) : l'identifiant de sa conversation, ses messages, actions et notes modifiées, sa carte des agents, son modèle et son remplissage du contexte, son tour en cours et les modifications retenues par le garde-fou du web (« Autoriser ses modifications » continue la conversation de cet onglet). La limite d'utilisation, celle de l'abonnement, est commune. Les notes jointes et les réglages du tour restent ceux de la barre de saisie, communs.
- **Un seul tour à la fois**, tous onglets et espaces de travail confondus (Rust n'en joue qu'un) : les événements d'un tour vont à l'onglet qui l'a lancé, même quand un autre est montré. Cet onglet porte un témoin (point de couleur, « Claude répond » au survol). Choix le plus simple et clair : **refuser**, pas mettre en file d'attente. Dans les autres onglets, on peut écrire mais pas envoyer : Envoyer est grisé, Entrée ne fait rien, et la conversation dit « Claude répond dans un autre onglet de conversation : attendez la fin de sa réponse, ou arrêtez-la depuis cet onglet, pour envoyer un message ici. » ; « Autoriser ses modifications » attend aussi. Une file d'attente enverrait plus tard un message qu'on ne voit plus partir, avec des réglages et des notes jointes qui ont pu changer entre-temps.
- **Arrêter** vise l'onglet qui répond : le carré d'arrêt n'apparaît que sur lui.
- **Fermer** : la croix de l'onglet qui répond **arrête d'abord son tour** (sans demander : la croix le dit au survol, « Arrêter la réponse et fermer l'onglet de conversation »), puis ferme l'onglet ; ce qui arrive encore de ce tour est ignoré, et les autres onglets attendent que le tour soit vraiment fini pour envoyer. Ce que Claude a déjà écrit reste écrit, comme pour « Arrêter ». Fermer l'onglet montré montre son voisin de droite, sinon celui de gauche ; fermer le dernier laisse un onglet vide.
- **Par espace de travail** : chaque espace de travail a ses onglets ; y revenir pendant la session les retrouve, avec l'onglet montré. Un tour lancé dans un espace de travail continue quand on passe à un autre, dont les onglets refusent alors d'envoyer jusqu'à sa fin.
- **Pas gardés au relancement** : les onglets et leurs conversations ne vivent qu'en mémoire. Claude Code garde les conversations de son côté (`--resume` saurait les reprendre), mais l'application ne pourrait en remontrer que les identifiants, pas l'historique : un onglet rouvert sans ses messages serait trompeur. À ajouter si l'utilisateur le veut (identifiants et titres par espace de travail dans le stockage de l'interface).
- **Tests** : fonctions pures (`claude-tabs.test.ts`), vue de la barre et de la colonne, module de la colonne (`claude-tabs.browser.test.ts`), parcours Playwright à la souris (`claude-tabs.spec.ts`) ; le faux Claude Code annonce une conversation à chaque tour (`conversation-1`, `conversation-2`… ou celle reçue) et garde celles reçues (`claudeConversations`).

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


## Mise à jour du 22/11/2026 : options inconnues des versions récentes de Claude Code

`claude` 2.1.177 refuse `--permission-prompts`, `--restricted` et `--forward-subagent-text` (« unknown option ») et sort aussitôt, sans flux JSON : la colonne affichait « aucun bilan » à chaque message. Ces trois options ne sont plus passées. Mesuré sur 2.1.177, dans un dossier où `.claude/settings.json` pose un crochet et une permission de lire `/etc` :

| Tentative | Sans `--setting-sources ""` | Avec |
|---|---|---|
| Lire `/etc/hosts`, écrire hors du dossier | refusé (personne pour accepter) | refusé |
| Crochet `UserPromptSubmit` du dossier | **exécuté** | pas exécuté |
| Permission du dossier de lire `/etc/**` | **appliquée** : lecture faite | sans effet |
| Crochets passés par `--settings` (garde-fou du web) | exécutés | exécutés |

`--setting-sources ""` remplace donc ce que `--restricted` faisait pour les réglages. Les textes des sous-agents ne sont plus suivis à part (`--forward-subagent-text` perdu) : à revérifier si l'interface en a besoin.

Deux garde-fous contre la même panne : un test lance `claude --help` quand il est installé et vérifie que chaque option passée y figure ; et un tour qui s'arrête sans bilan donne les dernières lignes de la sortie d'erreur de `claude` (au lieu de « aucun bilan »).

## Mise à jour du 22/11/2026 : le garde-fou du web devient un réglage

Après une recherche sur le web, chaque création ou modification attendait l'accord de l'utilisateur : insupportable pour « cherche, puis crée la note ». Le réglage « Modifications après une lecture du web » (partie « Claude » des réglages) choisit : « Laisser Claude modifier » (**par défaut**, le garde-fou n'est pas posé) ou « Demander mon accord » (le comportement ci-dessus, avec le bouton « Autoriser ses modifications »). Le confinement à l'espace de travail et `--setting-sources ""` ne dépendent pas de ce réglage. Reste à faire : l'outil de l'application qui crée un dossier.

## Mise à jour du 22/11/2026 : l'application lit ce que `claude` connaît

À chaque ouverture de la colonne et à chaque tour, `claude --help` (0,2 s) est lu. Une option nécessaire qui manque (`REQUIRED_OPTIONS` dans `claude_code_cli.rs`) donne l'état « Claude Code ne connaît pas … : mettez-le à jour » (`ClaudeStatus::Incompatible`), et le tour n'est pas lancé : plus de « aucun bilan » muet. `--forward-subagent-text` est facultative : passée seulement si `claude --help` la liste (sans elle, mesuré sur 2.1.177, les actions des sous-agents arrivent toujours avec leur `parent_tool_use_id`, mais pas leurs textes). Une aide illisible ou sans option ne conclut à rien. Les outils de l'application comptent un outil de plus, `create_folder` (dossier et dossiers manquants de son chemin) ; `create_note` crée aussi le dossier qui manque.
