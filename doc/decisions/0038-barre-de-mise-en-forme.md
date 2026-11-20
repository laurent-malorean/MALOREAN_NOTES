# 0038 — Barre de mise en forme : des boutons pour les commandes de mise en forme et de copie

- **Date** : 2026-11-20
- **Statut** : acceptée
- **Complète** la fiche 0029 (barre des menus) et la fiche 0033 (tout sans raccourci clavier).

## Contexte

La mise en forme (gras, italique, lien, titres, listes, date du jour) et les deux copies d'une note n'avaient, à la souris, que la barre des menus et la palette. Demande validée par l'utilisateur les 18 et 19/11 : une rangée de boutons dans la bande du haut de la fenêtre, au centre, au-dessus des onglets, à gauche des boutons Focus, Plan… ; trois groupes séparés par un trait : Gras, Italique, Lien | Titre 1, Titre 2, Titre 3, Liste à puces, Liste numérotée, Date du jour | Copier en Markdown, Copier mis en forme. Markdown pur : pas de souligné, aucune balise HTML dans les notes.

## Décision

- **Les boutons lancent les commandes existantes**, celles de la palette, des raccourcis et de la barre des menus (`commandActions`) : aucune logique de mise en forme en double. Ils visent donc, comme elles, la note de la colonne active. La liste des boutons (`FORMAT_BAR`, `ui/src/state/format-bar.ts`) ne donne que l'identifiant de la commande et un texte court ; le nom (nom accessible du bouton) et le raccourci (bulle d'aide « Gras (Cmd+B) ») viennent de la liste des commandes. Aucun raccourci nouveau.
- **Textes courts** plutôt que des icônes, dans le style des boutons Focus, Plan… (classe `tool`, jetons du thème) : « G » en gras, « I » en italique, « Lien », « T1 » à « T3 », « • », « 1. », « Date », « Copier Markdown », « Copier mis en forme ». Une icône dessinée demanderait des images à maintenir dans deux apparences ; une lettre se lit dans les deux.
- **La sélection reste dans l'éditeur** : la barre empêche l'action par défaut de l'appui sur le bouton (`mousedown`), qui donnerait le focus au bouton. L'éditeur garde focus, curseur et sélection ; on enchaîne Gras puis Italique sans resélectionner.
- **Grisée sans note** : tous les boutons sont désactivés tant que la colonne active ne montre aucune note, comme les commandes d'une note dans la barre des menus. La barre suit les colonnes à chaque changement.
- **Fenêtre étroite : la rangée passe à la ligne.** La barre de mise en forme d'abord, centrée ; les boutons d'affichage (Focus, Plan…, regroupés) à droite, sur la ligne suivante quand la place manque ; un groupe qui ne tient plus passe lui aussi à la ligne. Rien n'est caché ni rangé dans un menu « plus » : tout reste à un clic, au prix de la hauteur de la bande. Choisi plutôt que rétrécir (les textes deviendraient illisibles) ou un menu de débordement (un clic de plus, et des boutons qui changent de place selon la largeur).

## Conséquences

- Une nouvelle commande de mise en forme s'ajoute à la liste des commandes, puis, si elle doit avoir son bouton, à `FORMAT_BAR`.
- Avec les deux panneaux latéraux montrés, une fenêtre de largeur moyenne met les boutons d'affichage sous la barre de mise en forme. La bande du haut n'a donc plus une hauteur fixe : le plan, qui se posait à 3 rem du haut par-dessus elle, se range désormais sous la bande, à droite des colonnes (grille de la zone d'édition), et ne cache plus aucun bouton.
- Tests : écran WebKit pour la barre (groupes, noms, bulles d'aide, grisé, appui qui ne prend pas le focus) ; parcours Playwright qui clique chaque bouton à la souris seule, vérifie la note enregistrée et la sélection gardée, le grisé sans note et la fenêtre étroite.
