# 0002 — Notes en fichiers Markdown, nom de fichier tiré du titre

- **Date** : 2026-11-16
- **Statut** : acceptée
- **Note (18/11/2026)** : « bibliothèque » (`Library`) s'appelle désormais « espace de travail » (`Workspace`), voir `doc/ontology.md` ; cette fiche garde l'ancien mot.

## Contexte

Les notes doivent rester lisibles et modifiables par n'importe quel autre outil, et pouvoir vivre dans un dossier synchronisé (iCloud Drive). Il faut décider où vit la vérité, comment nommer les fichiers et où ranger les images collées.

## Décision

- **Une note = un fichier `.md`** dans un dossier choisi par l'utilisateur (la bibliothèque). Les fichiers sont la seule source de vérité ; un index éventuel n'est qu'un cache reconstructible.
- **Le titre est le premier titre `#`** (hors en-tête YAML et blocs de code). **Le nom du fichier est ce titre en kebab-case** (`Mon idée du jour` → `mon-idee-du-jour.md`) ; changer le titre renomme le fichier. Sans titre : `sans-titre.md`. Nom pris : suffixe `-2`, `-3`…
- **Pièces jointes : un dossier par note**, `<nom-de-la-note>.assets/`, à côté d'elle. Renommer la note renomme ce dossier et met à jour les liens.
- **Écriture atomique** (fichier temporaire puis renommage) ; un fichier qui n'est pas du texte UTF-8 reste listé mais n'est jamais ouvert, pour ne pas l'abîmer.

## Conséquences

- On gagne des notes portables, sans format propriétaire, synchronisables par le système.
- Le nom du fichier change au fil des titres : un lien extérieur vers un fichier peut casser. Les liens entre notes devront s'appuyer sur le titre, pas sur le nom de fichier.
- Le renommage doit déplacer note et dossier de pièces jointes ensemble ; il est refusé si le dossier cible existe déjà.
- Lister les notes lit tous les fichiers : un index sera nécessaire pour les grosses bibliothèques.
