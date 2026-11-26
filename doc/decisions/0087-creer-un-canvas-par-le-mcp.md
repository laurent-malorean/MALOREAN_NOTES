# 0087 — Créer un canvas et un cahier de recherche par le MCP : les outils `create_canvas` et `create_research_notebook`

- **Date** : 2026-11-26
- **Statut** : acceptée (spécification : `doc/specs/brancher-une-ia.md`)
- **Complète** la fiche 0041 (le cahier de recherche : `add_entry` écrit dans un cahier qui existe), la fiche 0079 (le canvas par le MCP : lire et changer un canvas qui existe), la fiche 0052 (le canvas, « Nouveau canvas ») et la fiche 0081 (`create_crm`, dont `create_canvas` suit le modèle).

## Contexte

Une IA branchée a constaté qu'aucun outil ne crée un canvas, ni un cahier de recherche (`add_entry` n'écrit que dans un cahier qui existe, alors que l'écran a « Nouveau cahier de recherche ») : `add_canvas_card`, `add_canvas_arrow` et `add_canvas_group` n'agissent que sur un fichier `.canvas` qui existe déjà, alors que l'interface sait en créer un (« Nouveau canvas »). L'IA ne pouvait donc pas produire un canvas ni un cahier de bout en bout.

## Décision

- **Un outil `create_canvas`** (`title` ; `folder` facultatif), même schéma et mêmes règles que `create_crm` : le nom du fichier est tiré du titre (`FileName::canvas_from_title`) sans écraser un canvas existant (`plan-2.canvas`), dans `folder` (la racine par défaut), **créé avec ses parents** s'il manque ; un titre vide est refusé (« il manque « title » ») comme le champ vide de l'interface ; un dossier invalide est refusé sans rien écrire, pas même le dossier. Il rend `path`.
- **Le même cas d'usage que l'interface** : `CreateCanvas`, par la commande de session `create_canvas` que l'interface appelle ; un canvas neuf est vide (`{}` mis en forme comme l'interface l'écrit). L'IA y ajoute ensuite des cartes, des flèches et des groupes avec les outils de la fiche 0079.
- **Un outil qui change des notes** : le garde-fou du web le retient, il accepte le paramètre `workspace`, la colonne Claude Code le nomme « Création d'un canvas ». Il vient dans la liste juste avant `add_canvas_card`.
- **Un outil `create_research_notebook`** (`title` ; `folder` facultatif), mêmes règles que `create_canvas` : le cas d'usage de l'écran `CreateResearchNotebook` (en-tête `type: cahier-de-recherche`, titre `# title` ramené sur une ligne, aucune entrée), nom du fichier tiré du titre sans écraser une note, dossier créé avec ses parents, titre vide refusé (l'écran, lui, propose « Cahier de recherche » par défaut : une IA doit donner un titre), dossier invalide refusé sans rien écrire ; rend `path`. Il retient le garde-fou du web, accepte `workspace`, la colonne Claude Code le nomme « Création d'un cahier de recherche » ; il vient juste avant `add_entry`. Le cahier neuf se remplit avec `add_entry`, seule façon d'y écrire.
- **Les textes qui disaient que le canvas ne se crée pas** nomment `create_canvas` : la présentation du serveur, les descriptions de `create_note`, `read_note`, `replace_in_note` et `add_entry` ; la présentation du serveur dit comment créer un cahier.

## Conséquences

- Une IA branchée crée un canvas puis le remplit, sans toucher au JSON du fichier.
- La liste des outils passe de 65 à 67.
- Le MCP sait créer : une note (`create_note`, `create_note_from_template`), un dossier (`create_folder`), une carte mentale (`create_mind_map`), un canvas (`create_canvas`), un cahier de recherche (`create_research_notebook`) et un CRM (`create_crm`, puis ses fiches : actions, personnes, entreprises, projets).
- Tests : le domaine (nom, ordre, cible, garde-fou) ; chaque outil par le protocole MCP sur des faux (nom tiré du titre, doublon, dossier créé, refus sans écriture, autre espace par `workspace`) ; un canvas neuf rempli d'une carte, d'une flèche et d'un groupe puis relu par `read_canvas` ; un cahier neuf rempli par `add_entry` puis relu ; le catalogue, la présentation du serveur et le libellé de la colonne.
