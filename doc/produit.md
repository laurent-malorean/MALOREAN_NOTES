# Produit — vision et périmètre

## Vision

Une application Mac pour écrire et ranger ses notes, qui réunit :
- la **simplicité de rangement** d'une app de notes (dossiers, recherche instantanée, notes épinglées) ;
- le **confort d'écriture** d'un éditeur Markdown concentré (typographie soignée, mode focus, rien qui distrait).

L'application a sa propre identité : nom, icône et apparence originaux, sans reprendre ceux d'Apple ou d'iA.

## Principe fondateur : tout est Markdown

- **Une note = un fichier `.md`**, lisible et modifiable par n'importe quel autre outil.
- **Les fichiers sont la seule source de vérité.** Pas de base de données propriétaire ; l'index (liste, étiquettes, recherche) est un cache rangé hors de l'espace de travail, que l'application peut reconstruire à tout moment à partir des fichiers.
- **Un espace de travail = un nom + un dossier** choisi par l'utilisateur. Les dossiers de notes sont de vrais dossiers sur le disque. On en garde plusieurs et on passe de l'un à l'autre ; les renommer ou les retirer de la liste ne touche jamais aux fichiers.
- **Titre et nom de fichier** : le titre d'une note est son premier titre `#`. Le nom du fichier est ce titre en kebab-case (`Mon idée du jour` → `mon-idee-du-jour.md`) : minuscules, accents retirés, espaces remplacés par `-`, autres signes supprimés. Changer le titre renomme le fichier. Note sans titre : `sans-titre.md`. Nom déjà pris dans le dossier : suffixe `-2`, `-3`…
- **Pièces jointes** (images collées, fichiers) : un dossier par note, à côté d'elle, nommé comme la note avec `.assets` (`mon-idee-du-jour.assets/`), référencé par liens Markdown relatifs. Ce dossier n'apparaît pas comme un dossier de notes. Renommer la note renomme son dossier et met à jour ses liens ; supprimer la note envoie ses pièces jointes à la corbeille avec elle.
- **Métadonnées minimales**, en en-tête YAML seulement quand elles sont nécessaires (épinglée, étiquettes). Une note sans en-tête est une note valide.
- **Modifications extérieures** : si un fichier change hors de l'application (autre éditeur, synchronisation), l'application le recharge. Si la note était aussi modifiée dans l'application, elle ne perd rien et signale le conflit.
- **Synchronisation** : l'espace de travail peut vivre dans iCloud Drive ou tout dossier synchronisé ; l'application n'a pas son propre service de synchronisation.

## Périmètre de la première version

- Espaces de travail : plusieurs, gardés d'un lancement à l'autre ; un sélecteur en tête des dossiers et la palette (Cmd+Maj+E) pour passer de l'un à l'autre, en ajouter, en renommer, en retirer ; chacun retrouve ses colonnes et ses réglages.
- Fenêtre en trois parties : dossiers, liste des notes, et jusqu'à trois colonnes d'édition à onglets, côte à côte.
- Créer, renommer, déplacer, supprimer (corbeille) une note ou un dossier.
- Éditeur Markdown avec mise en forme en direct ; enregistrement automatique.
- Recherche plein texte instantanée.
- Notes épinglées en tête de liste ; tri par date de modification.
- Étiquettes de l'en-tête montrées sous chaque note ; un clic filtre la liste sur tout l'espace de travail ; liste des étiquettes avec leur nombre de notes.
- Tri de la liste par date de modification ou par titre, épinglées toujours en tête ; il vaut aussi pour le filtre par étiquette et la recherche, et chaque espace de travail garde le sien.
- Notes récentes : les 10 dernières notes ouvertes, de tout dossier, montrées par l'entrée « Récentes » comme un dossier et proposées d'abord par l'ouverture rapide ; elles suivent les renommages, perdent les notes jetées, et chaque espace de travail garde les siennes.
- Mode focus (phrase ou paragraphe courant mis en avant), mode plein écran, et panneaux latéraux qu'on cache ou montre.
- Coller une image : elle devient une pièce jointe liée.
- Modèles de note : une note créée depuis une note du dossier des modèles choisi dans les réglages, la date, l'heure et le titre remplacés.
- Exporter une note en PDF (mise en forme, thème clair) ou en Markdown (le fichier tel quel, pièces jointes copiées à côté), à l'endroit choisi dans la fenêtre d'enregistrement du Mac : palette, Cmd+E ou menu de la note.
- Imprimer une note, mise en forme comme l'export PDF, depuis la fenêtre d'impression du Mac (qui permet aussi de garder un PDF) : palette, Cmd+P, menu de la note ou de son onglet.
- Copier une note en texte mis en forme, pour la coller dans un mail ou un document : la mise en forme de l'export PDF et, pour les applications qui n'en veulent pas, le texte sans marques Markdown ; images incluses tant qu'elles restent légères. Palette ou Cmd+Maj+C (la sélection seule si du texte est sélectionné), menu de la note ou de son onglet.
- Copier une note en Markdown, telle qu'elle est écrite (en-tête compris), pour la coller dans un autre outil qui lit le Markdown. Palette ou Ctrl+Cmd+C (la sélection seule si du texte est sélectionné), menu de la note ou de son onglet.
- Note du jour : la note de la date du jour, rangée dans le journal sous sa date et titrée en toutes lettres, créée au besoin depuis le modèle « Journal » ; ouverte par Cmd+Maj+J, la palette, et au lancement si les réglages le demandent.
- Barre des menus du Mac en français, rangée comme le veut Apple (MALOREAN Notes, Fichier, Édition, Présentation, Fenêtre, Aide) : chaque action de la palette avec le même raccourci ; Cmd+W ferme l'onglet, jamais la fenêtre ; les actions sur une note sont grisées quand aucune note n'est montrée.

## Hors première version

Synchronisation propre, partage et collaboration, chiffrement, version iPhone/iPad, publication.
