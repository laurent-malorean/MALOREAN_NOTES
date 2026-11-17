# Produit — vision et périmètre

## Vision

Une application Mac pour écrire et ranger ses notes, qui réunit :
- la **simplicité de rangement** d'une app de notes (dossiers, recherche instantanée, notes épinglées) ;
- le **confort d'écriture** d'un éditeur Markdown concentré (typographie soignée, mode focus, rien qui distrait).

L'application a sa propre identité : nom, icône et apparence originaux, sans reprendre ceux d'Apple ou d'iA.

## Principe fondateur : tout est Markdown

- **Une note = un fichier `.md`**, lisible et modifiable par n'importe quel autre outil.
- **Les fichiers sont la seule source de vérité.** Pas de base de données propriétaire ; l'index de recherche est un cache que l'application peut reconstruire à tout moment.
- **Une bibliothèque = un dossier** choisi par l'utilisateur. Les dossiers de notes sont de vrais dossiers sur le disque.
- **Titre et nom de fichier** : le titre d'une note est son premier titre `#`. Le nom du fichier est ce titre en kebab-case (`Mon idée du jour` → `mon-idee-du-jour.md`) : minuscules, accents retirés, espaces remplacés par `-`, autres signes supprimés. Changer le titre renomme le fichier. Note sans titre : `sans-titre.md`. Nom déjà pris dans le dossier : suffixe `-2`, `-3`…
- **Pièces jointes** (images collées, fichiers) : un dossier par note, à côté d'elle, nommé comme la note avec `.assets` (`mon-idee-du-jour.assets/`), référencé par liens Markdown relatifs. Ce dossier n'apparaît pas comme un dossier de notes. Renommer la note renomme son dossier et met à jour ses liens ; supprimer la note envoie ses pièces jointes à la corbeille avec elle.
- **Métadonnées minimales**, en en-tête YAML seulement quand elles sont nécessaires (épinglée, étiquettes). Une note sans en-tête est une note valide.
- **Modifications extérieures** : si un fichier change hors de l'application (autre éditeur, synchronisation), l'application le recharge. Si la note était aussi modifiée dans l'application, elle ne perd rien et signale le conflit.
- **Synchronisation** : la bibliothèque peut vivre dans iCloud Drive ou tout dossier synchronisé ; l'application n'a pas son propre service de synchronisation.

## Périmètre de la première version

- Fenêtre en trois parties : dossiers, liste des notes, et jusqu'à trois colonnes d'édition à onglets, côte à côte.
- Créer, renommer, déplacer, supprimer (corbeille) une note ou un dossier.
- Éditeur Markdown avec mise en forme en direct ; enregistrement automatique.
- Recherche plein texte instantanée.
- Notes épinglées en tête de liste ; tri par date de modification.
- Mode focus (phrase ou paragraphe courant mis en avant), mode plein écran, et panneaux latéraux qu'on cache ou montre.
- Coller une image : elle devient une pièce jointe liée.

## Hors première version

Synchronisation propre, partage et collaboration, chiffrement, version iPhone/iPad, publication.
