# 0076 — Lire le texte d'une note par le MCP : l'outil `read_note`, en-tête et corps séparés, refusé hors des notes simples

- **Date** : 2026-11-26
- **Statut** : acceptée (spécification : `doc/specs/brancher-une-ia.md`)
- **Complète** la fiche 0075 (`replace_in_note` renvoie vers `read_note` pour recopier un texte exact) et la fiche 0074 (le paramètre `workspace` s'applique au nouvel outil comme aux autres).

## Contexte

Aucun outil ne rend le texte entier d'une note : il y a les extraits de la recherche, `read_version` (le texte d'une version gardée, pas celui de la note) et rien d'autre. Une IA branchée hors du dossier de l'espace de travail (Codex, extension Claude de VS Code, fiche 0074) ne peut donc pas recopier à l'identique le texte à remplacer qu'attend `replace_in_note` (fiche 0075).

## Décision

- **Un outil, `read_note`** (`AppTool::ReadNote`), pour les IA branchées et pour la colonne Claude Code (même registre d'outils, un seul endroit de vérité). Entrées : `path` (la note) et le paramètre facultatif `workspace` de la fiche 0074. Il ne change rien : le garde-fou du web ne le retient pas, la colonne le nomme « Lecture ».
- **Ce qu'il rend** : `path`, `title`, `header`, `body`, `characters` (le nombre de caractères du corps entier) et `truncated`.
  - `header` est l'en-tête tel qu'il est écrit dans le fichier, ses deux lignes `---` comprises, fin de ligne comprise ; vide si la note n'en a pas. `body` est tout le reste. **`header` suivi de `body` redonne le fichier à l'identique** : l'IA y recopie le `old_text` de `replace_in_note` sans rien deviner (qui cherche dans tout le fichier, en-tête compris, fiche 0075).
  - `title` est le titre affiché de la note, comme ailleurs.
- **Seules les notes simples** (type de contenu `note`), comme `replace_in_note`. Refusés, avec une phrase en français qui dit quoi faire : le **cahier de recherche** (« on n'y ajoute que des entrées avec add_entry ; ses entrées se retrouvent avec search_notes ou search_by_meaning ») ; la **carte mentale**, le **canvas**, le **CRM** et ses **fiches** (« read_note ne lit que les notes simples ; ce type n'a pas encore d'outil de lecture »), qui auront leurs outils à la tâche 5 de la liste « MCP ». Une note introuvable, un chemin hors de l'espace (`..`, absolu) et un fichier qui n'est pas du texte sont refusés comme par les autres outils. Il n'existe pas d'outil qui lise un cahier : c'est voulu ici (fiche 0075 : on n'y ajoute que des entrées) et se rediscutera avec les outils de la tâche 5 si besoin.
- **Une taille limite, dite** : `MAX_READ_CHARACTERS` = 60 000 caractères de corps. Aucun autre outil de lecture n'a de limite de texte (`read_version` rend tout ; les recherches rendent 100 notes au plus) ; celle-ci est choisie pour que la réponse tienne sous la limite d'un résultat d'outil de Claude Code (25 000 jetons, soit environ 80 000 à 90 000 caractères de français une fois le JSON écrit), qui refuserait sinon toute la réponse. Une note plus longue est coupée à la fin de la dernière ligne entière avant la limite (ou à la limite s'il n'y a aucun retour à la ligne avant elle) ; la réponse dit alors `truncated: true`, le nombre de caractères du corps entier (`characters`) et, dans `message`, ce qui manque et que la suite n'est pas lisible par cet outil. L'en-tête n'est jamais coupé. Jamais de coupure silencieuse. Pas de lecture par morceaux dans cette version (rien d'inventé au-delà de la demande) : à ajouter seulement si une note plus longue pose un vrai problème.
- **Un cas d'usage, `ReadNoteText`** (application) lit la note par le stockage, décide du type avec la règle du domaine (`readable`), et ne rend rien d'autre ; l'outil de l'API le met en JSON. Aucun écran touché : rien n'est écrit, aucune version gardée.
- **Instructions et descriptions** : la présentation du serveur dit de lire le texte d'une note simple avec `read_note` ; la description de `replace_in_note` renvoie vers `read_note` pour recopier un texte exact. Les consignes des cartes mentales et des CRM gardent les outils de fichiers (tâches suivantes).

## Conséquences

- Une IA branchée peut lire une note puis la modifier sans connaître le dossier de l'espace de travail ; la lecture rend des chemins relatifs, jamais un chemin de l'ordinateur.
- Le serveur MCP garde son nom (`malorean`).
- Tests : la règle (note simple, type refusé par type, en-tête présent, absent, non fermé, fin de ligne sans retour, coupure à la ligne entière, coupure sans retour à la ligne, limite exacte, caractères multi-octets) ; le cas d'usage (note simple, cahier et canvas refusés, introuvable, illisible) ; l'outil par son protocole sur des faux, pour la colonne et pour une IA branchée avec `workspace` (espace ouvert en arrière-plan, espace non autorisé) ; sa description et son schéma ; le nom de l'action dans la colonne ; les options de Claude Code (`--allowed-tools`).
