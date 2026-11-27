# Le serveur MCP de MALOREAN Notes

MALOREAN Notes offre ses actions aux IA par un **serveur MCP local** nommé `malorean_notes`. Ce sont les **outils de l'application** : chercher avec l'index, lire et changer une note selon ses règles, ranger les dossiers, écrire dans un cahier de recherche, modifier une carte mentale, un canvas, un CRM ou un agenda 12. Une IA qui passe par eux respecte les règles de l'application (nom du fichier tiré du titre, historique des versions, corbeille, index à jour) au lieu d'écrire les fichiers à la main.

Le même serveur, avec les mêmes outils, sert à deux endroits :

- la **colonne Claude Code** de l'application, le temps d'un tour ;
- une **IA extérieure branchée** : Claude Code hors de l'application, l'extension Claude de VS Code, Codex.

Dans la liste de l'IA, chaque outil s'appelle `mcp__malorean_notes__<outil>` (par exemple `mcp__malorean_notes__search_notes`). Le serveur compte **73 outils**, listés plus bas.

## Brancher une IA extérieure

Tout se fait dans les Réglages, onglet **« Brancher une IA »**.

- **Créer la clé** : sans clé, l'onglet montre un seul bouton, « Créer une clé de branchement ». Tant qu'il n'y a pas de clé, l'application n'ouvre aucune prise pour les IA extérieures.
- **Copier le bloc de configuration** : une fois la clé créée, l'onglet affiche la clé et deux blocs prêts à coller, chacun avec son bouton « Copier ». Chaque bloc contient la commande de branchement (le programme de l'application lancé avec `--brancher`) et la clé : rien d'autre à taper.
  - Pour **Claude** (Claude Code et son extension VS Code) : coller le bloc tel quel dans le fichier `.mcp.json`, à la racine du dossier ouvert dans l'éditeur ; si le fichier existe déjà, ajouter l'entrée du bloc dans `mcpServers`.

    ```json
    {
      "mcpServers": {
        "malorean_notes": {
          "command": "/Applications/MALOREAN Notes.app/Contents/MacOS/malorean-notes",
          "args": ["--brancher", "<clé de branchement>"]
        }
      }
    }
    ```

  - Pour **Codex** : coller le bloc tel quel à la fin du fichier `~/.codex/config.toml`.

    ```toml
    [mcp_servers.malorean_notes]
    command = "/Applications/MALOREAN Notes.app/Contents/MacOS/malorean-notes"
    args = ["--brancher", "<clé de branchement>"]
    ```

  Le chemin du programme est celui de l'application installée : le bloc de l'onglet le donne déjà. Un ancien bloc nommé `malorean` doit être recollé (le serveur a été renommé `malorean_notes`).
- **Ne pas commiter `.mcp.json`** : il contient la clé de branchement.
- **Cocher les espaces de travail** : sous l'introduction de l'onglet, la liste « Espaces de travail ouverts aux IA » montre une case par espace de travail. **Aucune n'est cochée au départ** : une IA branchée ne voit alors aucun espace. Cocher un espace le rend visible et utilisable ; le décocher le retire tout de suite. L'état se garde d'un lancement à l'autre ; créer ou révoquer la clé ne le change pas. Les réglages de l'application ne sont jamais ouverts à une IA.
- **Révoquer** : « Révoquer la clé », après confirmation, efface la clé, coupe tout de suite les IA branchées et referme la prise. Une nouvelle clé n'a rien à voir avec l'ancienne : les blocs sont à recoller.
- **L'application doit être lancée** : une IA extérieure n'est écoutée que tant que MALOREAN Notes est ouverte. Fermée, la commande de branchement répond à chaque demande : « MALOREAN Notes n'est pas lancée : ouvrez l'application, puis réessayez (et vérifiez que la clé de branchement existe dans ses réglages) » (code d'erreur JSON-RPC `-32002`).
- **Aucun port réseau** : la commande de branchement joint l'application par une prise locale du Mac, dans un dossier réservé au compte de l'utilisateur.
- **Clé refusée** : une demande sans la bonne clé reçoit l'erreur `-32001` : « clé refusée : cette clé de branchement n'existe pas ou a été révoquée ». Dans la colonne Claude Code, la clé est celle du tour, refusée une fois le tour fini.

## Le protocole

Une demande JSON-RPC par ligne, une réponse par ligne. Le serveur comprend `initialize` (sa présentation, avec la consigne générale sur les outils), `ping`, `tools/list` (les 73 outils, leur description et le schéma de leur entrée) et `tools/call`. Une autre méthode reçoit l'erreur `-32601` « méthode inconnue ».

Un appel d'outil :

```json
{"jsonrpc": "2.0", "id": 3, "method": "tools/call",
 "params": {"name": "search_notes", "arguments": {"query": "budget"}}}
```

La réponse porte un seul texte. Si l'outil a réussi, c'est son résultat en JSON (sauf `read_version`, qui rend le texte brut de la version) et `isError` vaut `false`. S'il a échoué, c'est la phrase d'erreur en français et `isError` vaut `true`. Un nom d'outil inconnu donne « outil inconnu de MALOREAN Notes ».

Dans les pages de ce dossier, les exemples donnent la partie `params` d'un appel : le nom de l'outil et ses arguments.

## Règles communes

- **Le paramètre `workspace`** : chaque outil, sauf `list_workspaces`, accepte un paramètre facultatif `workspace`, le nom d'un espace de travail tel que `list_workspaces` le donne.
  - Sans lui, une IA branchée vise l'espace ouvert chez l'utilisateur, s'il est coché. S'il n'y en a pas : « aucun espace de travail n'est ouvert chez l'utilisateur : nommez-en un avec le paramètre « workspace » (voir `list_workspaces`) ».
  - Sans lui, la colonne Claude Code vise l'espace de travail de son tour, coché ou non. Si l'utilisateur en a ouvert un autre entre-temps : « l'espace de travail « … » de ce tour n'est plus ouvert : rien n'a été fait ».
  - Un nom inconnu ou non coché est refusé, avec la liste des noms permis : « aucun espace de travail autorisé ne s'appelle « … » ; ceux que les IA peuvent utiliser : … ».
  - Un autre espace que celui ouvert s'ouvre en arrière-plan le temps de l'appel : l'écran et l'espace de l'utilisateur ne changent pas. L'autorisation est relue à chaque appel : un espace décoché ou disparu entre deux appels refuse l'appel suivant, sans rien écrire.
  - `viewed_note` et `show_note`, qui parlent de l'écran, ne visent que l'espace ouvert ; sur un autre : « « viewed_note » parle de l'écran de l'utilisateur : il ne vise que l'espace de travail ouvert chez lui ».
- **Les chemins** : une note, un canvas, un CRM ou un dossier se désigne par son chemin depuis la racine de l'espace de travail, séparé par `/` : `Travail/Projets/budget.md`, `Travail/Projets`. Jamais un chemin du disque ; un chemin qui sort de l'espace est refusé. La racine est le chemin vide.
- **Un champ texte vide est un champ absent** : un texte exigé vide ou fait d'espaces est refusé par « il manque « champ » ». Quelques champs acceptent le vide exprès, et leur page le dit : `new_text` de `replace_in_note`, les chemins des outils de dossier (la racine), les champs « vide pour retirer » des outils du CRM et du canvas.
- **Le garde-fou du web** : dans la colonne Claude Code, quand le réglage « Après avoir lu une page web, Claude doit-il demander avant de modifier mes notes ? » vaut « Oui, il demande mon accord », chaque outil qui crée, change, déplace ou jette quelque chose est retenu après une lecture du web dans le même tour ; l'utilisateur l'autorise d'un clic. Les outils qui ne font que lire ou montrer ne sont jamais retenus. Chaque page dit, outil par outil, s'il est retenu. Le garde-fou est un crochet du tour de la colonne : il ne s'applique pas à une IA extérieure branchée.
- **La corbeille, jamais l'effacement** : jeter une note, un dossier ou une fiche de CRM les met dans la corbeille de l'application, à leur chemin d'origine ; l'utilisateur les restaure. Aucun outil n'efface un fichier.
- **L'historique des versions** : un changement fait par un outil garde le texte d'avant comme version ; `list_versions` et `restore_version` l'annulent.
- **Le cahier de recherche est en ajout seul** : on y écrit uniquement avec `add_entry`, une entrée à la fin ; `read_note` et `replace_in_note` le refusent.
- **Un outil par sorte de contenu** : une note simple se lit avec `read_note` et se change avec `replace_in_note` ; une carte mentale, un canvas, un CRM et un agenda 12 ont leurs propres outils, et les outils des notes simples les refusent en nommant les bons (les événements d'un agenda 12 sont des notes simples pour eux).
- **Les messages d'erreur sont en français** et disent quoi faire ; ce sont ceux de l'interface quand le geste existe à l'écran. Un appel refusé ne change rien.

## Liste des outils

### Espaces de travail et écran ([page](espaces-de-travail-et-ecran.md))

- [`list_workspaces`](espaces-de-travail-et-ecran.md#list_workspaces) : les espaces de travail cochés pour les IA, avec celui qui est ouvert.
- [`viewed_note`](espaces-de-travail-et-ecran.md#viewed_note) : la note de la colonne active et le texte sélectionné.
- [`show_note`](espaces-de-travail-et-ecran.md#show_note) : ouvre une note dans la colonne active.

### Recherche ([page](recherche.md))

- [`search_notes`](recherche.md#search_notes) : cherche avec l'index, par mots, étiquette, dossier et type de contenu.
- [`search_by_meaning`](recherche.md#search_by_meaning) : cherche par le sens d'une question en une phrase.
- [`linking_notes`](recherche.md#linking_notes) : les liens entrants d'une note.

### Notes ([page](notes.md))

- [`read_note`](notes.md#read_note) : le texte entier d'une note simple, en-tête à part du corps.
- [`create_note`](notes.md#create_note) : crée une note, nom du fichier tiré du titre.
- [`replace_in_note`](notes.md#replace_in_note) : remplace un texte exact par un autre dans une note simple.
- [`rename_note`](notes.md#rename_note) : change le titre d'une note, et donc son nom de fichier.
- [`move_note`](notes.md#move_note) : range une note dans un autre dossier.
- [`trash_note`](notes.md#trash_note) : met une note à la corbeille.

### Dossiers ([page](dossiers.md))

- [`list_folders`](dossiers.md#list_folders) : l'arbre des dossiers de l'espace de travail.
- [`create_folder`](dossiers.md#create_folder) : crée un dossier, avec ceux qui manquent sur son chemin.
- [`rename_folder`](dossiers.md#rename_folder) : renomme un dossier, qui garde son contenu.
- [`move_folder`](dossiers.md#move_folder) : déplace un dossier dans un autre, avec son contenu.
- [`trash_folder`](dossiers.md#trash_folder) : met un dossier et son contenu à la corbeille.

### Étiquettes et épingles ([page](etiquettes-et-epingles.md))

- [`list_tags`](etiquettes-et-epingles.md#list_tags) : les étiquettes de l'espace, avec leur nombre de notes.
- [`add_tags`](etiquettes-et-epingles.md#add_tags) : ajoute des étiquettes à une note, un canvas ou une fiche de CRM.
- [`remove_tags`](etiquettes-et-epingles.md#remove_tags) : retire des étiquettes.
- [`pin_note`](etiquettes-et-epingles.md#pin_note) : épingle une note.
- [`unpin_note`](etiquettes-et-epingles.md#unpin_note) : désépingle une note.

### Favoris ([page](favoris.md))

- [`add_favorite`](favoris.md#add_favorite) : met un contenu en favori (une ligne de lien à la fin de la note des favoris).
- [`remove_favorite`](favoris.md#remove_favorite) : retire un contenu des favoris.
- [`list_favorites`](favoris.md#list_favorites) : la note des favoris et les contenus en favori, dans l'ordre de la note.

### Historique des versions ([page](historique.md))

- [`list_versions`](historique.md#list_versions) : les versions gardées d'une note.
- [`read_version`](historique.md#read_version) : le texte d'une version.
- [`restore_version`](historique.md#restore_version) : remet dans une note le texte d'une de ses versions.

### Modèles de note ([page](modeles.md))

- [`list_templates`](modeles.md#list_templates) : les noms des modèles de note.
- [`create_note_from_template`](modeles.md#create_note_from_template) : crée une note depuis un modèle.

### Pièces jointes ([page](pieces-jointes.md))

- [`add_attachment`](pieces-jointes.md#add_attachment) : joint à une note une image ou un PDF de l'espace de travail.

### Cahier de recherche ([page](cahier-de-recherche.md))

- [`create_research_notebook`](cahier-de-recherche.md#create_research_notebook) : crée un cahier de recherche, sans entrée.
- [`add_entry`](cahier-de-recherche.md#add_entry) : ajoute une entrée à la fin d'un cahier.

### Carte mentale ([page](carte-mentale.md))

- [`create_mind_map`](carte-mentale.md#create_mind_map) : crée une carte mentale, avec une liste de départ facultative.
- [`read_mind_map`](carte-mentale.md#read_mind_map) : lit une carte mentale en arbre.
- [`add_mind_map_child`](carte-mentale.md#add_mind_map_child) : ajoute un dernier enfant à un nœud.
- [`add_mind_map_sibling`](carte-mentale.md#add_mind_map_sibling) : ajoute un frère juste en dessous d'un nœud.
- [`add_mind_map_root`](carte-mentale.md#add_mind_map_root) : ajoute un nœud racine à la fin.
- [`edit_mind_map_node`](carte-mentale.md#edit_mind_map_node) : change le titre et/ou le détail d'un nœud.
- [`color_mind_map_node`](carte-mentale.md#color_mind_map_node) : change la couleur d'un nœud.
- [`move_mind_map_node`](carte-mentale.md#move_mind_map_node) : déplace un nœud avec sa branche.
- [`delete_mind_map_node`](carte-mentale.md#delete_mind_map_node) : supprime un nœud avec sa branche.

### Canvas ([page](canvas.md))

- [`create_canvas`](canvas.md#create_canvas) : crée un canvas vide.
- [`read_canvas`](canvas.md#read_canvas) : lit un canvas comme des données.
- [`add_canvas_card`](canvas.md#add_canvas_card) : ajoute une carte texte, de fichier ou de page web.
- [`change_canvas_card`](canvas.md#change_canvas_card) : change le texte, l'adresse, le fichier ou la couleur d'une carte.
- [`move_canvas_card`](canvas.md#move_canvas_card) : déplace une carte (les cartes d'un groupe suivent).
- [`resize_canvas_card`](canvas.md#resize_canvas_card) : redimensionne une carte.
- [`remove_canvas_card`](canvas.md#remove_canvas_card) : retire une carte et les flèches qui y touchent.
- [`add_canvas_arrow`](canvas.md#add_canvas_arrow) : ajoute une flèche entre deux cartes.
- [`change_canvas_arrow`](canvas.md#change_canvas_arrow) : change le sens, l'étiquette, la couleur ou les extrémités d'une flèche.
- [`remove_canvas_arrow`](canvas.md#remove_canvas_arrow) : retire une flèche.
- [`add_canvas_group`](canvas.md#add_canvas_group) : ajoute un groupe, vide ou autour de cartes.
- [`change_canvas_group`](canvas.md#change_canvas_group) : change le nom ou la couleur d'un groupe.

### CRM ([page](crm.md))

- [`create_crm`](crm.md#create_crm) : crée un CRM.
- [`read_crm`](crm.md#read_crm) : lit un CRM comme des données, avec les filtres de l'écran.
- [`create_crm_action`](crm.md#create_crm_action) : crée une action.
- [`change_crm_action`](crm.md#change_crm_action) : change une action par un geste de sa fenêtre.
- [`move_crm_action`](crm.md#move_crm_action) : met une action dans une colonne du Kanban.
- [`delete_crm_action`](crm.md#delete_crm_action) : met une action à la corbeille.
- [`create_crm_person`](crm.md#create_crm_person) : crée une personne.
- [`change_crm_person`](crm.md#change_crm_person) : change une personne.
- [`delete_crm_person`](crm.md#delete_crm_person) : met une personne à la corbeille.
- [`create_crm_company`](crm.md#create_crm_company) : crée une entreprise.
- [`change_crm_company`](crm.md#change_crm_company) : change une entreprise.
- [`delete_crm_company`](crm.md#delete_crm_company) : met une entreprise à la corbeille.
- [`create_crm_project`](crm.md#create_crm_project) : crée un projet.
- [`change_crm_project`](crm.md#change_crm_project) : change un projet.
- [`delete_crm_project`](crm.md#delete_crm_project) : met un projet à la corbeille.
- [`change_crm_stages`](crm.md#change_crm_stages) : change les étapes (colonnes du Kanban entre `TODO` et `Done`).

### Agenda 12 ([page](agenda-12.md))

- [`read_agenda_12`](agenda-12.md#read_agenda_12) : lit un agenda 12 comme des données, case par case, dans l'ordre de la grille.
- [`add_agenda_12_event`](agenda-12.md#add_agenda_12_event) : ajoute un événement à un agenda 12.
- [`close_agenda_12_event`](agenda-12.md#close_agenda_12_event) : clôt un événement, avec ou sans copie pour le suivant.

## Références

- [`doc/specs/brancher-une-ia.md`](../specs/brancher-une-ia.md) : la spécification de l'onglet « Brancher une IA » et du comportement des outils.
- [`doc/format/`](../format/) : les formats de fichier que les outils lisent et écrivent.
- [0032](../decisions/0032-colonne-claude-code.md) : la colonne Claude Code et le garde-fou du web.
- [0040](../decisions/0040-outils-de-l-application-pour-claude.md) : les outils de l'application, un serveur MCP local sans port réseau.
- [0056](../decisions/0056-brancher-une-ia.md) : brancher une IA extérieure.
- [0074](../decisions/0074-espaces-de-travail-pour-les-ia.md) : les espaces de travail pour les IA et le paramètre `workspace`.
- [0082](../decisions/0082-nom-du-serveur-mcp.md) : le nom du serveur, `malorean_notes`.
