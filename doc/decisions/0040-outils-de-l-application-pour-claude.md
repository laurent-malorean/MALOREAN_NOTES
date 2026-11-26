# 0040 — Outils de l'application pour Claude : un serveur MCP local, joint par un relais et une prise Unix, sans aucun port réseau

- **Date** : 2026-11-20
- **Statut** : acceptée
- **Complète** la fiche 0032 (colonne Claude Code) : Claude y reçoit, en plus de ses outils de fichiers et du web, les outils de l'application.
- **Complétée** par la fiche 0041 (20/11/2026) : l'outil `add_entry` ajoute une entrée à un cahier de recherche.
- **Complétée** par la fiche 0061 (25/11/2026) : l'outil `create_crm` crée un CRM, la présentation du serveur donne la consigne sur les CRM, la recherche rend les fiches avec leur CRM.
- **Remplacée sur le point « partage »** par la fiche 0075 (26/11/2026) : l'outil `replace_in_note` change le texte d'une note simple ; il ne reste plus aux seuls outils de fichiers de l'IA.
- **Complétée** par la fiche 0078 (26/11/2026) : les outils `list_folders`, `rename_folder`, `move_folder` et `trash_folder` (avec `create_folder`, déjà là) donnent à l'IA l'arbre des dossiers et leurs changements, par les cas d'usage de l'interface.
- **Complétée** par la fiche 0080 (26/11/2026) : la carte mentale se lit en arbre (`read_mind_map`) et se modifie par un outil par geste de l'interface (`add_mind_map_child`, `add_mind_map_sibling`, `add_mind_map_root`, `edit_mind_map_node`, `color_mind_map_node`, `move_mind_map_node`, `delete_mind_map_node`) ; `read_note` et `replace_in_note` la refusent en renvoyant vers eux.

## Contexte

Dans la colonne Claude Code, Claude ne connaît les notes que par leurs fichiers : il parcourt le dossier pour chercher, ignore l'index, les modèles de note, l'historique des versions, et peut créer un fichier sans suivre les règles de l'application (nom tiré du titre, en-tête, dossier des pièces jointes, corbeille au lieu d'effacer). L'utilisateur veut que Claude passe par l'application (todo.md, « Pilotage par des IA », validé le 19/11) :

- **Partage** (remplacé par la fiche 0075 : `replace_in_note` change le texte d'une note simple) : à l'origine, changer le texte d'une note restait aux outils de fichiers de Claude (remplacer un passage par un autre couvre tous les cas) ; l'application n'offrait que les actions qui ont ses propres règles.
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
| `read_note` | Le texte entier d'une note simple, en-tête et corps séparés, 60 000 caractères de corps au plus (fiche 0076) |
| `list_templates` | Les noms (titres) des modèles de note : les notes du dossier des modèles de l'espace visé, relu à chaque appel dans les préférences (fiche 0077) |
| `list_versions` | Les versions d'une note, la plus récente d'abord |
| `read_version` | Le texte d'une version |
| `create_note` | Crée une note : titre `#` en tête, nom du fichier tiré du titre (suffixe si pris), dans un dossier, avec un texte sous le titre |
| `create_note_from_template` | Crée une note depuis un modèle nommé (titre du modèle ou nom de son fichier) : l'application applique le modèle (date, heure remplacées), `{{title}}` et le titre `#` prennent le titre donné ; Claude n'a pas à lire le modèle |
| `trash_note` | Met une note à la corbeille (jamais effacée), avec ses pièces jointes et son historique |
| `rename_note` | Change le titre d'une note : fichier et dossier de pièces jointes renommés, liens vers ses pièces jointes suivis ; rend aussi les notes dont un lien `[[ancien titre]]` la visait, que Claude reprend avec ses outils de fichiers s'il le faut (l'application ne réécrit pas ces liens, fiche 0016) |
| `move_note` | Range une note dans un autre dossier (pièces jointes et historique suivent ; suffixe si le nom est pris) |
| `restore_version` | Remet le texte d'une version, après avoir gardé le texte actuel comme version |
| `add_tags`, `remove_tags` | Ajoute ou retire des étiquettes dans l'en-tête, sans toucher au reste : la clé `tags` réécrite à sa place (`tags: [a, b]`, quelle que soit sa forme d'avant), ajoutée après les autres clés, ou retirée avec l'en-tête s'il ne contient plus rien ; une étiquette déjà là (majuscules et accents ignorés) n'est pas doublée ; une étiquette qui changerait le sens de la liste (`,`, `[`, `:`, guillemets…) est refusée |
| `pin_note`, `unpin_note` | Épingle ou désépingle une note |
| `replace_in_note` | Remplace un texte par un autre dans une note simple, selon les règles de la saisie (fiche 0075) |
| `add_attachment` | Joint à une note une image ou un PDF déjà rangé dans l'espace de travail : copié dans son dossier de pièces jointes (nom des règles des pièces jointes glissées, suffixe si pris), son lien ajouté à la fin de la note ; le fichier d'origine reste où il est. Le stockage lit ce fichier (`NoteStore::read_file`) sans jamais suivre un lien symbolique qui sortirait de l'espace de travail |
| `viewed_note` | Ce que l'utilisateur regarde : la note de la colonne active (chemin et titre, ou rien) et le texte qui y est sélectionné, avec le nom de l'espace de travail |
| `show_note` | Montre une note à l'utilisateur : elle s'ouvre dans la colonne active (une note qui n'existe pas est refusée) |

Leur liste, leurs noms et ce qu'ils visent sont dans le domaine (`domain::app_tools::AppTool`) ; ce que Claude en lit (description, schéma de l'entrée) dans `api` (`session/app_tools/catalog.rs`).

### Ce que voit l'utilisateur

Rust ne sait pas ce que montre l'interface : les deux outils qui y touchent passent par un port de `api`, `AppScreen`, que `commands` réalise par des événements Tauri (`TauriScreen`, branché dans `app`).

- **Montrer une note** : `show_note` vérifie que la note existe, puis l'événement `claude-shows-note` (le chemin) l'ouvre dans la colonne active, comme un clic sur une note modifiée par Claude.
- **Ce que l'utilisateur regarde** est demandé **au moment de l'appel**, jamais suivi en continu : l'événement `claude-asks-view` porte un numéro de demande ; l'interface (`ui/src/app/claude-app-tools.ts`) répond par la commande `answer_view` (numéro, note de la colonne active ou `null`, texte sélectionné dans son éditeur) ; Rust attend la réponse 2 secondes au plus (sinon l'outil échoue : « l'interface n'a pas répondu : réessayez »), puis lit le titre de la note. Une réponse en retard ou à une demande inconnue est ignorée. Rien n'est gardé : le texte sélectionné ne quitte l'interface que quand Claude le demande, pendant un tour.
- Rien d'autre de l'écran : ni colonnes, ni onglets, ni curseur (todo.md, « Rien de visuel »).

### Garde-fou du web

Les outils qui créent, changent, rangent ou jettent une note (`AppTool::changes_notes` : tous sauf les six qui lisent) sont retenus après une lecture du web, comme `Write` et `Edit` : le crochet qui refuse vise `Write|Edit|mcp__malorean__create_note|…` (fiche 0032, « Garde-fou du web ») ; l'action retenue est dite « retenue » dans la colonne, et « Autoriser ses modifications » les laisse passer pour un tour, comme les autres.

### Dans la colonne

Une action d'un outil de l'application (`mcp__malorean__…` dans le flux) devient `ActionKind::AppTool` ; l'interface la nomme en français : « Recherche dans l’index », « Étiquettes », « Liens entrants », « Modèles », « Historique », « Lecture d’une version », « Nouvelle note », « Note depuis un modèle », « Mise à la corbeille », « Renommage », « Déplacement », « Restauration d’une version », « Ajout d’étiquettes », « Retrait d’étiquettes », « Modification du texte », « Épinglage », « Désépinglage », « Pièce jointe », « Note regardée », « Note montrée » ; un outil inconnu, « Outil de l’application ». Sa cible est la recherche ou la note visée.

### Mesuré avec le vrai `claude` (20/11, 2.1.311, `--model haiku`, dossier jetable)

Options exactes de la fiche 0032, serveur ajouté par `--mcp-config` :

| Tentative | Résultat |
|---|---|
| `--restricted --strict-mcp-config --mcp-config …` | le serveur est chargé (`mcp_servers` : `malorean`, `connected`, source `dynamic`) ; la liste des outils du début ajoute ses outils (`mcp__malorean__…`) aux seuls outils de la fiche 0032 |
| Un outil de l'application absent de `--allowed-tools` | refusé (`permission_denied` : « no approval surface ») : chaque outil doit être permis par son nom |
| Premières lignes reçues par le serveur | `server/discover` (sonde, avec un identifiant : il faut y répondre, une erreur suffit), `initialize` (version `2025-11-25`), `notifications/initialized`, `tools/list`, puis un `tools/call` par action |
| Programme lancé | dans le dossier de l'espace de travail, avec quelques variables de Claude Code (`CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`…) |
| Tour complet par le relais (programme de l'application) et `Session::answer_app_tools` : chercher « pain », étiquettes, liens entrants, modèles, puis `list_versions` de `../../etc/passwd` et `search_notes` dans `../` | les quatre premiers rendent ce qu'attend l'interface ; les deux derniers refusés (« nom de note invalide », « dossier invalide ») ; les actions arrivent dans le flux sous leur nom `mcp__malorean__…` |

Outils qui changent une note et garde-fou du web (20/11, mêmes conditions ; le dossier jetable contenait aussi, pour tenter d'élargir les droits, un `.claude/settings.json` et un `.claude/settings.local.json` qui autorisent tout avec un crochet `SessionStart`, un `.mcp.json` avec un autre serveur, un `CLAUDE.md` qui demande un mot repère, et des liens symboliques vers un fichier et un dossier du dehors) :

| Tentative | Résultat |
|---|---|
| Créer « Liste de courses », créer « Point équipe » depuis le modèle « Réunion du {{date}} », étiqueter, épingler, renommer en « Alpha bis », ranger dans `Documents`, joindre `Documents/icone.png`, mettre à la corbeille, lister les versions | tout fait selon les règles : `liste-de-courses.md` puis `Documents/liste-de-courses.md`, `point-equipe.md` dans `.trash/`, en-tête `tags: [maison, été]` et `pinned: true`, `alpha-bis.md` et `alpha-bis.assets/icone.png`, lien ajouté à la fin |
| Joindre `lien.png`, lien symbolique vers une image du dehors | refusé (« la pièce jointe « lien.png » est introuvable ») |
| Lire `/etc/hosts`, lire par le lien `lien.txt`, lancer `Bash` | refusés, comme avant (fiche 0032) |
| Lister les étiquettes, chercher sur le web, puis créer une note et ajouter une étiquette, puis chercher « pain » | lecture des étiquettes et recherche faites ; création et étiquette **retenues par le crochet** (« PreToolUse:mcp__malorean__create_note hook error: » et le texte du garde-fou) sans jamais arriver à l'application ; la recherche dans l'index, qui ne change rien, faite |
| Réglages, crochet, serveur et `CLAUDE.md` du dossier | sans effet : aucun crochet ni autre serveur lancé, le mot repère jamais écrit |
| « Quelle note et quel passage je regarde ? Montre-moi `Documents/liste-de-courses.md` » (interface remplacée par un faux qui répond `alpha-bis.md` et « du pain ») | `viewed_note` rend la note, son titre, le passage et le nom de l'espace de travail ; `show_note` demande à l'interface d'ouvrir la note ; Claude répond avec ce qu'il a appris |

### Tests

- La prise et le relais (`infrastructure/tests/local_socket.rs`) : un échange complet par le relais ; prise Unix en `0600` dans un dossier en `0700` ; disparue à la fermeture ; et, pendant un échange, **aucune prise réseau ouverte par le programme** (`lsof -a -p <programme> -i` ne rend rien, alors que `-U` voit bien les prises Unix).
- L'interface : ce que l'utilisateur regarde rendu à la demande, une note montrée ouverte (`claude-app-tools.test.ts`) ; parcours Playwright où Claude demande la note regardée et le passage sélectionné, cherche, puis montre une note qui s'ouvre (`claude-app-tools.spec.ts`).
- Le protocole sur ses lignes (`mcp.rs`), chaque outil par son protocole sur des faux (`session/app_tools/tests.rs`), dont la clé (refusée hors d'un tour, d'un autre tour, ou après le tour ; un tour refusé pendant un autre ne la change pas) et l'espace de travail du tour.
- Les options de Claude Code avec et sans outils de l'application (faux Claude Code) ; le contrat du port joue un tour qui porte une clé, sur le faux et sur l'adaptateur.

## Conséquences

- Claude cherche avec l'index et connaît les règles de l'application sans relire les fichiers ; ce qu'il change par ses outils de fichiers reste suivi comme avant (surveillance, historique).
- Chaque tour lance un relais de plus (le programme de l'application, sans interface), quelques millisecondes.
- Si la prise ne peut pas être ouverte au lancement, la colonne marche comme avant, sans les outils de l'application (un avertissement dans le journal).
- Un autre programme du même compte, qui lirait les arguments de `claude` pendant un tour, pourrait lire la clé : il pourrait de toute façon lire et écrire les notes de l'utilisateur. La prise protège des autres comptes et du réseau.
- **Complétée** par la fiche 0079 (26/11/2026) : `read_canvas` et dix outils de changement (`add_canvas_card`, `change_canvas_card`, `move_canvas_card`, `resize_canvas_card`, `remove_canvas_card`, `add_canvas_arrow`, `change_canvas_arrow`, `remove_canvas_arrow`, `add_canvas_group`, `change_canvas_group`) lisent et changent un canvas par les règles de l'interface.
- **Complétée** par la fiche 0081 (26/11/2026) : `read_crm` et quatorze outils de changement (`create_crm_action`, `change_crm_action`, `move_crm_action`, `delete_crm_action`, `create_crm_person`, `change_crm_person`, `delete_crm_person`, `create_crm_company`, `change_crm_company`, `delete_crm_company`, `create_crm_project`, `change_crm_project`, `delete_crm_project`, `change_crm_stages`) lisent et changent un CRM par les cas d'usage de l'interface.