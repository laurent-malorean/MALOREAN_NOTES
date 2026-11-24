# 0051 — Recherche en fenêtre : un champ dans la bande du haut, deux colonnes de résultats (mots et sens)

- **Date** : 2026-11-24
- **Statut** : acceptée
- **Modifie** les fiches 0042 (mode « par le sens » de la recherche) et 0046 (commande de recherche) ; spécification : `doc/specs/recherche-en-fenetre.md`.

## Décision

- Le champ de recherche quitte la liste des notes pour la bande du haut ; les résultats s'affichent dans une fenêtre de recherche à deux colonnes, « Recherche match » (par les mots) et « Recherche idées » (par le sens seul), remplies pour la même saisie.
- Fenêtre non bloquante (`dialog.show()`, pas `showModal()`) : le champ du haut reste utilisable pendant qu'elle est ouverte ; elle se ferme par Échap, sa croix, un clic en dehors ou l'ouverture d'un résultat, ce qui vide le champ. Elle est posée sous le champ.
- Nouvelle commande Rust `search_notes_by_meaning` (la recherche par le sens seule, avec la raison typée quand le sens manque) à la place de `search_notes_with_meaning`, qui n'a plus d'appelant dans l'interface ; la recherche mixte reste l'affaire de l'outil `search_by_meaning` de Claude.
- Disparaissent : le choix « Par les mots / Par le sens », l'offre de téléchargement sous le champ (elle reste dans Réglages > Index, vers lequel la colonne « idées » renvoie par un bouton), la commande « Rechercher par le sens ».

## Conséquences

- L'état de recherche de l'écran garde les deux réponses (`results` pour les mots, `ideas` pour le sens) ; la liste des notes ne montre plus de résultats, et le filtre par étiquette et Récentes restent visibles pendant une recherche.

## Hauteur de la fenêtre (correctif)

La fenêtre a une hauteur définie (toute la place entre le champ, avec une marge, et le bas de l'écran, avec une marge), pas une hauteur déduite de son contenu : dans le moteur du Mac, une colonne en `flex: 1` dans une boîte de hauteur automatique s'écrasait à zéro tant que les résultats n'étaient pas là, et la fenêtre devenait un filet transparent avec ses titres posés sur les onglets. Le parcours `ui/e2e/search-window-display.spec.ts` (thème sombre, 400 résultats, réponses lentes) garde cette hauteur, le fond, le premier plan et le défilement.
