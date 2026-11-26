# 0091 — Un CRM part, revient et se déplace avec ses fiches

- **Date** : 2026-11-26
- **Statut** : acceptée (spécification : `doc/specs/crm.md` § 4.1, § 11 et § 13)
- **Complète** les fiches 0057 (CRM), 0081 (CRM par le MCP), 0089 (dossiers de fiches cachés) et 0090 (renommer un contenu).

## Contexte

Un CRM est une note (`generated_mcp/crm1.md`) ; ses fiches sont dans le dossier voisin qui porte son nom (`generated_mcp/crm1/actions/…`). Aucun cas d'usage ne le savait pour la corbeille ni pour le déplacement. Constat de l'utilisateur : « j'ai supprimé crm1 via l'app, il reste le répertoire crm1 dans le file system ». Le fichier du CRM était à la corbeille, ses deux actions étaient restées : fiches orphelines (encore indexées, trouvées par la recherche, sans CRM pour les afficher), et, comme la règle de la fiche 0089 ne cache un dossier que s'il porte le nom d'un CRM qui existe, `crm1` réapparaissait dans la liste des dossiers. Déplacer un CRM laissait de même ses fiches derrière.

## Décision

- **Un seul module pour les quatre gestes** : `application::use_cases::crm_fiches` (règle pure dans `domain::crm::CrmFiches`). Renommer, déplacer, mettre à la corbeille et restaurer un CRM l'appellent ; `RenameNote` (fiche 0090) a été reprise dessus, il n'y a pas de deuxième version.
- **Les fiches d'un CRM** : les notes entreprise, personne, action et projet rangées dans le dossier de leur sorte sous son dossier des fiches (`CrmKind::container_of`). Le dossier d'un autre CRM rangé dedans garde ses fiches.
- **Dossier entier ou fiches seules** : si le dossier des fiches ne contient que des fiches du CRM, il part tout entier (`move_folder`, `trash_folder` : sous-dossiers vides et pièces jointes comprises, l'historique et l'index suivent par les ports existants). Sinon seules les fiches partent, une par une, avec leurs pièces jointes ; la note ordinaire reste, le dossier avec elle. Un CRM sans fiches ni dossier part comme une note.
- **Le dossier prend le nom du CRM à l'arrivée** : à la corbeille et au déplacement, le choix du nom du CRM écarte aussi le nom d'un dossier déjà là (`crm1.md` est pris si `crm1/` existe), et le dossier des fiches prend le même suffixe (`crm1-2`). Ainsi la corbeille ne mélange jamais les fiches de deux CRM de même nom, et restaurer le second retrouve les siennes. À la restauration, le CRM prend le suffixe que le disque impose et ses fiches vont dans le dossier de ce nom (leurs noms pris reçoivent un suffixe comme toute note restaurée) ; si le dossier existe déjà (fiches orphelines d'avant cette règle), elles s'y rangent.
- **Ordre** : les fiches partent avant le fichier du CRM (une erreur laisse le CRM entier, jamais des fiches orphelines) ; le renommage défait le déplacement des fiches si l'enregistrement du CRM échoue.
- **Garde** : un CRM ne va pas dans son propre dossier de fiches (`FolderInsideItself`).
- **Les IA** : `trash_note` et `move_note` passent par `Session::trash_note` et `Session::move_note`, donc par les mêmes cas d'usage que l'interface ; leurs descriptions le disent. `trash_folder` d'un dossier qui contient un CRM emporte déjà ses fiches (elles sont dans le dossier).
- **Interface** : la confirmation commune dit « Placer « CRM1 » et ses 2 fiches dans la corbeille ? » (commande `crm_fiches_in_trash`, qui rend 0 pour une note ordinaire) ; pas de nouvelle fenêtre. Les onglets des fiches se ferment avec le CRM, et suivent son nouveau chemin quand on le déplace (comme au renommage). La corbeille garde sa présentation : le CRM est une ligne de note, ses fiches sont listées sous leurs dossiers ; « Restaurer » sur le CRM remet tout.
- **Fiches déjà orphelines** : jamais supprimées automatiquement. Leur dossier n'a plus de CRM, donc il est montré dans la liste des dossiers : on le met à la corbeille, ou on le garde. Restaurer le CRM depuis la corbeille les rejoint.

## Limites assumées

- Les onglets ouverts sur une note ordinaire rangée dans le dossier des fiches suivent le déplacement du CRM comme si elle l'avait suivi (l'interface ne sait pas laquelle est une fiche) ; la note, elle, reste en place.
- Restaurer une fiche seule dans la corbeille ne remet pas son CRM.

## Tests

- Domaine : fiches de chaque sorte, note ordinaire, fiche hors de son dossier de sorte, CRM imbriqué, dossier vide, noms des dossiers voisins.
- Application : mise à la corbeille, restauration et déplacement d'un CRM avec fiches de chaque sorte, sans fiches, avec note ordinaire, deux CRM voisins, CRM imbriqué, dossier vide ou sous-dossier vide, même nom deux fois, nom pris à l'arrivée, dossier de même nom à l'arrivée, déplacement dans son propre dossier, corbeille entière restaurée, compte annoncé ; renommage avec note ordinaire.
- Disque réel (`crates/infrastructure/tests/fs_crm_fiches.rs`) : dossier, pièces jointes d'une action, dossier mixte.
- API et MCP : outils `trash_note` et `move_note` sur un CRM, index (recherche), liste des dossiers, Kanban après restauration, fiches orphelines visibles.
- Interface : confirmation avec le nombre de fiches, onglets des fiches fermés ou déplacés, pont ; scénario d'essai de l'application réelle (`ui/src/essai/scenarios/crm.ts`).
