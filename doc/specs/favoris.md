# Favoris

Spécification fonctionnelle rédigée le 27/11, **validée par l'utilisateur le 27/11**. Ce document se lit seul.

## 1. Idée

Dans Notion, les favoris forment une liste qui s'allonge sans ordre. Ici, les favoris tiennent dans **une seule note**, la note des favoris : une note Markdown ordinaire que l'utilisateur range comme il veut (sections, ordre, commentaires). L'étoile d'un contenu ne fait qu'y ajouter, ou en retirer, un lien vers lui.

## 2. Vocabulaire

- **Favori** : un contenu (note, cahier de recherche, carte mentale, canvas, CRM entier) dont un lien figure dans la note des favoris, seul sur sa ligne (§ 5). Une fiche du CRM n'a pas d'étoile : seul le CRM entier se met en favori.
- **Favoris** : la note des favoris, et l'entrée de la liste des dossiers qui l'ouvre.
- **Étoile** : le bouton, dans le contenu lui-même, qui ajoute le contenu aux favoris ou l'en retire.

Ces mots entrent dans `doc/ontology.md` avant le code.

## 3. L'entrée « Favoris »

- Dans la liste des dossiers, juste au-dessus de « Corbeille », même composant (icône étoile, même hauteur, même survol).
- Un clic :
  - si l'espace de travail a une note des favoris : l'ouvre dans la colonne active, comme un clic sur une note de la liste ;
  - sinon : ouvre les réglages sur l'onglet « Favoris » (§ 6).

## 4. L'étoile

- Placée dans le contenu lui-même, en haut à droite de la zone du contenu (note, cahier de recherche, carte mentale, canvas, CRM).
- Deux états : creuse (pas en favori), pleine (en favori). Bulle d'aide : « Ajouter aux favoris » ou « Retirer des favoris ».
- Absente sur la note des favoris elle-même.
- Sans note des favoris choisie, un clic sur l'étoile ouvre les réglages sur l'onglet « Favoris » ; une fois la note choisie ou créée, le contenu est ajouté.
- **Ajout** (étoile creuse) : une ligne `- [[lien]]` est ajoutée à la fin de la note des favoris (le lien est celui que donne le menu des liens : `[[titre]]`, `[[Dossier/titre]]` en cas d'homonyme, `[[nom.canvas]]` pour un canvas). L'étoile devient pleine ; message « Ajouté aux favoris ».
- **Retrait** (étoile pleine) : immédiat, sans confirmation, comme Notion et Google Drive. Les lignes du § 5 qui désignent ce contenu sont retirées de la note des favoris. L'étoile devient creuse ; message « Retiré des favoris » avec un bouton « Annuler » qui remet les lignes à leur place.
- Si la note des favoris est ouverte, elle montre aussitôt le changement.

## 5. Quand un contenu est-il en favori

Un contenu est en favori quand la note des favoris contient une ligne faite uniquement d'un lien entre notes qui le désigne, avec ou sans marque de liste (`- `, `* `, `1. `) et espaces autour. Un lien écrit au milieu d'une phrase ne compte pas et n'est jamais retiré par l'étoile. Ainsi, l'utilisateur peut déplacer la ligne dans une section : l'étoile reste pleine.

## 6. Réglages, onglet « Favoris »

- Montre la note des favoris de l'espace de travail ouvert, ou « Aucune ».
- « Choisir une note » : la liste des notes de l'espace de travail, filtrée en tapant (même recherche que « Lier une note »).
- « Créer la note des favoris » : demande un nom (proposé : « Favoris ») et un dossier (proposé : la racine), crée la note, la choisit et l'ouvre.
- « Ne plus utiliser de note des favoris » : retire le choix ; la note n'est pas supprimée.

## 7. Vie de la note des favoris

- Chaque espace de travail a la sienne, gardée dans les préférences de l'application (comme le dossier des modèles), jamais dans le dossier de l'espace de travail.
- Renommée ou déplacée : le choix la suit.
- Mise à la corbeille ou disparue : plus de note des favoris ; l'entrée « Favoris » ouvre de nouveau les réglages.
- Un contenu favori renommé ou déplacé : son lien suit comme tout lien entre notes. Mis à la corbeille : sa ligne reste dans la note (lien sans cible), l'utilisateur la retire à la main.

## 8. Outils pour les IA (MCP)

- `add_favorite` : ajoute un contenu (désigné par son chemin) aux favoris, comme l'étoile ; erreur claire s'il n'y a pas de note des favoris.
- `remove_favorite` : le retire, comme l'étoile.
- `list_favorites` : la note des favoris (chemin) et les contenus en favori, dans l'ordre de la note.
- Ceux qui changent la note sont retenus par le garde-fou du web. Documentés dans `doc/mcp/`.

## 9. Hors périmètre

- Pas d'étoile sur une fiche du CRM, une entrée de cahier ou un nœud de carte mentale.
- Pas de favori dans le menu de la liste des notes ni dans la palette.
- Pas de liste des favoris dans la liste des dossiers : seule l'entrée qui ouvre la note.

## 10. Contrat du moteur

Ce que le moteur offre à l'interface (fiche 0102). Les commandes agissent sur l'espace de travail ouvert ; les arguments sont en camelCase ; une erreur est un objet `{ message }` dont le message est en français, prêt à afficher. Les types sont générés dans `ui/src/bridge/generated/` (`FavoritesNoteItem`, `RemovedLineItem`).

### Types

- `FavoritesNoteItem` : `{ path: string, title: string }` : la note des favoris (chemin depuis l'espace de travail, titre affiché).
- `RemovedLineItem` : `{ index: number, text: string }` : une ligne retirée de la note des favoris (rang depuis 0, en-tête non compté ; texte tel qu'écrit, fin de ligne comprise). L'interface garde la liste rendue par un retrait et la repasse telle quelle pour annuler ; elle ne la lit pas.

### Commandes

- `favorites_note()` → `FavoritesNoteItem | null` : la note des favoris, ou `null` s'il n'y en a pas (pas choisie, mise à la corbeille, disparue du disque). C'est l'état de l'entrée « Favoris » (§ 3) et de l'onglet « Favoris » (§ 6). Erreurs : aucun espace ouvert ; note illisible.
- `choose_favorites_note({ path })` → `FavoritesNoteItem` : choisit la note `path` (« Choisir une note »). Erreurs : chemin invalide ; « la note « … » n'existe pas » ; « Seule une note simple peut être la note des favoris. » (cahier, carte, canvas, CRM, fiche).
- `create_favorites_note({ title, folder })` → `FavoritesNoteItem` : crée la note titrée `title` (proposé : « Favoris ») dans `folder` (`""` pour la racine, qui est le dossier proposé), la choisit, la rend ; son fichier prend le nom du titre (suffixe `-2`… si ce nom est pris). L'interface l'ouvre ensuite avec le chemin rendu. Erreurs : « le titre est vide » ; dossier invalide ou absent.
- `stop_using_favorites_note()` → rien : « Ne plus utiliser de note des favoris » ; la note n'est pas supprimée.
- `is_favorite({ path })` → `boolean` : l'étoile est-elle pleine ? Faux sans note des favoris et pour la note des favoris elle-même (qui n'a pas d'étoile). À appeler à l'ouverture d'un contenu et après un changement de la note des favoris.
- `add_favorite({ path })` → rien : étoile creuse cliquée. Message à montrer : « Ajouté aux favoris ». Sans effet si le contenu l'est déjà. Sans note des favoris choisie, l'interface ne l'appelle pas : elle regarde `favorites_note` avant et ouvre les réglages sur l'onglet « Favoris » (§ 4), puis appelle `add_favorite` une fois la note choisie ou créée. Erreurs (à montrer telles quelles) : « Aucune note des favoris n'est choisie. » (si l'état a changé entre-temps) ; « Une fiche du CRM n'a pas d'étoile : seul le CRM entier se met en favori. » ; « La note des favoris ne se met pas elle-même en favori. » ; « la note « … » n'existe pas ».
- `remove_favorite({ path })` → `RemovedLineItem[]` : étoile pleine cliquée, sans confirmation. Message à montrer : « Retiré des favoris » avec « Annuler », qui appelle `restore_favorites` avec la liste rendue. La liste est vide si le contenu n'était pas en favori (rien n'a été écrit : pas de « Annuler »). Erreur : « Aucune note des favoris n'est choisie. ».
- `restore_favorites({ removed })` → rien : remet à leur place exacte les lignes d'un retrait (« Annuler »). Une liste vide ne fait rien. Erreur : « Aucune note des favoris n'est choisie. ».
- Choisir une note à lister : la commande existante `list_linkable` (celle de « Lier une note ») ; ne garder que `contentType === "note"`, seul type qui peut être la note des favoris.

### Événements

Aucun événement nouveau. Un changement de la note des favoris est un changement de fichier : l'événement existant `workspace-changed` (`WorkspaceChanged.notes`, environ 300 ms après l'écriture) porte son chemin, et l'écran qui la montre la relit comme pour tout changement venu d'ailleurs (§ 4, « montre aussitôt le changement »). Après un ajout ou un retrait, l'interface rafraîchit seule l'état de l'étoile (`is_favorite`) sans attendre l'événement.

### Règles que l'interface n'a pas à connaître

- Quelles lignes sont des favoris, le lien écrit, les doublons, le suivi de la note renommée ou déplacée (note seule ou avec son dossier) et son oubli à la corbeille : tout est dans le moteur. Un renommage fait par `rename_note` ou `move_note` met le choix à jour sans autre appel.
- Le choix est gardé par espace de travail dans les préférences de l'application ; changer d'espace change de note des favoris.
- Les outils pour les IA (§ 8) passent par les mêmes cas d'usage que ces commandes.
