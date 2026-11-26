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
- **Sélecteur de date maison** : le sélecteur natif du moteur web (WebKit) est minuscule (cases de 20 points),
  en anglais (« Mo Tu We », « Nov 2026 ») et ne se règle pas par CSS. Le composant `dateField` (sans nouvelle
  dépendance) donne un calendrier de 308 points, en français, semaine du lundi, au clavier, et sert partout
  où l'interface demande une date (fenêtre d'une action, changement d'entreprise d'une personne) ; la
  logique du calendrier (lecture « JJ/MM/AAAA », grille, déplacements) est pure et testée à part.
  « Effacer » existe mais n'est proposé nulle part pour l'instant : la date d'une action n'est jamais vide.

## Analyse critique (mesurée dans WebKit avant de corriger)

Mesures prises sur les vrais écrans (fenêtre d'une action à 600 points de large, Kanban à 1500, fiches,
listes, confirmation), valeurs avant, puis la cible choisie et ce que le test d'écran
`crm-spacing.browser.test.ts` impose désormais. Le contraste a été mesuré en thème clair ; le thème sombre
l'est par le même test (texte discret et boutons pleins).

- **Pas d'échelle** : des marges de 14, 18,7 (marge par défaut d'un `h3`), 12, 10, 6, 4, 2 points, des rayons
  de 5, 6, 8, 10, des tailles en `rem` quelconques. Cible : grille de 4 points (`--space-1` à `--space-6`),
  rayon 8, écrits une seule fois dans `theme.css`.
- **Blocs collés** : 14 points entre deux blocs de la fenêtre d'une action (18,7 sous un titre de bloc, par
  hasard) ; 8 points entre deux blocs d'une fiche. Cible : 24 dans la fenêtre d'une action, 16 dans une fiche.
- **Marges intérieures serrées** : corps de la fenêtre 8/16/16/16, en-tête et pied 10/16, confirmation
  16/17,6, écrans de liste 8/16. Cible : 24 (fenêtre, confirmation, listes), 16/24 pour l'en-tête et le pied,
  24/32 pour une fiche.
- **Contrôles de hauteurs différentes** : liste de statut 23, champ de date 33,6, titre 31,6, nom de
  checklist 29,6, ajout d'étiquette 22,8, « + » des étiquettes 21,2, champ de recherche et boutons
  des listes 29,6, boutons de la semaine 26,4. Cible : 36 partout (une liste native demande `height`, pas
  seulement `min-height`).
- **Cibles de clic minuscules** : « × » 19,4 sur 16, boutons discrets (« Fermer », « Copier les e-mails »,
  « + Ajouter une action ») 16 de haut, pastille de couleur 22, case à cocher 12, « × » d'une étape 22,7,
  pastille d'étiquette 18. Cible : 32 au moins ; la case fait 20 dans une ligne de 40 ; la pastille
  d'étiquette fait 28 dans sa bordure, plus dense que le reste car elle s'aligne en ligne dans la barre des
  notes aussi (écart assumé).
- **Texte et interligne** : 16 points, interligne « normal » (environ 1,2), titres de bloc à la taille par
  défaut du navigateur (18,7), noms de champ à 12,8. Cible : 15 sur 1,5, titres de bloc 16 gras (couleur du
  texte, pas du texte discret), noms de champ 13, titre de l'action 18.
- **Fenêtre de confirmation** (commune à toute l'application) : 16/17,6 de marge, question à 16 points des
  boutons, « Annuler » en simple texte gris de 16 points de haut, bouton rouge de 26,6, 12,8 entre eux.
  Cible : 24 de marge, 24 sous la question, deux boutons de 36 à 12 points l'un de l'autre, « Annuler »
  à bordure.
- **Contraste** : texte discret 5,11 contre 1 en clair (suffisant) ; en thème sombre, le blanc sur
  l'accent (`#6fa0ff`) ne faisait que 2,58 contre 1 : `--on-accent` devient `#0b1b3a` en sombre (plus de
  4,5), et un test le surveille.
- **Pas mesuré, laissé tel quel** : les couleurs de la palette sur fond de carte, la vue canvas et la
  carte mentale (hors CRM).
