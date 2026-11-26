# 0094 : le focus à l'ouverture des réglages

## Contexte

La fenêtre des réglages s'ouvre sur le dernier onglet utilisé. La fenêtre modale donne le focus à son premier
élément focalisable, le premier onglet (« Affichage »), et WebKit y dessine l'anneau de focus : un cadre bleu autour
d'un onglet qui n'est pas l'onglet ouvert. L'utilisateur l'a signalé (« ce carré n'a rien à faire là »).

## Décision

- **Le focus d'ouverture va à la fenêtre elle-même** (`tabindex="-1"`, `focus()` juste après `showModal()`), sans
  cadre (`.settings:focus { outline: none }`) : ce n'est pas un contrôle, il n'y a rien à mettre en avant.
- **Le premier Tab va à l'onglet ouvert** : les onglets non ouverts ont `tabindex="-1"`, seul l'onglet ouvert est dans
  l'ordre de Tab. Les flèches, Début et Fin changent d'onglet depuis là ; Tab suivant entre dans le contenu ; Échap ferme.
- **Choix écarté** : donner le focus à l'onglet ouvert à l'ouverture. Le cadre y serait revenu, sur le bon onglet mais
  toujours à l'ouverture à la souris.
- **L'anneau de focus au clavier n'est jamais retiré** : seul le focus de la fenêtre est sans cadre ; onglets, champs
  et boutons gardent celui de WebKit.

## Autres fenêtres regardées, rien à changer

- Confirmation, À propos, Historique : le bouton d'action prend le focus exprès.
- Saisie d'un nom : le champ prend le focus et son texte est sélectionné, exprès.
- Fenêtre de choix et fenêtre de recherche : le champ de saisie prend le focus.
- Proposition d'écriture : « Annuler » pendant l'attente, puis « Remplacer » ; le focus suit l'action possible.
- Action du CRM : le focus va au panneau (sans cadre, mesuré) ou au titre d'une nouvelle action.

## Contrôles

Tests d'écran (`settings-view.browser.test.ts`) : à l'ouverture sur « Claude », l'élément actif est la fenêtre,
aucun onglet n'est en `:focus-visible`, le premier Tab arrive sur l'onglet ouvert, puis dans le contenu ; les flèches
changent d'onglet ; Échap ferme ; « Fermer » reste dans l'ordre de Tab, prend le focus et ferme.
