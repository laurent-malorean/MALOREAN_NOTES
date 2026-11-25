# 0057 — CRM : le domaine lit et écrit les fiches, geste par geste, dans un module à part

- **Date** : 2026-11-25
- **Statut** : acceptée
- **Complète** la fiche 0050 (carte mentale : une note dont le format est lu et écrit par le domaine) et la fiche 0034 (types de contenu).

## Contexte

Spécification validée : `doc/specs/crm.md`. Un CRM est une note `type: crm` ; ses entreprises, personnes, actions et projets sont des notes d'un type propre, rangées dans des dossiers qui portent son nom. Les fiches s'écrivent à la main (Obsidian, Claude) autant que par l'application : rien de ce que l'utilisateur a écrit ne doit se perdre quand le CRM enregistre (§ 4.8). Cette première tranche ne contient que les règles pures ; le stockage, l'API et l'interface viendront ensuite.

## Décision

- **Un module `domain::crm`**, avec ses sous-modules, plutôt que des variantes de `ContentType` : ajouter cinq types à `ContentType` casserait les `match` des autres couches, que cette tranche ne touche pas. La tranche suivante décidera comment l'index range les fiches (types, conteneur, segments).
- **Le jour est un type du domaine** (`Day`, `DayTime`) sans dépendance : le domaine n'a que `unicode-normalization` ; l'arithmétique de dates dont le CRM a besoin (retard en jours, lundi d'une semaine) tient en quelques fonctions testées. « Aujourd'hui » est toujours un paramètre, donné par l'horloge de la couche application.
- **Écrire, c'est changer des lignes** : chaque geste est une fonction `texte → texte` qui ne réécrit que les lignes de la propriété touchée (`front_matter::with_key_line`), si bien que les autres propriétés, les commentaires YAML et le texte inconnu restent identiques octet pour octet. Un geste qui ne change rien rend le texte tel quel.
- **Le texte d'une action est coupé en parties tel qu'écrit** : seule une partie dont le sens change (description, une liste à cocher, les commentaires) est réécrite ; les autres gardent leur texte. Les lignes qui n'ont pas leur place dans une partie passent à la fin de la description, à la lecture comme à l'écriture.
- **Les fiches illisibles sont des erreurs typées** (`Unreadable`), jamais des fiches modifiées : le CRM les laisse de côté.
- **La palette est celle de l'application** : `Color` ne fait que désigner un nom de `mind_map::PALETTE` ; le CRM n'ajoute que les règles de choix (couleur d'étiquette, couleur la moins utilisée).
- **Les règles de vue sans écran sont dans le domaine** : colonnes du Kanban, ordre des cartes, place d'une carte lâchée (`kanban`), retard et à faire aujourd'hui (`Urgency`), filtres (`Filters`), semaine (`Week`), compteurs (`Tally`). L'interface les affiche sans les recalculer.

## Points tranchés là où la spécification ne dit rien

- Deux noms sont « les mêmes » quand ils sont égaux sans majuscules, sans accents et sans ponctuation, les espaces étant seulement ramenés à un seul : « Jean-Pierre » et « Jean Pierre » sont deux noms.
- Une étape lue dans un fichier qui n'est pas valable (vide, trop longue, nom d'une colonne fixe, doublon) est laissée de côté à la lecture.
- Une action sans date valable n'est jamais en retard ; elle passe après les autres dans l'ordre d'une colonne et n'apparaît pas dans Ma semaine.
- Les cartes d'un même jour de Ma semaine, et les cartes à date égale, se rangent par nom de fichier (donc par date de création).
- Au prochain enregistrement d'une action, les références à une personne ou à un projet dont la fiche n'existe plus sont retirées ; l'entreprise du moment d'une personne et les notes liées (§ 8, « un lien vers une note absente est montré comme dans une note ») ne le sont jamais.
- Donner à une action son statut actuel ne change rien (le rang reste).
- Un changement d'entreprise vers l'entreprise où la personne est déjà ne change rien.
- Le nom « NODATA » n'est pas réservé : la spécification ne le dit pas.

## Conséquences

- La tranche suivante (stockage, API, vue) appelle ces fonctions depuis des cas d'usage qui lisent, décident (ici) puis écrivent ; elle ajoute les types de l'index et la lecture des CRM, et fait la mutation de plusieurs fichiers « tous ensemble ou aucun » (§ 10).
- Rien n'est lu sur le disque ni sur l'horloge dans cette tranche : tout se teste sur des textes.
