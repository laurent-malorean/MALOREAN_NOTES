# 0084 : la fenêtre d'une action, refaite après essai

## Contexte

L'utilisateur a essayé la fenêtre d'une action du CRM et l'a comparée à un autre outil : des défauts de
comportement (une checklist créée n'apparaît qu'en quittant l'action, pas de barre de progression,
éléments cochés pas barrés, suppression d'une checklist sans question) et de présentation (tout est tassé,
calendrier natif minuscule et en anglais, aucune étiquette existante proposée).

## Décisions (ce fichier se complète au fil des commits de la fonction)

- **Un champ d'ajout ne retient pas le dessin.** La fenêtre attendait la fin d'une saisie avant de se
  redessiner ; or le curseur reste dans le champ d'ajout après Entrée, donc la checklist, l'élément ou
  l'étiquette ajoutés n'apparaissaient qu'en le quittant. Les champs d'ajout gardent leur texte à part
  (brouillons) : ils portent `data-draft` et ne comptent plus comme une saisie en cours. Titre, description,
  noms et commentaire en cours restent protégés.
- **Étapes du Kanban** : l'ajout, le renommage, le retrait et le déplacement d'une étape se voient aussitôt
  dans le Kanban (tests d'écran avec le CRM relu après chaque geste, test Rust : les étapes écrites sont les
  étapes lues). Le défaut décrit n'a pas été reproduit à ce niveau.
- **Mot « checklist »** à l'écran (titre « Checklists », « Ajouter une checklist », « Supprimer la checklist ») ;
  le fichier garde `#### Liste à cocher : nom` pour ne pas casser les CRM existants.
- **Barre de progression** par checklist (`role="progressbar"`, vert de l'interface), élément coché barré et
  atténué.
- **Confirmation** avant de supprimer une checklist (même fenêtre que « Placer dans la corbeille »).
- **Boutons « + »** (icône `add` du jeu partagé) pour « Ajouter un élément », « Ajouter une checklist »,
  « Lier une note » ; un clic ouvre le champ d'ajout.
- **Ordre** : titre, statut/date/canal, personnes, projet, couleur, description, **checklists juste sous la
  description**, étiquettes, notes liées, commentaires.
