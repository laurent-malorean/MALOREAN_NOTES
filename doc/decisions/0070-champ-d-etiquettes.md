# 0070 — Champ d'étiquettes : un seul contrôle visible, un seul geste Rust pour tout contenu

- **Date** : 2026-11-25
- **Statut** : acceptée, demande de l'utilisateur
- **Complète** la fiche 0020 (étiquettes), la fiche 0062 (fenêtre d'une action) et la spécification du canvas (§ 7.4).

## Contexte

Une étiquette ne s'ajoutait ou ne se retirait qu'en éditant la liste `tags:` de l'en-tête, sauf dans la fenêtre d'une action du CRM. Il faut un contrôle visible sur chaque contenu (note, cahier de recherche, carte mentale, canvas, CRM et ses fiches), le même partout : mêmes gestes, même aspect.

## Décision

- **Un seul composant d'écran** (`screens/tag-field.ts`) : les étiquettes en pastilles à leur couleur avec « × », un champ « Ajouter une étiquette » (Entrée) avec un « + » (ajoute le texte tapé, ou donne le curseur au champ s'il est vide), les suggestions des étiquettes de l'espace de travail que le contenu n'a pas déjà. La fenêtre d'une action l'emploie à la place de son champ d'avant ; il n'y a aucune copie. La couleur d'une étiquette et les deux gestes qui préparent la liste (`withTag`, `withoutTag`) sont dans `state/tag-field.ts`.
- **Une barre sous les onglets de chaque colonne** (`screens/note-tags.ts`, élément `tag-bar` de la colonne) montre le champ du contenu montré, quelle que soit son écran (éditeur, carte mentale, canvas, CRM, fiche) : un seul endroit, aucun écran n'a à le redessiner.
- **Un seul geste côté Rust, pour tout fichier** : `note_tags(path)` lit, `change_note_tags(path, tags)` écrit (cas d'usage `ReadTags` et `ChangeTags`). Pour une note, un cahier, une carte, une fiche du CRM : la clé `tags` de l'en-tête est réécrite (`retagged`), le reste du fichier est gardé octet pour octet. Pour un canvas : la propriété `tags` de la **racine** du fichier JSON Canvas, toutes les autres propriétés gardées (`Canvas::with_tags`) ; Obsidian les garde aussi (`doc/specs/canvas.md` § 7.4). Les étiquettes écrites sont nettoyées comme celles d'une action (`written_tags` : sans doublon, majuscules et accents ignorés, celles qui changeraient le sens de la liste laissées de côté).
- **Les étiquettes d'un canvas entrent dans l'index** (`file_tags` : le résumé d'un fichier les tire de la racine du canvas), donc la liste des notes, la liste des étiquettes et le filtre par étiquette les voient.
- **Ordre d'un geste** : ce qui est tapé dans la note est enregistré d'abord (le titre a pu changer son nom), Rust écrit, puis la colonne relit le fichier (`followDisk`) pour que le texte caché de l'éditeur, la carte, le canvas ou la fiche montrent la version écrite ; la liste des étiquettes et la liste des notes sont relues.
- **La barre se relit** à l'ouverture d'un contenu (étiquettes et suggestions), à chaque enregistrement et à chaque changement venu d'ailleurs (étiquettes seulement) ; elle ne se redessine que si elles changent, la saisie en cours est gardée.

## Choix écartés

- Un geste par sorte de fiche du CRM (`CompanyChange::Tags`, `PersonChange::Tags`…) : trois chemins de plus à écrire et à tester pour la même écriture d'une liste dans un en-tête.
- Écrire dans le texte de l'éditeur depuis l'interface : l'interface aurait dû connaître les formes de la liste `tags` (Rust les lit toutes).

## Conséquences

- Le filtre du Kanban reste celui des actions (spécification du CRM, § 7.1).
- Une note qui vient d'être tapée mais pas encore enregistrée est enregistrée par le geste : un cahier de recherche, en lecture seule, ne reçoit que ce changement d'en-tête.
- Les outils de Claude `add_tags` et `remove_tags` ne changent pas.
