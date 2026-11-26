# 0078 — Les dossiers par le MCP : lister l'arbre, renommer, déplacer et jeter un dossier, avec les cas d'usage et les messages de l'interface

- **Date** : 2026-11-26
- **Statut** : acceptée (spécification : `doc/specs/brancher-une-ia.md`)
- **Complète** la fiche 0040 (outils de l'application : `create_folder` existait, mais l'IA ne pouvait ni voir l'arbre des dossiers ni en changer un), la fiche 0074 (le paramètre `workspace` s'applique aux nouveaux outils comme aux autres) et la fiche 0075 (même garde-fou du web que `replace_in_note`).

## Contexte

Une IA branchée (Codex, extension Claude de VS Code, Claude Code hors de l'application) et la colonne Claude Code créaient des dossiers (`create_folder`), mais ne pouvaient ni lister la hiérarchie d'un espace de travail, ni renommer, déplacer ou jeter un dossier : tout ce que fait l'interface doit se faire par le MCP (todo.md, section « MCP », tâche 4).

## Décision

- **Quatre outils neufs** (`AppTool::ListFolders`, `RenameFolder`, `MoveFolder`, `TrashFolder`), pour les IA branchées et la colonne Claude Code (même registre, un seul endroit de vérité) ; `create_folder` reste tel quel (il crée aussi les dossiers qui manquent sur le chemin ; un dossier qui existe est laissé). Chacun accepte le paramètre facultatif `workspace` de la fiche 0074.
  - **`list_folders`** : rend `folders`, les chemins de tous les dossiers de l'espace visé depuis sa racine (`Animaux/Chiens`), dans l'ordre de l'arbre de l'interface ; la racine n'y est pas. Ne change rien.
  - **`rename_folder`** (`path`, `name`) : renomme le dossier, qui reste à sa place avec tout son contenu ; rend `path`, son nouveau chemin.
  - **`move_folder`** (`path`, `folder`) : déplace le dossier dans `folder` (`` pour la racine), avec tout son contenu ; rend `path`. Le déplacement d'un dossier existe dans l'interface (glisser un dossier sur un autre) : il est donc couvert. Le paramètre s'appelle `folder`, comme celui de `move_note`.
  - **`trash_folder`** (`path`) : met le dossier, avec tout ce qu'il contient, dans la corbeille de l'application, à son chemin d'origine (`Nom 2`, `Nom 3`… s'il y est déjà) ; **jamais effacé** : l'utilisateur le restaure depuis la corbeille. Rend `trashed`, son chemin dans la corbeille, comme `trash_note`.
- **Les mêmes cas d'usage que l'interface, pas une copie** : les outils appellent `Session::list_folders`, `rename_folder`, `move_folder` et `trash_folder`, que les commandes de l'interface appellent (`ListFolders`, `RenameFolder`, `MoveFolder`, `Trash::put_folder`). Les règles et les messages en français sont donc identiques : nom refusé (`nom de dossier invalide : « .cache »` : vide, caché, terminé par `.assets`, `node_modules`, contenant `/`, `\` ou un caractère nul), `l'espace de travail lui-même ne peut être ni renommé ni déplacé`, `l'espace de travail lui-même ne peut pas aller dans la corbeille`, `un dossier « x » existe déjà`, `le dossier « x » n'existe pas`, `le dossier « x » ne peut pas aller dans lui-même ni dans l'un de ses sous-dossiers`. Un nom vide donné à `rename_folder` reçoit le message de l'interface (il n'est pas traité comme un champ manquant).
- **Liens et pièces jointes, comme dans l'interface** : renommer ou déplacer un dossier déplace le dossier entier sur le disque, par le même stockage que l'interface : les notes, leurs dossiers de pièces jointes (dont les liens sont relatifs, donc toujours valables), l'historique des versions et l'index de recherche suivent. **Les liens `[[Dossier/titre]]` ne sont pas réécrits** : l'interface ne le fait pas non plus, et dans ce lien le dossier n'est qu'une précision pour départager des titres identiques (spécification des liens, fiche 0016). Les outils ne font donc rien de plus que l'interface.
- **Ce que voit l'IA** : des chemins relatifs à l'espace de travail, jamais un chemin de l'ordinateur ; les dossiers ignorés par l'interface (cachés, `….assets`, `node_modules`, la corbeille) ne sont pas listés, et ne se désignent pas (leurs noms sont refusés).
- **Le garde-fou du web** retient `rename_folder`, `move_folder` et `trash_folder` comme les outils qui changent une note (`changes_notes`), après une lecture du web ; `list_folders` ne change rien et passe. La colonne Claude Code les nomme « Dossiers » (liste), « Renommage d'un dossier », « Déplacement d'un dossier » et « Dossier à la corbeille » (`create_folder` reste « Nouveau dossier »).
- **L'écran** : aucun mécanisme neuf. Le dossier déplacé, renommé ou jeté change sur le disque ; la surveillance du dossier prévient l'interface (`workspace-changed`), qui relit la liste des dossiers et des notes, comme pour toute modification extérieure. Un espace visé en arrière-plan n'est pas à l'écran : rien à rafraîchir.
- **Descriptions** : écrites en français pour l'IA, comme celles des autres outils ; la présentation du serveur mentionne `list_folders` et les outils de dossier.

## Conséquences

- Une IA branchée peut voir l'arborescence d'un espace coché, la réorganiser (créer, renommer, déplacer) et jeter un dossier vers la corbeille sans connaître son dossier sur l'ordinateur.
- Une IA qui renomme un dossier doit savoir que des liens `[[Dossier/titre]]` peuvent garder l'ancien nom de dossier ; le lien reste valable tant que le titre est unique. Réécrire ces liens serait un changement de l'interface aussi : à décider à part.
- Le serveur MCP garde son nom (`malorean`).
- Tests : la règle sur les cas d'usage existants (inchangée) ; chaque outil par le protocole MCP sur des faux (liste dans l'ordre de l'arbre, dossiers cachés absents, renommage avec notes et pièces jointes, déplacement, corbeille, noms refusés, racine, dossier absent, nom pris, dossier dans lui-même) ; un autre espace visé par `workspace` et un espace non autorisé ; le catalogue (champs exigés, descriptions) ; la liste des outils qui changent une note ; les options de Claude Code (`--allowed-tools`, garde-fou) ; les libellés de la colonne ; essai de l'application réelle.
