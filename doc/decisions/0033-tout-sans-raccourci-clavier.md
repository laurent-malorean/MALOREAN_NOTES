# 0033 — Tout se fait sans raccourci clavier : chaque commande dans la barre des menus

- **Date** : 2026-11-19
- **Statut** : acceptée

## Contexte

Principe demandé par l'utilisateur le 19/11 : « on doit pouvoir tout faire sans raccourcis clavier ». Les commandes de la palette étaient déjà toutes dans la barre des menus (fiche 0029), mais un test n'exigeait d'y ranger que celles qui ont un raccourci. Le relevé des actions a trouvé quatre manques :

1. **Mise en forme et date du jour** : gras, italique, lien, titres 1 à 3, listes à puces et numérotée (Cmd+B, Cmd+I, Cmd+K, Cmd+1 à 3, Cmd+Maj+8, Cmd+Maj+7) et l'insertion de la date du jour (Cmd+Maj+D) n'existaient que comme touches de l'éditeur.
2. **Ouvrir un lien de la note** (lien entre notes, pièce jointe, adresse) : seulement par Cmd+clic.
3. **Ouvrir une note trouvée par la recherche dans un nouvel onglet ou une autre colonne** : seulement par Cmd+clic ; la liste des notes et les onglets avaient déjà le menu d'une note au clic droit.
4. **Fenêtre de choix** (palette, ouverture rapide, nouvel onglet, modèle, tri, espace de travail) : ouverte à la souris par la barre des menus, elle ne se fermait sans choisir que par Échap.

## Décision

- **Un test l'exige** : toute commande de la liste, avec ou sans raccourci, est dans la barre des menus. Ajouter une commande sans la ranger dans un menu fait échouer les tests.
- **Mise en forme et date du jour deviennent des commandes** de la palette (`FormatCommandId`, `insert-date`), rangées dans un menu **Format**, entre Édition et Présentation, comme dans les applications de texte du Mac. Elles visent la note de la colonne active et sont grisées sans note. Leurs touches restent les mêmes ; l'éditeur les lit maintenant dans la liste des commandes (`commandKeys`, `editorKey`), si bien qu'un raccourci n'est toujours écrit qu'une fois. Hors de l'éditeur, la page les lit comme les autres raccourcis.
- **« Ouvrir le lien »** (`open-link`, menu Fichier et palette) ouvre le lien où se trouve le curseur, comme un Cmd+clic dessus : à la souris, on clique dans le lien, puis on choisit la commande. Un lien entre notes passe avant le lien Markdown qui le contiendrait.
- **Menu d'une note sur les résultats de la recherche** : le clic droit propose « Ouvrir dans un nouvel onglet », « Ouvrir à gauche », « Ouvrir à droite », « Fermer », comme dans la liste des notes.
- **Fenêtre de choix** : un clic à côté d'elle (sur le fond) la ferme sans rien choisir. Son champ et sa liste la couvrent entièrement ; un clic qui arrive à la fenêtre elle-même vient donc de son fond.

## Conséquences

- La barre des menus compte un menu de plus (Format) ; la palette, dix commandes de plus.
- Cmd+B, Cmd+I et Cmd+K agissent aussi quand le curseur n'est pas dans l'éditeur (dans la liste des notes, par exemple), sur la note de la colonne active, comme le ferait l'élément de menu.
- Restent au clavier, faute de chemin à la souris simple : le menu du Mac sur une sélection (outils d'écriture d'Apple, orthographe), qui demande Alt+clic droit, car la page ne peut pas ouvrir ce menu elle-même ; et le retrait d'un élément de liste par Tab et Maj+Tab, qui reste une touche de frappe. Valider un nom tapé par Entrée n'est pas un raccourci : il faut de toute façon le clavier pour taper le nom.
