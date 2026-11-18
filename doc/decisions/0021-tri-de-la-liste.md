# 0021 — Tri de la liste : choisi par l'interface, rangé par Rust

- **Date** : 2026-11-18
- **Statut** : acceptée

## Contexte

La liste des notes était toujours rangée par date de modification, épinglées d'abord. On veut pouvoir la trier aussi par titre, dans la liste d'un dossier, le filtre par étiquette et les résultats de recherche. Il faut dire qui range les notes et où le choix est gardé.

## Décision

- **Deux tris** (`NoteOrder`, domaine) : date de modification, la plus récente d'abord (par défaut) ; titre, de A à Z, majuscules et accents ignorés (même clé que la liste des étiquettes : « avion », « Banane », « cerise »), puis le titre tel qu'écrit. À égalité, le chemin départage. Les notes épinglées restent en tête, triées de même entre elles.
- **Rust range, l'interface choisit** : `list_notes`, `list_tagged_notes` et `search_notes` reçoivent le tri (`order`). La règle d'ordre reste en un seul endroit (`domain::note::compare`), et la recherche trie avant de garder ses 100 premiers résultats : trier par titre montre bien les premiers titres, pas les 100 plus récents. Changer de tri relit la liste (et la recherche en cours).
- **La recherche n'a pas d'ordre de pertinence** : elle était déjà rangée par date ; elle suit désormais le tri de la liste, épinglées d'abord.
- **Le choix est gardé pour chaque bibliothèque** dans le stockage de la page (`malorean.order:<bibliothèque>`), comme les dossiers pliés ; le tri par défaut n'y est pas écrit, une valeur inconnue le ramène.
- **Choisir** : une petite liste « Trier par » au-dessus de la liste des notes (cachée dans la corbeille, rangée par chemin), et la commande « Trier la liste » de la palette, qui marque le tri en cours.
- **La date montrée** sous chaque note reste la date de modification, quel que soit le tri.
- **Pas de tri par date de création**, à la demande de l'utilisateur : il demandait une date que Rust ne connaît pas (l'enregistrement remplace le fichier, ce qui change sa date de création) ; il a été retiré.

## Conséquences

- Pas de tri croissant ou décroissant au choix, ni de tri par dossier dans la recherche.
