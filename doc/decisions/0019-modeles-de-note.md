# 0019 — Modèles de note : un dossier choisi, une note créée par Rust

- **Date** : 2026-11-18
- **Statut** : acceptée

## Contexte

On veut partir d'un texte tout prêt pour les notes qui reviennent (réunion, journal, recette), comme dans Obsidian. Il faut dire où sont les modèles, comment on en choisit un, et qui fabrique la note : remplacer les variables, garder ou non l'en-tête, nommer le fichier.

## Décision

- **Un dossier des modèles, choisi dans les réglages** : chaque note qui s'y trouve directement est un modèle (pas celles de ses sous-dossiers). Les modèles sont des notes ordinaires, créées et modifiées comme les autres ; le dossier reste un dossier de la bibliothèque, visible dans la liste des dossiers. Sans dossier choisi, il n'y a pas de modèle, et l'action le dit.
- **Le choix est gardé par bibliothèque dans le stockage de la page** (`localStorage`, clé `malorean.templates:` suivie du dossier de la bibliothèque), comme la disposition des colonnes (fiche 0017) : le perdre ne coûte qu'à le rechoisir, et Rust n'a pas à le connaître. Un dossier renommé ou supprimé n'est pas suivi : l'action dit alors qu'elle ne trouve aucun modèle.
- **Une seule action**, « Nouvelle note depuis un modèle » (Cmd+Maj+N, libre dans l'application et dans l'éditeur ; aussi dans la palette). Elle propose les modèles dans la fenêtre de choix au clavier de l'ouverture rapide. Le modèle choisi est d'abord enregistré s'il est ouvert et modifié ; la note est créée dans le dossier affiché, puis ouverte dans un nouvel onglet de la colonne active, prête à écrire. Pas d'insertion d'un modèle dans une note existante.
- **Rust fabrique la note** (cas d'usage `CreateNoteFromTemplate`, règle pure du domaine `template`) : il lit le modèle, retire l'épinglage de son en-tête (le reste de l'en-tête, étiquettes comprises, est gardé), remplace les variables avec le moment donné par l'horloge, puis écrit la note sous le nom tiré de son titre, avec le premier suffixe libre, comme tout enregistrement (fiche 0002). Aucun port ne change : le stockage et l'horloge existants suffisent.
- **Variables** : `{{date}}` donne la date en toutes lettres (« 18 novembre 2026 », « 1er mars 2027 »), comme l'insertion de la date du jour ; `{{time}}` donne l'heure `HH:MM` ; `{{title}}` donne le titre du modèle (« Sans titre » s'il n'en a pas). `{{title}}` est remplacé en premier : un modèle titré « Réunion du {{date}} » donne une note dont `{{title}}` vaut « Réunion du 18 novembre 2026 ». Le titre de la note est celui qu'écrit le modèle ; l'utilisateur le modifie ensuite, et le nom de fichier suit.

## Conséquences

- La date en toutes lettres est écrite deux fois, en TypeScript pour l'insertion dans l'éditeur et en Rust pour les modèles ; les deux suivent la même règle et ont chacun leurs tests.
- Une variable inconnue (`{{auteur}}`) reste telle quelle dans la note.
- Cmd+Maj+N est pris par l'application.
