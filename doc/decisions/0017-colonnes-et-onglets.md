# 0017 — Colonnes et onglets : un état pur dans l'interface, un éditeur par colonne

- **Date** : 2026-11-17
- **Statut** : acceptée

## Contexte

On veut voir une note pendant qu'on en écrit une autre, comme dans Obsidian : jusqu'à trois colonnes d'édition côte à côte, de largeur réglable, chacune avec ses onglets. Beaucoup de fonctions viendront se brancher dessus : menu contextuel, Cmd+clic, glisser un onglet, raccourcis, même note dans deux colonnes, renommage, retour des colonnes au relancement. L'application n'avait jusqu'ici qu'un éditeur et une note ouverte ; la recherche dans la note, le plan, le bandeau, les modes focus et machine à écrire, les liens, les modifications externes et l'enregistrement automatique supposaient cet éditeur unique.

## Décision

- **Les colonnes sont un état d'écran pur**, dans l'interface (`ui/src/state/columns.ts`) : une valeur immuable — les colonnes de gauche à droite, leurs onglets, leurs largeurs, la colonne active — et des fonctions qui rendent la valeur suivante (`noteOpened`, `columnSplit`, `columnsResized`, `tabActivated`…). Aucune règle ne touche au disque : Rust n'en sait rien, comme pour le mode focus (fiche 0011). L'état est fait de données simples, prêtes à être gardées pour le relancement.
- **Colonnes et onglets ont un identifiant stable**, donné par l'état lui-même (un compteur) : une colonne garde son éditeur quand une autre apparaît ou disparaît, et un onglet se désigne sans ambiguïté même si la même note est ouverte deux fois.
- **Une largeur est une part** de la zone d'édition ; les parts font 1 au total. Diviser une colonne lui prend la moitié de sa part ; glisser un séparateur déplace de la part entre les deux voisines, sans descendre sous un minimum.
- **Un éditeur CodeMirror par colonne**, pas par onglet : changer d'onglet enregistre ce qui est tapé, puis relit la note sur le disque, comme changer de note jusqu'ici. Chaque colonne a son enregistrement automatique, son bandeau et ses liens entrants.
- **L'interface accorde l'écran à l'état** : après chaque changement d'état, chaque colonne qui ne montre pas la note de son onglet actif la charge. Ouvrir, fermer, renommer se réduisent donc à « calculer l'état suivant ».
- **La colonne active** est celle où l'on a cliqué (ou tapé) en dernier. Ce qui vise « la note ouverte » vise son onglet actif : la note sélectionnée dans la liste, le plan, la recherche dans la note, Joindre, l'épinglage, la corbeille. Le plan est un seul panneau, à droite de la zone d'édition, que seul l'éditeur actif remplit. Les réglages (focus, machine à écrire, caractères par page) valent pour tous les éditeurs.
- **Ouvrir une note** depuis la liste, la recherche, l'ouverture rapide, un lien ou les liens entrants, ou créer une note, ajoute un onglet dans la colonne active, juste après l'onglet actif ; si la note y est déjà ouverte, son onglet devient actif. Choisir un dossier, mettre la note ouverte à la corbeille ou ouvrir la bibliothèque **remplace** la note de l'onglet actif, comme avant les onglets, pour ne pas multiplier les onglets sans le vouloir.
- **Le menu d'une note** (clic droit dans la liste ou sur un onglet) l'ouvre à un emplacement : « Ouvrir dans un nouvel onglet » ajoute toujours un onglet à la colonne active, juste après l'onglet actif, même si la note y est déjà ; « Ouvrir à gauche » ou « à droite » l'ouvre dans la colonne voisine de ce côté (comme un clic dans la liste : son onglet y est retrouvé s'il existe), qui devient active ; sans voisine, une colonne s'ouvre de ce côté avec la moitié de la largeur de la colonne active, et, à trois colonnes, la note prend un nouvel onglet de la colonne active. Depuis un onglet, tout part de la colonne de l'onglet. « Fermer » ferme l'onglet cliqué, ou, depuis la liste, l'onglet de la note dans la colonne active. Un nouvel onglet prend le titre de la note si un autre onglet le connaît : la colonne qui montre déjà la note ne la relit pas.
- **Cmd+clic sur une note**, dans la liste ou dans les résultats de recherche, fait comme « Ouvrir dans un nouvel onglet » ; un simple clic retrouve l'onglet de la note s'il existe.
- **Fermer le dernier onglet d'une colonne ferme la colonne** : ses voisines se partagent sa largeur (une seule voisine la prend toute) ; si elle était active, sa voisine de droite, sinon de gauche, le devient. La dernière colonne reste, vide. Une note mise à la corbeille ferme ses onglets sans fermer leur colonne.
- **Glisser un onglet** le déplace : lâché dans une colonne, il s'y place avant l'onglet survolé de la barre (sinon à la fin), y devient actif, et la colonne devient active ; lâché dans le quart gauche ou droit d'une colonne, une colonne s'ouvre de ce côté pour lui, avec la moitié de sa largeur — à trois colonnes, ce bord reçoit l'onglet comme le milieu. La colonne qu'il quitte se ferme si elle n'a plus d'onglet. Ce qui est tapé est enregistré avant, pour que la colonne qui reçoit la note la lise à jour. La colonne prend le glissement avant son éditeur, qui y verrait du texte à insérer.
- **Le titre d'un onglet** vient de Rust : la lecture et l'enregistrement d'une note rendent aussi son titre affiché, que l'interface ne recalcule pas.

## Conséquences

- L'état se teste sans navigateur, cas par cas ; les fonctions à venir (raccourcis, relancement) n'ont qu'à ajouter une transition et son test.
- Un onglet qui n'est pas affiché ne garde ni la position du curseur ni l'historique d'annulation : ils sont perdus au changement d'onglet. Garder un état d'éditeur par onglet pourra venir ensuite.
- La même note ouverte dans deux colonnes a deux enregistrements automatiques ; les garder identiques pendant la frappe est une étape suivante.
- Les colonnes ne sont pas encore gardées d'un lancement à l'autre.
