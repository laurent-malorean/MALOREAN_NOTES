# 0011 — Mode focus : calculé dans l'éditeur, réglage gardé par la page

- **Date** : 2026-11-16
- **Statut** : acceptée

## Contexte

Le mode focus estompe tout sauf la phrase ou le paragraphe en cours, comme iA Writer. Il faut trouver ce passage à chaque mouvement du curseur, et se souvenir du réglage d'un lancement à l'autre.

## Décision

- Le passage est calculé par une fonction pure de l'interface, à partir du texte et de la position du curseur ; une extension CodeMirror estompe le reste. Rien ne passe par Rust : c'est de l'affichage, recalculé à chaque frappe.
- Phrase : elle finit à `.`, `!`, `?` ou `…` suivis d'une espace (guillemets et parenthèses fermants compris), sauf après une initiale ou une abréviation courante (M., Mme, p., cf.…), et toujours au retour à la ligne, même sans ponctuation.
- Paragraphe : la ligne du curseur. Un retour à la ligne termine le bloc, même sans ligne vide : des lignes qui se suivent forment un seul paragraphe Markdown, mais les mettre toutes en avant laissait en clair des lignes loin au-dessus du curseur. Un titre, un élément de liste, une tâche ou une ligne de citation est donc un bloc à lui seul.
- Un bouton et Cmd+Maj+F passent d'arrêté à phrase, paragraphe, puis arrêté.
- Le réglage est gardé dans le stockage de la page (`localStorage`), pas dans les préférences Rust : c'est un confort d'affichage, sans conséquence sur les notes. S'il est refusé, le mode marche jusqu'à la fermeture.

## Conséquences

- Le réglage « Focus : paragraphe » met en avant une ligne, pas un paragraphe Markdown ; une ligne longue, repliée à l'écran, reste un seul bloc.
- Aucun aller-retour avec Rust pendant la frappe.
- Le réglage est perdu si le stockage de la page est effacé ; on le rebascule d'un clic.
- La détection de phrase reste approximative (abréviation inconnue, phrase sans espace après le point).
- Le choix des panneaux latéraux suit la même règle de stockage : voir la fiche 0018.
