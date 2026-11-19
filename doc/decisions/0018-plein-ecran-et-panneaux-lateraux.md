# 0018 — Plein écran et panneaux latéraux : deux réglages indépendants

- **Date** : 2026-11-17
- **Statut** : acceptée

## Contexte

Le plein écran cachait d'office les listes des dossiers et des notes. Avec les colonnes (fiche 0017), on veut souvent garder ces listes en plein écran pour passer d'une note à l'autre ; à l'inverse, on veut parfois les cacher sans quitter la fenêtre.

## Décision

- **Le plein écran ne change pas la disposition** : il agrandit la fenêtre, rien de plus. Les panneaux latéraux restent montrés ou cachés comme avant d'y entrer, et comme avant d'en sortir. Il vient du bouton, de Ctrl+Cmd+F, de la palette, ou du Mac (bouton vert, menu) ; la fenêtre fait foi.
- **Les panneaux latéraux** (listes des dossiers et des notes, ensemble) se cachent ou se montrent par un bouton, Cmd+0 (d'abord Ctrl+Cmd+S, voir plus bas) ou la palette, en plein écran comme en dehors. Les colonnes prennent alors toute la largeur, chacune gardant sa part.
- Leur choix est gardé dans le stockage de la page (`localStorage`), comme le mode focus (fiche 0011) : c'est un confort d'affichage. S'il est refusé, les panneaux sont montrés.
- Les deux réglages sont reliés à l'écran par un même module, `ui/src/screens/window-display.ts`, testé avec une fenêtre simulée.

## Conséquences

- Entrer en plein écran ne cache plus rien : qui veut seulement le texte cache aussi les panneaux (un clic ou Cmd+0), et ce choix tient au relancement.
- Cmd+0 est pris par l'application, choisi par l'utilisateur (comme « Afficher le navigateur » de Xcode). Révision du 19/11 : Ctrl+Cmd+S, choisi d'abord, est déjà pris par des logiciels de capture d'écran, qui prennent volontiers les Ctrl+Cmd+lettre ; Cmd+Maj+B, retenu quelques heures, a laissé la place au choix de l'utilisateur. Cmd+0 est libre dans l'application, dans l'éditeur (CodeMirror ne s'en sert pas) et dans la barre des menus. Sur un clavier AZERTY, Cmd+0 tape « à » : la page lit aussi les chiffres à leur touche physique, comme CodeMirror.
- On ne peut pas cacher une seule des deux listes.

## Révision du 19/11 : largeur des panneaux et de la colonne Claude Code

- La liste des dossiers et celle des notes changent de largeur quand on tire leur bord droit ; la colonne Claude Code (fiche 0032) quand on tire son bord gauche. Le bord s'éclaire au survol et montre le curseur de redimensionnement ; un double-clic rend la largeur par défaut. Tout se fait à la souris, sans raccourci (fiche 0033).
- Bornes dans le thème, les colonnes d'édition prenant le reste : panneaux latéraux entre 9rem et le plus petit de 28rem et 30 % de la fenêtre ; colonne Claude Code entre 16rem et le plus petit de 40rem et 35 % de la fenêtre (340 pixels par défaut). La largeur gardée est celle vraiment prise, pour que le bord reparte aussitôt quand le pointeur revient.
- Gardées dans le stockage de la page, comme le choix des panneaux, les mêmes pour tous les espaces de travail. Cacher les panneaux ou passer en plein écran ne les change pas ; la colonne Claude Code garde la sienne, masquée puis affichée.
- Un même module, `ui/src/screens/panel-edges.ts`, pose les trois bords.
