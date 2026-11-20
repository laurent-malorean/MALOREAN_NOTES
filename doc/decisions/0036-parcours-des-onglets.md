# 0036 — Parcours des onglets : « ← » et « → » ramènent à la note d'avant ou d'après

- **Date** : 2026-11-20
- **Statut** : acceptée
- **Complète** la fiche 0017 (colonnes et onglets) et la fiche 0035 (liens ouverts d'un simple clic).

## Contexte

Demande du 19/11 : quand on ouvre une note par un lien, pouvoir revenir à la note d'où l'on vient, à la même position, par une flèche « ← » en haut à gauche de la note, et repartir en avant par « → » après un retour ; un historique propre à chaque onglet, comme un navigateur. Jusque-là, un lien suivi ouvrait la note dans un nouvel onglet (ou retrouvait le sien) : il n'y avait rien à quoi revenir.

## Décision

- **Suivre un lien montre la note dans l'onglet actif**, à la place de la sienne, comme un navigateur ou Obsidian : un simple clic sur un lien entre notes, ou « Ouvrir le lien ». Cmd+clic garde l'ancien comportement : nouvel onglet, ou celui de la note s'il existe.
- **Parcours d'un onglet** (`Trail`, `ui/src/state/trail.ts`) : les notes montrées avant la sienne et, après un retour, celles d'après, chacune avec la position où on l'a quittée (`NotePosition` : sélection, première ligne visible et décalage en pixels). Il s'allonge à chaque changement de note de l'onglet : lien suivi, ou note choisie dans une liste (dossier, récentes, étiquette), qui remplaçait déjà la note de l'onglet ; un nouveau pas efface les notes d'après. Il est porté par l'onglet dans l'état pur des colonnes : il suit les renommages, oublie les notes jetées, part avec l'onglet glissé, est copié par « Diviser ». Il n'est pas gardé au relancement (la disposition gardée ne garde que les chemins).
- **Flèches** : « ← » (« Revenir à la note précédente ») et « → » (« Aller à la note suivante »), en tête de la colonne, devant ses onglets. Elles n'apparaissent que si l'onglet actif a un parcours ; celle qui ne mène nulle part est alors grisée, pour que « ← » ne change pas de place. Choisi ainsi pour ne pas encombrer chaque colonne de flèches inutiles la plupart du temps, tout en suivant l'usage des menus de l'application, qui grisent ce qui n'est pas possible.
- **Retour à la position** : la note revient avec sa sélection et la même ligne en haut de l'écran, au même décalage (CodeMirror `scrollIntoView` sur la ligne, plus robuste qu'un nombre de pixels quand des lignes plus loin ne sont pas encore mesurées) ; puis l'éditeur reprend le focus, prêt à la frappe. Une note raccourcie entre-temps borne la position à sa fin.
- **Pas de raccourci clavier** (fiche 0033 : tout se fait à la souris ; aucun raccourci n'est choisi sans l'utilisateur). Cmd+[ et Cmd+] (comme Safari et Obsidian) sont proposés, à valider.

## Conséquences

- Un lien suivi ne multiplie plus les onglets ; pour garder les deux notes ouvertes, Cmd+clic.
- Les tests mesurent dans WebKit la position retrouvée (défilement au pixel près, sélection) ; un parcours vérifie le clic sur un lien, le retour au même défilement et au même curseur, puis l'avance.
