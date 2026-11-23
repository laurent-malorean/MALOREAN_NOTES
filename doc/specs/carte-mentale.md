# Carte mentale

Spécification fonctionnelle, validée par l'utilisateur le 23/11. Ce document se lit seul : tout ce qu'il faut pour réaliser la fonction est ici.

## 1. Vocabulaire

| Mot | Sens |
|---|---|
| Note | Un fichier `.md` de l'espace de travail. |
| Carte mentale | Une note dont l'en-tête porte `type: carte-mentale`, montrée en carte plutôt qu'en texte. Se dit toujours en entier : « carte » seule désignera plus tard la carte d'un kanban. |
| Nœud | Une idée de la carte : un titre, un détail et une couleur facultatifs, des enfants. |
| Nœud racine | Un nœud sans parent. Une carte en a autant qu'on veut, chacun posé librement. À ne pas confondre avec la racine, le dossier de l'espace de travail. |
| Enfant, parent, frère | Un enfant est un nœud rangé sous un autre, son parent. Deux nœuds de même parent sont frères. Les nœuds racines sont frères entre eux. |
| Branche | Un nœud avec tous ses descendants. |
| Branche pliée | Une branche dont les descendants sont cachés. |
| Détail | Le texte facultatif d'un nœud, sous son titre, sur plusieurs lignes. Jamais appelé « note ». |
| Couleur de nœud | Facultative : l'une des 10 couleurs de la palette (§ 3). |
| Place des nœuds racines | La position de chaque nœud racine sur la carte. |
| Chemin d'un nœud | Sa position dans l'arbre : les rangs depuis 0, séparés par des points. `0` est le premier nœud racine, `0.1` le deuxième enfant de ce nœud, `1.0.2` le troisième enfant du premier enfant du deuxième nœud racine. |
| Point | L'unité des tailles de la carte : un pixel de l'écran quand le zoom est à 100 %. |
| Ligne hors format | Une ligne du fichier qui n'a pas sa place dans le format imposé (§ 4). |

## 2. Principes

- Une carte mentale est une note. Elle a donc tout ce qu'a une note dans l'application :
  - un titre (son premier titre `#`) et un nom de fichier qui en découle ;
  - renommage, déplacement, mise à la corbeille ;
  - étiquettes, épinglage ;
  - notes récentes, liens entrants, historique des versions ;
  - synchronisation par iCloud.
- Le fichier reste du Markdown ordinaire : lisible et modifiable à la main, dans Obsidian ou par Claude.
- Rien de ce que l'utilisateur a écrit dans le fichier n'est perdu quand la carte enregistre, sauf les exceptions nommées au § 4.

## 3. Palette des couleurs

Elle est la même en thème clair et en thème sombre.

| Nom (dans le fichier et à l'écran) | Valeur |
|---|---|
| rouge | `#dc2626` |
| orange | `#f97316` |
| jaune | `#e3c400` |
| vert | `#22a447` |
| turquoise | `#14b8b0` |
| bleu | `#2563eb` |
| violet | `#9333ea` |
| rose | `#ec6aa8` |
| marron | `#92643a` |
| ardoise | `#64748b` |

Ordre de la palette dans les menus : celui du tableau.

Rendu d'un nœud coloré :
- **Bordure** : la couleur elle-même.
- **Fond** : un mélange de 18 % de la couleur et de 82 % du fond de la carte. Dans les deux thèmes, c'est donc une teinte légère de la couleur sur le fond du thème.
- **Texte** : la couleur du texte du thème, inchangée.
- **Halo quand le nœud est choisi** : 2 points de la couleur, à 35 % d'opacité.

Un nœud sans couleur prend le fond des panneaux latéraux du thème, la bordure du thème et la couleur du texte du thème.

## 4. Format du fichier

### 4.1 Exemple complet

```markdown
---
type: carte-mentale
tags: [projet, 2027]
racines: [{x: 0, y: 0}, {x: 40.5, y: 320}]
---
# Lancement du produit

- Clients <!-- couleur: bleu -->
  - Artisans
    > Premiers essais en janvier.
    >
    > - appeler **Martin**
    > - envoyer la plaquette
    - Plombiers
    - Électriciens <!-- couleur: vert -->
  - [[Grands comptes]]
- Calendrier <!-- couleur: orange -->
  - Bêta *fermée*
  - Lancement public
```

Cette carte a deux nœuds racines, « Clients » (chemin `0`) et « Calendrier » (chemin `1`).
- « Artisans » (`0.0`) a un détail de quatre lignes, la deuxième vide, et deux enfants.
- « [[Grands comptes]] » (`0.1`) est un lien vers une note.

### 4.2 Les parties du fichier, dans l'ordre

Le format est imposé : un fichier de carte mentale ne contient que ces trois parties, dans cet ordre.

1. **L'en-tête** : un bloc YAML entre deux lignes `---`, tout en haut.
2. **Le titre** : une ligne `# …`.
3. **La liste de la carte** : des puces et des lignes de détail (§ 4.4), séparées du titre par une ligne vide.

Règles :
- Aucun autre texte : ni paragraphe, ni autre titre, ni tableau, ni bloc de code, ni deuxième liste.
- Une carte sans titre `#` s'affiche sous le nom de son fichier, sans `.md`.
- Une ligne hors format (écrite à la main, dans Obsidian ou par Claude) : voir § 4.6.

### 4.3 L'en-tête

**`type`** dit que la note est une carte mentale.
- Valeur `carte-mentale`.
- Seule compte la première propriété `type:` au premier niveau de l'en-tête.
- Sans elle, ou avec une autre valeur, la note est une note ordinaire.

**`racines`** donne la place des nœuds racines. Elle est tenue par l'application, qui la réécrit à chaque enregistrement fait par la carte.
- C'est une liste de positions `{x: …, y: …}`, une par nœud racine, dans l'ordre des nœuds racines de la liste.
- `x` et `y` sont en points. Ils donnent le coin haut gauche du nœud racine, et `y` croît vers le bas.
- Elles sont écrites sans décimale quand elles sont entières, sinon arrondies au dixième (`40.5`), sur une seule ligne, comme dans l'exemple.

**Toutes les autres propriétés** (`tags`, épinglage, propriétés libres…) sont gardées telles quelles, à leur place, quand la carte enregistre.

Lecture de `racines` :

| Cas | Effet |
|---|---|
| Absente, vide, ou pas une liste | Chaque nœud racine prend la place par défaut : x = 0, y = rang × 160 (le premier nœud racine est au rang 0). |
| Une position qui n'est pas un objet `{x, y}` | Ce nœud racine prend la place par défaut. |
| `x` ou `y` absent, ou qui n'est pas un nombre | Cette valeur prend sa valeur par défaut (x = 0, y = rang × 160). |
| Plus de positions que de nœuds racines | Les positions en trop sont ignorées, puis retirées au prochain enregistrement. |
| Moins de positions que de nœuds racines | Les nœuds racines sans position prennent la place par défaut. |

### 4.4 La liste de la carte

**Une puce est un nœud.**
- Une puce est une ligne qui commence, après son retrait, par `-`, `*` ou `+`, puis un espace ou une tabulation, puis un texte qui n'est pas fait que d'espaces.
- L'application écrit toujours `-` suivi d'un espace.

**La profondeur vient du retrait.**
- Une puce sans retrait est un nœud racine.
- Une puce dont le retrait est plus grand que celui de la puce du dessus est son enfant.
- Sinon, la puce est l'enfant du dernier nœud au-dessus d'elle dont le retrait est plus petit que le sien. S'il n'y en a pas, c'est un nœud racine.
- Le retrait compte les espaces de tête ; une tabulation vaut 4 espaces. Le nombre d'espaces par niveau n'est pas imposé : seuls les retraits comparés entre eux comptent.
- L'application écrit 2 espaces par niveau.

**Le début et la fin de la liste.**
- Elle commence à la première puce après le titre et va jusqu'à la fin du fichier.
- Les lignes vides à l'intérieur de la liste ne la coupent pas.
- L'application écrit la liste sans ligne vide.

**Le titre d'un nœud.**
- C'est le texte de la puce, sans son commentaire de couleur. Les espaces de début et de fin sont retirés.
- Il tient sur une ligne et accepte le Markdown de ligne : gras, italique, code, barré, liens `[texte](adresse)`, liens entre notes `[[titre]]` et `[[titre|texte]]`.
- Une case à cocher (`- [ ] …`) ou un `#` en tête restent du texte du titre, affichés tels quels.
- Une puce sans texte n'est pas un nœud : elle disparaît au premier enregistrement fait par la carte.

**Le détail d'un nœud.**
- Une ligne de détail est une ligne qui commence, après son retrait, par `>`. Son texte est ce qui suit le `>` et un éventuel espace.
- Elle appartient au dernier nœud au-dessus d'elle dont le retrait est plus petit que le sien. Une ligne de détail qui n'appartient à aucun nœud est hors format (§ 4.6).
- Les lignes de détail d'un même nœud se suivent dans l'ordre. Une ligne `>` sans texte est une ligne vide du détail.
- Le détail accepte tout le Markdown : listes, gras, code, liens, liens entre notes.
- L'application l'écrit juste sous la puce, avant les enfants, au retrait des enfants. Chaque ligne commence par `> ` ; une ligne vide s'écrit `>`.

**La couleur d'un nœud.**
- C'est un commentaire HTML au bout de la puce, après le titre : `<!-- couleur: rouge -->`.
- À la lecture, les espaces autour de `couleur`, du `:` et du nom ne comptent pas, ni les majuscules.
- Un nom de la palette donne cette couleur.
- Tout autre nom se lit « sans couleur », et le commentaire disparaît au prochain enregistrement fait par la carte.
- L'application écrit ` <!-- couleur: nom -->` : un espace avant, le nom en minuscules.

### 4.5 Ce que l'application change en enregistrant

- Seulement la liste de la carte et la propriété `racines`.
- Restent identiques octet pour octet : le reste de l'en-tête et le titre.
- Le fichier finit par un seul retour à la ligne.
- Un fichier qui suit déjà l'écriture de l'application et que la carte réenregistre sans changement reste identique octet pour octet.

### 4.6 Lignes hors format

- Une ligne hors format est ignorée à la lecture : elle n'est pas montrée sur la carte.
- Elle disparaît du fichier au premier enregistrement fait par la carte, sans message.
- L'historique des versions garde le fichier tel qu'il était avant cet enregistrement.
- C'est le cas, entre autres, d'un paragraphe, d'un autre titre, d'un tableau, d'un bloc de code, et d'une ligne en retrait dans la liste qui n'est ni une puce ni une ligne de détail.

## 5. Créer une carte mentale

**Par le clic droit**, sur un dossier ou sur la racine dans la liste des dossiers. Le menu propose, dans cet ordre :
- « Nouvelle note » ;
- « Nouvelle carte mentale » ;
- « Nouveau cahier de recherche » ;
- puis les types à venir.

La carte est créée dans le dossier cliqué.

**Par la palette et le menu Fichier** : « Nouvelle carte mentale ». La carte est créée dans le dossier affiché.

**Ce qui est créé** :
- La commande demande d'abord le nom de la carte ; un nom vide est refusé, Échap annule.
- Le fichier contient l'en-tête `type: carte-mentale` et la ligne `# Nom donné`, sans liste.
- Son nom de fichier suit les règles de toute note : le nom en kebab-case, puis `-2`, `-3`… s'il est pris.
- La carte s'ouvre dans la colonne active.


## 6. Ouvrir et afficher

### 6.1 Ouverture

- Une carte s'ouvre dans un onglet d'une colonne d'édition, comme une note. À la place de l'éditeur de texte, la colonne montre la carte, qui en occupe toute la surface.
- Le titre est celui de l'onglet. On renomme une carte comme une note.
- Une carte sans nœud affiche au centre, en couleur atténuée : « Double-cliquez pour ajouter une idée. »
- À l'ouverture, la vue est cadrée sur toute la carte (§ 6.4).

### 6.2 Un nœud

- **Boîte** : marges intérieures de 6 points en haut et en bas, 12 à gauche et à droite ; coins arrondis de 8 points ; bordure de 1 point, ou 3 pour un nœud racine.
- **Titre** :
  - police sans empattement du système, en gras pour un nœud racine ;
  - Markdown mis en forme ;
  - liens cliquables : un clic sur un lien entre notes ouvre la note ; un lien vers une note absente est montré comme dans une note.
- **Taille du texte selon le niveau** (le niveau 1 est celui des nœuds racines) :

  | Niveau | Taille du titre |
  |---|---|
  | 1 | 19,2 points |
  | 2 | 16 points |
  | 3 | 12,8 points |
  | 4 et au-delà | 10,24 points |

- **Détail** :
  - 4 points sous le titre ;
  - texte à 85 % de la taille du titre, en couleur atténuée du thème, jamais en gras ;
  - Markdown mis en forme, liens cliquables ;
  - au plus 40 caractères par ligne, retour à la ligne automatique.
- **Largeur** :
  - au moins 10 caractères à la taille de son titre, plus ses marges ;
  - tous les nœuds d'un même niveau, dans l'arbre d'un même nœud racine, ont la largeur du plus large d'entre eux ;
  - un nœud plus haut que large ÷ 2,5 est élargi, tant que cela réduit sa hauteur, jusqu'à 800 points au plus.
- **Couleur** : voir § 3.
- **Choisi** : bordure de la couleur du texte du thème et halo de 2 points (de sa couleur s'il en a une, sinon de la couleur de sélection du thème).

### 6.3 Disposition

- **Nœuds racines** : chacun à sa place (§ 4.3).
- **Enfants** : rangés à droite de leur parent, de haut en bas dans l'ordre du fichier.
- **Hauteur d'une branche** : le plus grand de deux nombres, la hauteur du nœud ou la somme des hauteurs des branches de ses enfants affichés et des écarts entre elles.
- **Centrage** : les enfants d'un nœud, pris ensemble, sont centrés verticalement sur le centre de leur parent.
- **Écart vertical entre deux frères** : 12 points, ou 20 si l'un des deux a un détail.
- **Colonnes** : dans l'arbre d'un nœud racine, tous les nœuds d'un même niveau ont le même bord gauche.
- **Écart horizontal entre un niveau et le suivant**, dans l'arbre d'un nœud racine : 30 % du plus grand écart vertical entre le centre d'un nœud de ce niveau et le centre d'un de ses enfants. Cet écart vaut au moins 48 points et au plus 200.
- **Liens** :
  - une courbe de 1,5 point d'épaisseur, en couleur atténuée du thème ;
  - elle part du milieu du bord droit du parent et arrive au milieu du bord gauche de l'enfant ;
  - à l'horizontale aux deux bouts.
- **Une branche pliée** ne montre que son nœud : ses descendants ne prennent aucune place.

### 6.4 Vue

| Geste | Effet |
|---|---|
| Glisser le fond | Déplace la vue |
| Défiler à deux doigts ou à la molette | Déplace la vue |
| Cmd + molette, ou pincer le trackpad | Zoome autour du pointeur |
| Bouton « + » / « − » | Zoome ×1,2 / ÷1,2 autour du centre de la vue |
| Bouton « Tout afficher » | Cadre toute la carte |

- **Zoom** : de 20 % à 300 %.
- **Cadrage** : la carte entière tient dans la vue, avec 40 points de marge, centrée, et le zoom n'y dépasse pas 150 %.
- **Boutons** : « − », « + » et « Tout afficher » sont en bas à droite de la vue.

### 6.5 Branches pliées

- Un nœud qui a des enfants porte un bouton de pliage, à cheval sur le milieu de son bord droit.
  - Le bouton est arrondi, de 20 points de haut et d'au moins 20 de large, avec un texte de 11 points en couleur atténuée.
  - Il affiche « − » quand la branche est dépliée.
  - Il affiche « +N » quand elle est pliée, N étant le nombre de descendants cachés.
- Un clic sur le bouton plie ou déplie la branche.
- Les branches pliées sont gardées sur ce Mac seulement, pour chaque carte, d'un lancement à l'autre. Elles ne vont jamais dans le fichier.

## 7. Modifier

### 7.1 Au clavier

| Situation | Touche | Effet |
|---|---|---|
| Nœud choisi | Tab | Ajoute un dernier enfant, en saisie ; déplie la branche si elle est pliée |
| Nœud choisi | Entrée | Ajoute un frère juste en dessous, en saisie ; pour un nœud racine, un nœud racine posé sous le bas de sa branche |
| Nœud choisi | F2 | Modifie son texte |
| Nœud choisi | Suppr ou Retour arrière | Supprime sa branche ; demande confirmation s'il a des descendants |
| Nœud choisi | ← | Choisit son parent ; sur un nœud racine, rien |
| Nœud choisi | → | Choisit son premier enfant, en dépliant la branche si elle est pliée ; sans enfant, rien |
| Nœud choisi | ↑ / ↓ | Choisit le frère du dessus / du dessous, dans l'ordre du fichier ; au bout, rien |
| Nœud choisi | Échap | Le désélectionne |
| En saisie | Entrée | Valide |
| En saisie | Maj+Entrée | Va à la ligne : la première ligne est le titre, les suivantes forment le détail |
| En saisie | Tab | Valide, puis ajoute un dernier enfant en saisie |
| En saisie | Échap | Annule ; un nœud neuf est retiré |
| Partout | Cmd+Z | Annule le dernier changement ; en saisie, n'annule que le texte tapé |
| Partout | Cmd+Maj+Z | Rétablit le dernier changement annulé |

Règles :
- **Saisie** : un champ de saisie remplace le nœud. Il contient le titre, puis le détail sur les lignes suivantes.
- **Titre vide** : valider une première ligne vide est refusé ; le nœud reste en saisie.
- **Choisir un nœud** le rend visible : la vue se déplace si besoin.
- **Annulation** : 50 changements au plus. Un changement venu d'ailleurs vide l'historique d'annulation et de rétablissement.

### 7.2 À la souris

- **Clic sur un nœud** : le choisit.
- **Clic sur le fond** : désélectionne.
- **Double-clic sur le fond** : crée un nœud racine dont le coin haut gauche est sous le pointeur, en saisie.
- **Double-clic sur un nœud** : le modifie.
- **Clic droit sur un nœud** : le choisit et ouvre un menu.
  - Les 10 couleurs : une pastille et un nom chacune, la couleur actuelle cochée.
  - « Sans couleur ».
  - Un séparateur.
  - « Ajouter un enfant ».
  - « Ajouter un frère ».
  - « Modifier ».
  - « Supprimer ».
- **Clic droit sur le fond** : rien.

**Glisser un nœud** : le geste commence après 4 points de mouvement. Le nœud et sa branche suivent le pointeur, à demi transparents. Au dépôt :

| Dépôt | Effet |
|---|---|
| Sur la moitié centrale d'un autre nœud | Il devient son dernier enfant ; la cible est surlignée pendant le geste |
| Sur le quart haut / bas d'un autre nœud | Il devient son frère, juste au-dessus / en dessous ; un trait au-dessus / en dessous de la cible le montre pendant le geste |
| Sur le fond | Il devient un nœud racine, posé là où il est lâché ; il garde son détail, sa couleur et ses enfants |
| Sur un nœud de sa propre branche | Refusé : rien ne change |
| Un nœud racine sur le fond | Il est seulement déplacé sur la carte |

Chaque action de la carte se lance aussi sans clavier, par le clic droit.

## 8. Enregistrer et changements venus d'ailleurs

- **Quand** : la carte est enregistrée aussitôt après chaque changement : ajout, saisie validée, suppression, déplacement, couleur, place d'un nœud racine. Plier ou déplier n'enregistre rien.
- **Historique des versions** : celui de toute note.
- **Changement venu d'ailleurs** (Claude, Obsidian, iCloud, la même carte dans une autre colonne) : une carte ouverte se met à jour aussitôt. Pendant une saisie, la mise à jour attend la fin de la saisie.
- **Conflit** : un changement fait sur une version que le fichier a dépassée est refait sur la nouvelle version.
  - Titre, détail, couleur : appliqués au même nœud s'il existe encore ; sinon, abandonnés.
  - Ajout : refait sous le même parent s'il existe encore ; sinon, en nœud racine.
  - Suppression : refaite si le nœud existe encore.
  - Déplacement : refait si le nœud et sa cible existent encore ; sinon, abandonné.
  - Quand un changement est abandonné, la carte est rechargée et le message « La carte est rechargée. » s'affiche.
- **Erreur d'écriture** : un message le dit, et le changement est retenté à l'enregistrement suivant.
- **Type retiré** : si le fichier n'a plus `type: carte-mentale`, l'onglet le montre comme une note ordinaire.

## 9. Recherche

**Chaque nœud est un résultat à lui seul**, rangé dans l'index avec sa carte comme conteneur. Le résultat montre :
- le titre du nœud ;
- le dossier de la carte ;
- « Nœud · *titre de la carte* », discret ;
- un extrait pris dans son titre ou son détail.

Ce qui le trouve : les mots de son titre et de son détail. Un clic ouvre la carte, avec le nœud choisi, ses ancêtres dépliés et la vue centrée sur lui.

**La carte elle-même** est aussi un résultat, de type « Carte mentale ». Ce qui la trouve : son titre et ses étiquettes.

**Recherche par le sens** :
- Chaque nœud donne un segment : son titre, puis son détail.
- Le segment garde le titre de la carte.
- Un résultat ouvre la carte sur le nœud, comme ci-dessus.

**Liens entre notes** : un `[[titre]]` dans le titre ou le détail d'un nœud est un lien de la carte. La note désignée montre la carte dans ses liens entrants.

**Lien vers une carte** : depuis n'importe quelle note, `[[titre de la carte]]` désigne la carte, avec les mêmes règles qu'un lien vers une note. Un clic sur ce lien ouvre la carte en carte, jamais son fichier en texte. La carte montre la note dans ses liens entrants.

**Étiquettes** : celles de l'en-tête valent pour la carte. Le filtre par étiquette la montre.

## 10. Claude

**Un outil de l'application, « créer une carte mentale »** :
- Il prend le dossier (la racine par défaut), le titre et, en option, le contenu de départ : une liste à puces au format du § 4.4.
- Il crée le fichier selon les règles de nom et rend son chemin.
- Comme les autres outils qui changent une note, il attend l'accord de l'utilisateur quand Claude a lu le web pendant la réponse.

**Lire et modifier une carte** : Claude lit et écrit le fichier avec ses outils de fichiers, comme pour une note. Une carte ouverte se met à jour en direct.

**Consigne donnée à Claude** sur les cartes mentales : le format du § 4 en bref, n'écrire dans la liste que des puces et des lignes de détail, ne jamais toucher à `racines`.

**Recherche dans l'index** : elle rend aussi les nœuds, avec le chemin du fichier de leur carte et le chemin du nœud.

**« Montrer une note »** sur une carte l'ouvre en carte.

## 11. Hors de cette version

- Branches des deux côtés d'un nœud racine.
- Recherche dans la carte ouverte.
- Passage liste ↔ carte : voir et modifier la carte en texte dans l'éditeur.
- Export en image.
- Icônes, étiquettes ou dates sur un nœud.
