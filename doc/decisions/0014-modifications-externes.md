# 0014 — Modifications faites hors de l'application : recharger, ou garder les deux versions

- **Date** : 2026-11-16
- **Statut** : acceptée

## Contexte

La bibliothèque est un simple dossier : un autre éditeur, le Finder, une synchronisation (iCloud Drive) ou un assistant peuvent y créer, modifier ou supprimer des notes pendant que l'application est ouverte. Jusqu'ici, l'application ne le voyait pas, et l'enregistrement automatique écrasait sans le savoir une version écrite ailleurs.

## Décision

- **Surveillance** : Rust surveille le dossier de la bibliothèque ouverte (`notify`, FSEvents sur le Mac, changements regroupés sur 300 ms) derrière le port `LibraryWatcher`. Les fichiers et dossiers cachés (fichiers d'enregistrement en cours, `.trash/`) et les dossiers de pièces jointes sont ignorés. Chaque changement part vers la page par l'événement `library-changed`, avec les chemins des notes touchées ; la page relit alors les dossiers et la liste. Une surveillance impossible n'empêche pas d'ouvrir la bibliothèque : elle est journalisée.
- **Empreinte** : chaque lecture et chaque enregistrement rendent l'empreinte du contenu (FNV-1a, 64 bits). La page la renvoie au prochain enregistrement. Nos propres écritures ne sont donc jamais prises pour des changements extérieurs : le disque a l'empreinte que la page connaît, il n'y a rien à faire. Pas de liste des écritures récentes à tenir à jour.
- **Note ouverte changée ailleurs, rien de tapé en attente** : la nouvelle version s'affiche ; le curseur reste à la même ligne et à la même colonne, ramenées dans le texte. La relecture n'entre pas dans l'historique d'annulation.
- **Note changée des deux côtés (conflit)** : le texte de l'utilisateur reste dans l'éditeur et est enregistré tout de suite dans la note ; la version trouvée sur le disque est d'abord gardée à côté, dans `<nom> (conflit 2026-11-16 18h30).md` (même dossier, suffixe libre si le nom est pris, heure donnée par l'horloge injectée). Un message dit où se trouve l'autre version.
- **Garde à l'enregistrement** : la règle du conflit vit dans le cas d'usage `SaveNote`, pas dans la page. Même si la surveillance a manqué un changement, un enregistrement dont l'empreinte ne correspond plus au disque garde d'abord la version du disque. Si le disque a déjà exactement le texte enregistré, aucune copie n'est faite.
- **Note ouverte supprimée ailleurs** : son texte reste à l'écran, un message le dit, et elle est recréée automatiquement à la prochaine modification (l'enregistrement d'une note absente l'écrit de nouveau).

## Conséquences

- Aucune version n'est jamais perdue : au pire, l'utilisateur trouve deux notes au même titre, dont une copie de conflit à relire et à supprimer.
- C'est le texte tapé dans l'application qui garde le nom de la note : l'utilisateur continue d'écrire sans interruption ; l'autre version est à côté.
- La copie de conflit est une note comme les autres : si on la modifie, son nom suit son titre.
- Le contrôle d'empreinte coûte une lecture du fichier à chaque enregistrement : négligeable pour des notes.
- Un fichier non UTF-8 apparu à la place d'une note ouverte bloque l'enregistrement (note illisible) plutôt que de l'écraser.
