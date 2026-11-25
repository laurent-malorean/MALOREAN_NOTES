# 0064 — Bande du haut : un troisième bloc d'icônes pour l'affichage, sur une seule ligne

- **Date** : 2026-11-25
- **Statut** : acceptée
- **Complète** la fiche 0038 (barre de mise en forme : mêmes icônes, mêmes pilules) et la fiche 0054 (essai de l'application réelle).

## Contexte

Les six boutons texte « Focus », « Plan », « Machine à écrire », « Panneaux », « Plein écran » et « Claude » tenaient sur une seconde ligne, sous la recherche, avec un style différent des deux pilules de la barre de mise en forme. Demande validée : les mettre en icônes, dans un troisième bloc arrondi du même style, entre les copies et le champ de recherche, sur une seule ligne.

## Décision

- **Un seul jeu d'icônes** : les nouvelles icônes (viseur, plan, clavier, deux panneaux, flèches vers les coins, flèches vers le centre pour sortir du plein écran, rayons de Claude) s'ajoutent à `ui/src/screens/format-icons.ts` ; le même trait fin, la même pilule (`format-group`), le même bouton (`format-button`), les mêmes jetons `--format-*`. Les rayons de Claude viennent de `ui/src/screens/claude-icon.ts`, partagé avec l'en-tête de la colonne Claude Code : une seule géométrie.
- **Le nom reste, le texte s'en va** : chaque bouton garde comme nom accessible son libellé d'avant (« Focus : phrase », « Quitter le plein écran »… quand il change) ; la bulle d'aide donne ce nom et le raccourci de la commande. La liste des boutons (`DISPLAY_TOOLS`, `ui/src/state/format-bar.ts`) donne l'ordre, l'icône et la commande ; aucune action ni raccourci ne change. Un bouton actif garde `aria-pressed`, montré en couleur d'accent sur le fond de sélection, y compris sous le pointeur.
- **Une ligne, puis la recherche rétrécit, puis le dernier bloc passe à la ligne** : les trois blocs sont dans un conteneur (`tool-blocks`) qui peut rétrécir et passer à la ligne ; le champ de recherche s'étire jusqu'à 20 rem, ne descend jamais sous 6 rem (`min-width`) et ne rétrécit donc pas : le manque de place est reçu par les blocs, dont le dernier (affichage) passe sous les autres. Choisi plutôt que le défaut d'une rangée à retour à la ligne, qui aurait fait passer la recherche seule sur une seconde ligne.

## Conséquences

- Avec les panneaux latéraux montrés, une fenêtre de largeur moyenne met le bloc d'affichage sous les deux autres ; le champ de recherche reste à droite, centré verticalement sur la bande.
- Tests : écran WebKit (nom, bulle, icône, état), parcours Playwright (une seule ligne, ordre, réduction de la recherche à 6 rem puis passage à la ligne, fenêtre étroite sans débordement ni chevauchement, boutons actifs) et scénario de l'essai de l'application réelle, qui mesure les rectangles réels et le pointeur reçu par chacune des dix-sept icônes.
