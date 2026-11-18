# 0023 — Note du jour : un fichier daté dans le journal, créé par Rust, ouvert au lancement

- **Date** : 2026-11-18
- **Statut** : acceptée

## Contexte

On veut une note par jour, toujours au même endroit, prête à écrire dès l'ouverture de l'application, comme le journal quotidien d'Obsidian. Il faut dire où elle va, comment elle s'appelle, d'où part son texte, qui la crée, et comment éviter les doublons alors que le nom de fichier d'une note suit son titre (fiche 0002).

## Décision

- **Le journal est un dossier de la bibliothèque**, « Journal » par défaut, tapé dans une partie « Journal » de l'écran de réglages (un champ libre : le dossier n'existe peut-être pas encore ; vide, il redevient « Journal »). Il est créé au besoin, avec les dossiers qui le contiennent. Le même écran a la case « Créer la note du jour au lancement », cochée par défaut. Les deux sont gardés par bibliothèque dans le stockage de la page (`malorean.journal:` suivi du dossier de la bibliothèque), comme le dossier des modèles (fiche 0019) ; une valeur illisible reprend les réglages par défaut.
- **Son fichier porte la date ISO** (`2026-11-18.md`), pour que le journal se range par date ; **son titre est la date en toutes lettres** (« 18 novembre 2026 »), comme l'insertion de la date du jour et la variable `{{date}}`.
- **Exception au nom qui suit le titre** : une note dont le nom est une date ISO valable et dont le titre est cette même date en toutes lettres garde son nom à l'enregistrement (règle pure du domaine `journal`, appelée par le plan d'enregistrement). Si l'on change son titre, le nom suit de nouveau le titre, comme pour toute note.
- **Le texte** : si le dossier des modèles contient une note titrée exactement « Journal », la note du jour part d'elle, avec les mêmes règles que tout modèle (épinglage retiré, variables remplacées) ; la ligne de titre du modèle est remplacée par le titre daté (ajoutée en tête s'il n'en a pas), et `{{title}}` vaut ce titre. Sinon, la note ne contient que son titre. L'interface trouve le modèle (elle connaît le dossier des modèles) et l'enregistre d'abord s'il est ouvert et modifié.
- **Rust crée la note** (cas d'usage `CreateDailyNote`, à côté des autres créations de note ; commande `create_daily_note(journal, template)`) : il crée le journal s'il manque, rend le chemin de la note du jour si elle existe déjà — sans la lire ni la réécrire, donc jamais de doublon —, sinon l'écrit. Aucun port ne change : le stockage et l'horloge existants suffisent.
- **L'action « Note du jour »** (Cmd+Maj+J, libre dans l'application et dans l'éditeur ; aussi dans la palette) ouvre la note comme un clic dans la liste : un nouvel onglet après l'onglet actif de la colonne active, ou son onglet s'il y est déjà ouvert. La liste des dossiers et celle des notes sont relues, le journal venant peut-être d'apparaître.
- **Au lancement**, si la case est cochée, la même action a lieu une fois, après la bibliothèque rouverte et ses colonnes retrouvées (fiche 0017) : relancer le même jour ramène l'onglet de la note du jour sans en ajouter un. Choisir une autre bibliothèque en cours de route ne la déclenche pas.

## Conséquences

- La date en toutes lettres reste écrite en TypeScript (insertion) et en Rust (modèles, note du jour), avec la même règle.
- La note du jour n'est pas suivie si on la renomme ou la déplace : le lendemain, une nouvelle note est créée sous la nouvelle date ; le même jour, une note du jour déplacée ou retitrée est recréée au chemin daté si on redemande la note du jour.
- Une note déjà ouverte dans une autre colonne seulement s'ouvre aussi dans la colonne active.
- Les parcours de test existants démarrent sans la note du jour : la doublure de Rust y décoche la case tant qu'un parcours ne demande pas le journal.
- Cmd+Maj+J est pris par l'application.
