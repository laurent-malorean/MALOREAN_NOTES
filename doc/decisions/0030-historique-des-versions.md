# 0030 — Historique des versions : des copies Markdown datées dans `.history/`, sans Git

- **Date** : 2026-11-18
- **Statut** : acceptée

## Contexte

Une note change sans cesse : la frappe, un assistant (Claude Code) qui la réécrit, une synchronisation. L'utilisateur veut retrouver un état précédent et y revenir, sans rien perdre. L'espace de travail reste un simple dossier de fichiers Markdown, lisible par d'autres outils et rangé, parfois, dans iCloud Drive.

Pistes regardées :

- **Git** : absent d'office sur le Mac, mauvais ménage avec iCloud Drive (dossier `.git` synchronisé fichier par fichier), mélange avec le Git que l'utilisateur a peut-être déjà dans le dossier, et ménage des vieilles versions difficile. Rejeté.
- **Une base de données hors de l'espace de travail** (comme l'index) : les versions ne seraient plus lisibles dans le Finder, et seraient perdues si l'espace de travail change de Mac. Rejeté.
- **Des copies Markdown datées dans un dossier caché de l'espace de travail**, comme la corbeille (fiche 0012). Retenu (validé le 18/11).

## Décision

- **Rangement** : le dossier caché `.history/` à la racine de l'espace de travail. Chaque note y a un dossier à son propre chemin (`.history/Travail/lundi.md/`), qui contient ses versions : `2026-11-18 14h30.md`, puis `2026-11-18 14h30 (2).md` pour une deuxième dans la même minute (l'horloge est à la minute ; le rang départage, et l'ordre des versions est celui du moment puis du rang). Le dossier porte le nom de fichier complet de la note, `.md` compris, pour qu'une note `lundi.md` et un sous-dossier `lundi` ne partagent jamais le même dossier d'historique.
- **Hors de l'espace de travail visible** : étant caché, `.history/` n'est ni un dossier de la liste, ni dans l'index, la recherche ou les étiquettes, ni surveillé, comme `.trash/` (tests sur le stockage, l'index et la surveillance).
- **Hexagonal** : port `History` dans `application` (versions d'une note, lire, écrire, retirer, déplacer l'historique d'une note ou d'un dossier entre l'espace de travail et la corbeille, oublier celui de la corbeille) et port `HistoryOpener`. Tests de contrat joués sur `MemoryHistory` (le faux, aussi celui d'une session sans historique sur disque) et sur l'adaptateur `FsHistory` d'`infrastructure`. Une version s'écrit dans un fichier caché, puis est renommée : jamais de version à moitié écrite.
- **L'historique suit la note** : `VersionedStore` enveloppe l'espace de travail ouvert (sous l'index : `IndexedStore(VersionedStore(stockage))`) ; chaque déplacement, renommage (y compris celui qui suit le titre à l'enregistrement), mise à la corbeille et restauration de note ou de dossier emporte l'historique avec elle. Dans la corbeille, il est rangé à `.trash/.history/<chemin dans la corbeille>`, et part donc avec elle quand on la vide.
- **Règles dans le domaine** (`domain::history`, `domain::diff`, fonctions pures) : le nom d'une version et son rang (`next_version`, jamais une version identique à la plus récente), la conservation (`retained` : tout sur 24 h, puis la plus récente de chaque jour jusqu'à 30 jours, puis la plus récente de chaque semaine, du lundi au dimanche), le texte à garder avant un changement extérieur (`before_outside_change`), et les différences ligne par ligne (algorithme de Myers, écrit et testé dans le domaine plutôt qu'une bibliothèque : une centaine de lignes, aucune licence à suivre, arrêté au-delà de 1 000 lignes changées pour ne jamais faire attendre). La conservation et les différences sont vérifiées par des tests de propriétés (`crates/domain/tests/history_properties.rs`), les différences contre une plus longue sous-suite commune calculée sans astuce.
- **Quand une version est gardée** :
  - **5 minutes après la première frappe** dans une note (`VERSION_DELAY_MS`, `ui/src/state/history.ts`) : les notes partagées (`shared-notes.ts`) enregistrent ce qui est tapé, puis demandent `keep_version`. Le délai repart à la frappe qui suit.
  - **En quittant la note** : quand la dernière colonne qui la montre la quitte (onglet fermé, autre note montrée), si on y a tapé depuis la dernière version. **En quittant l'application** (événement `Exit` de Tauri) et **en changeant d'espace de travail**, Rust garde une version de chaque note enregistrée depuis sa dernière version (les versions en attente, tenues par la session).
  - **Juste avant un changement venu de l'extérieur** : à chaque annonce de la surveillance, avant que l'index ne relise les notes, le texte que l'index en avait (`NoteIndex::content`) est gardé en version s'il n'est plus celui du disque (la note a pu disparaître). Un enregistrement de l'application, lui, a déjà mis l'index à jour : il ne crée pas de version.
  - **Avant une restauration** (voir plus bas).
- **Action « Historique »** : Cmd+Y (libre dans l'application, dans CodeMirror sur Mac et dans le menu de Tauri ; c'est aussi l'historique de Safari), la palette, le menu Fichier (grisée sans note montrée), le menu d'une note dans la liste et celui de son onglet. La fenêtre liste les versions, la plus récente d'abord et choisie ; la version choisie est comparée à la note actuelle par Rust (`compare_version`) : vert, seulement dans la version ; rouge barré, seulement dans la note actuelle. Ce qui est tapé est enregistré avant d'ouvrir la fenêtre.
- **Restaurer** (`RestoreVersion`) : Rust garde d'abord le texte actuel comme version, puis écrit celui de la version dans la note ; la colonne qui montre la note relit le disque (comme pour un changement extérieur, fiche 0014). Le nom du fichier ne change pas à la restauration ; il suit le titre à la frappe suivante.

## Conséquences

- Les versions restent des fichiers Markdown ordinaires : on les lit, les copie ou les supprime dans le Finder, et elles voyagent avec l'espace de travail (iCloud Drive compris).
- L'espace disque grandit avec les notes souvent modifiées ; la conservation le borne (au plus une version par semaine au-delà d'un mois).
- Une note supprimée hors de l'application garde son historique dans `.history/`, sans action pour le voir dans l'application ; le Finder suffit.
- Une version gardée par la surveillance porte le moment où le changement a été vu, pas celui où le fichier a changé.
- Quitter l'application dépend de l'événement `Exit` de Tauri ; ce qui n'était pas encore enregistré par l'enregistrement automatique n'est pas dans la dernière version.
