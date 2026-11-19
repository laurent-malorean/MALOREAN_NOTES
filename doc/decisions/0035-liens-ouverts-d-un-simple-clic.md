# 0035 — Liens ouverts d'un simple clic ; les adresses web s'ouvrent dans le navigateur

- **Date** : 2026-11-19
- **Statut** : acceptée
- **Remplace** en partie les fiches 0013 et 0016 (ouverture par Cmd+clic seulement) et précise la fiche 0033 (« Ouvrir le lien »).

## Contexte

Il fallait Cmd+clic pour ouvrir un lien de la note : lien entre notes, pièce jointe, adresse. L'utilisateur veut, comme dans Obsidian, qu'un simple clic sur un lien l'ouvre (vu le 19/11). Par ailleurs, un lien Markdown vers une adresse web n'ouvrait rien : Rust n'acceptait que les pièces jointes de la note et répondait « n'est pas une pièce jointe de la note ».

## Décision

- **Un simple clic sur le texte montré d'un lien l'ouvre**, au relâchement du bouton, sans placer le curseur dans le lien : lien entre notes (`[[titre]]`, `[[titre|texte]]`), lien Markdown (`[texte](cible)`), adresse écrite telle quelle (`https://…`) ou entre `<…>`. Cmd+clic l'ouvre toujours, dès que le bouton s'enfonce.
- **Seul le texte montré compte** : la place est mesurée à l'écran (boîtes du texte du lien), pas seulement par la position la plus proche. Un clic juste à côté (après la fin de la ligne, avant le lien, au-dessus ou au-dessous du texte) place le curseur, comme ailleurs ; c'est ainsi, puis avec les flèches, qu'on modifie le texte d'un lien. Sur l'adresse visible d'un lien Markdown en cours d'écriture, un clic place aussi le curseur.
- **Un clic qui glisse sélectionne** : si la souris bouge de plus de 4 pixels bouton enfoncé (`DRAG_DISTANCE`), rien ne s'ouvre ; l'éditeur prend le focus et la sélection va du point de départ au pointeur, jusqu'au relâchement.
- Maj, Alt et Ctrl (et les autres boutons) gardent leur effet habituel dans l'éditeur ; une image dessinée ne s'ouvre pas d'un simple clic ; la définition d'une référence (`[ref]: adresse`) non plus.
- **Destination d'un lien décidée par Rust** : la commande `open_link_target` (qui remplace `open_attachment`) reçoit la note et la cible ; le cas d'usage `OpenLinkTarget` rend une adresse web (`WebAddress` du domaine : `http://`, `https://`, `mailto:`, sans espace ni caractère de contrôle), ouverte dans le navigateur du Mac, sinon une pièce jointe de la note, ouverte avec l'application du Mac ; toute autre cible est refusée avec un message. L'ouverture reste faite par Rust (`tauri-plugin-opener`) : la page n'a toujours aucun droit d'ouvrir quoi que ce soit.

## Conséquences

- Les tests d'écran mesurent les positions dans WebKit (clic au milieu du texte, à 3 pixels à côté, glissement de 4 et de 5 pixels) ; un parcours vérifie le clic, le glissement et l'ouverture d'une pièce jointe et d'une adresse web.
- « Ouvrir le lien » (menu Fichier, palette) reste pour un lien où le curseur est déjà, entré avec les flèches.
