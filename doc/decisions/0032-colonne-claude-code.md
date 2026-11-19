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
- **L'abonnement de l'utilisateur** : `claude` lit sa propre connexion (trousseau du Mac). L'adaptateur retire `ANTHROPIC_API_KEY` de l'environnement transmis, pour que ce soit toujours l'abonnement qui serve, jamais une facturation à l'usage. Le modèle est celui choisi par défaut par l'utilisateur.
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

Les sous-agents passent par les mêmes limites. Le nom de l'outil des sous-agents (`Agent`, autrefois `Task`) est confirmé sur le flux enregistré lors du pilote en arrière-plan. La construction de ces arguments est une fonction pure de l'adaptateur, testée ; le faux Claude Code vérifie qu'ils sont bien passés.

### Événements

`--verbose` est exigé par `-p` avec `stream-json`. Chaque ligne de la sortie est un objet JSON, traduit par l'adaptateur en événement de Claude (`ClaudeEvent`) :

- `system` / `init` : début, identifiant de la conversation ;
- `assistant` : un message (blocs `text`) ou une action lancée (blocs `tool_use` : outil, entrée, identifiant) ;
- `user` : l'issue d'une action (blocs `tool_result`, rattachés par `tool_use_id`) ;
- `parent_tool_use_id` non vide : le message ou l'action appartient au sous-agent lancé par cette action (`--forward-subagent-text` fait suivre les textes des sous-agents) ; une action `Agent` (description, consigne) ouvre un sous-agent, son issue le clôt ;
- `result` : le bilan (réussi ou en erreur, durée, jetons, nombre de tours).

Une ligne illisible ou d'un type inconnu est ignorée (Claude Code évolue vite). Une note modifiée par Claude se déduit des actions `Write` et `Edit` réussies dont le fichier est dans l'espace de travail, désigné par son chemin depuis l'espace de travail. La carte des agents se construit dans le domaine, par une fonction pure, à partir de ces seuls événements.

### Vérification de la connexion

`claude auth status --json` (n'appelle pas le modèle) : `loggedIn` dit si l'utilisateur est connecté. Introuvable, pas connecté ou en erreur, la colonne dit quoi faire (installer Claude Code, taper `claude auth login` dans le Terminal).

### Hexagonal

- Port `ClaudeCode` dans `application`, dans ses mots : vérifier la connexion, envoyer un message (dossier, identifiant de conversation éventuel) en rendant les événements de Claude au fil de l'eau, arrêter.
- Adaptateur `ClaudeCodeCli` dans `infrastructure` : lance le programme, écrit le message, lit la sortie ligne à ligne sur un fil à part, traduit chaque ligne.
- Faux `FakeClaudeCode` et contrat `testing` joué sur le faux et sur l'adaptateur, comme les autres ports.
- `api` relaie les événements à la page au fur et à mesure ; la page tient l'état de la colonne (fonctions pures dans `ui/src/state/`).

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
