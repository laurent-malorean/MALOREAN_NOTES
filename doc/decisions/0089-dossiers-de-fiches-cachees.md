# 0089 — Dossiers de fiches cachés : un CRM se voit comme son seul fichier

- **Date** : 2026-11-26
- **Statut** : acceptée (spécification : `doc/specs/crm.md` § 4.1)
- **Complète** les fiches 0057 (CRM), 0078 (dossiers par le MCP) et 0081 (CRM par le MCP).

## Contexte

Un CRM est une note (`toto/crm1.md`) ; ses fiches sont rangées dans des dossiers qui portent son nom de fichier (`toto/crm1/actions/…`, `personnes/`, `entreprises/`, `projets/`). La liste des dossiers les montrait : du bruit, car les fiches se gèrent depuis l'écran du CRM, pas à la main. L'utilisateur veut ne voir que le fichier du CRM.

## Décision

- **Règle prudente** : un dossier est un « dossier des fiches » quand il porte le nom du fichier d'un CRM (même dossier parent, nom sans `.md`) **et** que toutes les notes qu'il contient, sous-dossiers compris, sont des fiches (`crm-entreprise`, `crm-personne`, `crm-action`, `crm-projet`). Il n'est pas montré, ni ses sous-dossiers. Une note ordinaire, ou un autre CRM, rangée dedans le laisse montré : rien n'est caché qui contienne autre chose que des fiches. Un dossier vide qui porte le nom d'un CRM est caché aussi (il ne contient rien d'autre que des fiches).
- **Une seule fois, dans le domaine** : `domain::crm::without_fiche_folders(dossiers, notes)`. Le cas d'usage `ListShownFolders` (application) l'applique aux notes de l'index ; `Session::list_folders` s'en sert, donc l'écran, le choix d'un dossier de destination (déplacer une note ou un dossier, « Nouveau CRM »…) et l'outil MCP `list_folders` ont la même liste. L'interface ne décide de rien.
- **Rien ne bouge sur le disque** : aucun fichier n'est supprimé ni déplacé ; Finder, Obsidian et iCloud voient les dossiers. La recherche, les liens et l'index ne changent pas (les fiches restent des notes de l'index, avec leur CRM pour conteneur).
- **Le disque reste la référence pour créer** : `create_folder` (MCP) compare ce qu'il crée aux dossiers qui existent (`ListFolders`, `list_existing_folders`), pas à ceux qui sont montrés ; demander un dossier de fiches qui existe déjà ne donne donc pas « un dossier existe déjà ».
- **Dossier affiché devenu caché** : `foldersRefreshed` fait retomber le dossier affiché sur son plus proche dossier parent montré ; la liste des notes est relue (`refreshFolders`). Cela vaut aussi pour un dossier disparu hors de l'application.
- **Les notes des fiches** : elles sont dans des sous-dossiers, donc absentes de la liste des notes du dossier du CRM ; rien à changer.

## Limites assumées

- Un dossier qui porte le nom d'un CRM mais contient une note ordinaire reste montré, avec ses sous-dossiers de fiches : ce n'est pas un dossier des fiches.
- Les outils MCP qui visent un dossier par son chemin (`rename_folder`, `move_folder`, `trash_folder`) l'acceptent toujours : seule la liste le cache.

## Tests

- Domaine : fiche de chaque sorte, sous-dossiers, note ordinaire à un ou deux niveaux, autre CRM dedans, note du même nom qui n'est pas un CRM, CRM d'un autre dossier, dossier vide, CRM à la racine, deux CRM.
- Application : `ListShownFolders` cache les fiches et laisse `ListFolders` les donner ; dossier avec une note ordinaire montré.
- Protocole MCP : `list_folders` sans les dossiers de fiches ; dossier à note ordinaire listé ; `create_folder` d'un dossier de fiches existant sans erreur.
- Interface : le dossier affiché retombe sur son parent, la liste des notes est relue ; scénario d'essai de l'application réelle (`ui/src/essai/scenarios/crm.ts`).
