# Format de fichier : carte mentale

Ce document est la seule description du format de fichier d'une carte mentale. Il se lit seul : un développeur doit pouvoir lire et écrire une carte mentale avec un autre outil sans lire le code de l'application. Le comportement à l'écran (dessin, gestes, recherche) est dans la spécification de la fonction.

Une carte mentale est une note. Les règles communes à toute note ne sont pas redécrites ici :
- en-tête en général, titre, titre affiché, nom de fichier, liens entre notes, liens Markdown et pièces jointes : `doc/format/note.md` ;
- place des fichiers dans l'espace de travail, dossiers cachés, corbeille, historique : `doc/format/espace-de-travail.md`.

## 1. Vocabulaire

Mots de `doc/ontology.md`, employés ici dans ce sens seulement :
- **Carte mentale** : une note dont l'en-tête porte `type: carte-mentale`. Se dit toujours en entier.
- **Nœud** : une idée de la carte ; une puce du fichier.
- **Nœud racine** : un nœud sans parent, puce de premier niveau. Une carte en a autant qu'on veut. À ne pas confondre avec la racine (le dossier de l'espace de travail).
- **Enfant, parent, frère** : un enfant est un nœud rangé sous un autre, son parent ; deux nœuds de même parent sont frères, les nœuds racines entre eux.
- **Branche** : un nœud avec tous ses descendants.
- **Détail** : le texte facultatif d'un nœud, sous son titre, sur plusieurs lignes. Jamais appelé « note ».
- **Couleur de nœud** : facultative, l'une des 10 couleurs de la palette de couleurs.
- **Place des nœuds racines** : la position de chaque nœud racine sur la carte.
- **Chemin d'un nœud** : sa position dans l'arbre (§ 7).
- **Ligne hors format** : une ligne du fichier qui n'a pas sa place dans ce format (§ 8).
- **Point** : l'unité des positions ; un pixel de l'écran quand le zoom est à 100 %.

## 2. Vue d'ensemble

Le fichier est un fichier `.md` en UTF-8, fait de trois parties, dans cet ordre :
1. **l'en-tête** : un bloc YAML entre deux lignes `---`, tout en haut du fichier (§ 3) ;
2. **le titre** : une ligne `# …` (§ 4) ;
3. **la liste de la carte** : des puces (les nœuds) et des lignes de détail, séparée du titre par une ligne vide (§ 5).

Rien d'autre n'a sa place dans le fichier : ni paragraphe, ni autre titre, ni tableau, ni bloc de code, ni seconde liste. L'application tolère ces lignes à la lecture mais les retire au premier enregistrement fait par la carte (§ 8 et § 9).

Exemple minimal, tel que l'application crée une carte neuve (sans nœud, donc sans `racines`) :

```markdown
---
type: carte-mentale
---
# Idées
```

## 3. En-tête

L'en-tête suit les règles générales de `doc/format/note.md` : la première ligne du fichier est exactement `---`, et l'en-tête se termine à la première ligne suivante qui est exactement `---`. Sans en-tête fermé, la note n'est pas une carte mentale.

Deux clés concernent la carte ; toutes les autres sont gardées telles quelles.

### 3.1 `type`

- Valeur : `carte-mentale`, en minuscules, exactement.
- Seule compte la première clé `type` au premier niveau de l'en-tête (ligne qui commence par `type`, sans retrait).
- Tolérés : des espaces ou tabulations avant le `:` (`type :`), des guillemets simples ou doubles autour de la valeur (`type: "carte-mentale"`), un commentaire YAML après la valeur (`type: carte-mentale # mon idée`).
- Sans cette clé, ou avec une autre valeur (y compris `Carte-Mentale`), la note est une note ordinaire : la liste n'est pas lue comme une carte.

### 3.2 `racines`

La place des nœuds racines. Elle est tenue par l'application : un autre outil n'a pas à l'écrire ; s'il ajoute, retire ou réordonne des nœuds racines sans la toucher, les nœuds sans place valable prennent la place par défaut.

**Forme écrite par l'application** : une seule ligne, une liste YAML en ligne d'objets `{x: …, y: …}`, un par nœud racine, dans l'ordre des nœuds racines de la liste :

```yaml
racines: [{x: 0, y: 0}, {x: 40.5, y: 320}]
```

- `x` et `y` sont en points ; ils donnent le coin haut gauche du nœud racine ; `y` croît vers le bas. Négatifs permis.
- Un nombre entier s'écrit sans décimale (`320`), un autre est arrondi au dixième (`40.5`) ; une valeur qui s'arrondit à zéro s'écrit `0`.
- Séparateurs exacts : `{x: `, `, y: `, `}`, et `, ` entre deux objets.

**Place par défaut** du nœud racine de rang `r` (le premier a le rang 0) : `x = 0`, `y = r × 160`.

**Lecture** (ce que l'application accepte) :
- Seule la forme en ligne est lue : la valeur, après `racines:`, doit commencer par `[` et finir par `]` sur la même ligne, sans commentaire après. La première ligne qui commence par `racines` suivi d'un `:` compte.
- Une liste YAML écrite sur plusieurs lignes (`racines:` puis des lignes `- {x: 1, y: 2}`) n'est pas lue : tous les nœuds racines prennent la place par défaut.
- Clé absente, liste vide, ou valeur qui n'est pas une liste en ligne : place par défaut pour tous.
- Un élément qui n'est pas un objet `{…}` : place par défaut pour ce nœud racine.
- Dans un objet, les champs sont séparés par des virgules, chacun `nom: valeur` ; seuls `x` et `y` comptent (espaces ignorés, noms sans guillemets). Un champ absent ou dont la valeur n'est pas un nombre fini prend sa valeur par défaut ; si un champ apparaît deux fois, la première valeur valable compte.
- Les nombres s'écrivent comme en décimal ordinaire (`12`, `-3.5`, `1e3` aussi) ; une valeur entre guillemets n'est pas un nombre.
- Plus de positions que de nœuds racines : les positions en trop sont ignorées. Moins : les nœuds racines sans position prennent la place par défaut.

**Écriture** : voir § 9.

### 3.3 Autres clés

`tags`, `pinned` et toute clé libre sont gardées octet pour octet, à leur place, quand la carte enregistre. Les étiquettes et l'épinglage d'une carte suivent les règles de toute note (`doc/format/note.md`).

Aucune autre clé n'est propre à la carte : ni disposition, ni zoom, ni repli. **Les branches pliées ne sont jamais dans le fichier** : elles sont gardées sur le Mac de l'utilisateur seulement.

## 4. Titre

- Le titre est la première ligne qui commence par `# ` (un dièse, un espace, sans retrait), placée avant la première puce.
- Il est gardé octet pour octet (espaces de fin compris) quand la carte enregistre.
- Une carte sans titre `#` est permise ; son titre affiché suit les règles de toute note (`doc/format/note.md`).
- Une ligne `# …` placée après la première puce n'est pas le titre : c'est une ligne hors format.

## 5. Liste de la carte

### 5.1 Début et fin

- La liste commence à la première puce du contenu (le texte sous l'en-tête) et va jusqu'à la fin du fichier.
- Les lignes vides à l'intérieur de la liste ne la coupent pas et ne changent rien à l'arbre.
- L'application l'écrit sans ligne vide, après une seule ligne vide sous le titre.

### 5.2 Puce

Une puce est une ligne qui, après son retrait, commence par `-`, `*` ou `+`, puis un espace ou une tabulation, puis un texte qui n'est pas fait que d'espaces.
- `-texte` (sans espace), `1. texte` (liste numérotée) ne sont pas des puces : lignes hors format.
- Une puce sans texte (`- ` seul) n'est pas un nœud : ligne hors format.
- L'application écrit toujours `-` suivi d'un espace.

### 5.3 Retrait et profondeur

- Le retrait d'une ligne compte ses espaces de tête ; une tabulation vaut 4 espaces. Aucun autre caractère ne compte comme retrait (une espace insécable rend la ligne hors format).
- Le nombre d'espaces par niveau n'est pas imposé : seuls les retraits comparés entre eux comptent.
- La règle, appliquée puce après puce dans l'ordre du fichier :
  - une puce dont le retrait est plus grand que celui de la puce qui la précède est son enfant ;
  - sinon, elle est l'enfant du plus proche ancêtre de la puce précédente dont le retrait est plus petit que le sien ;
  - s'il n'y en a pas, c'est un nœud racine.
- Conséquences :
  - la première puce est toujours un nœud racine, quel que soit son retrait ;
  - deux puces de même retrait qui se suivent sont frères ;
  - un retrait « entre deux niveaux » rattache la puce au plus proche ancêtre moins en retrait (après `- B` à 0 et `    - C` à 4, une puce à 2 est le frère de C, enfant de B).
- L'application écrit 2 espaces par niveau, jamais de tabulation.

### 5.4 Titre d'un nœud

- C'est le texte de la puce, sans le commentaire de couleur (§ 6), espaces de début et de fin retirés.
- Il tient sur une ligne.
- Il accepte le Markdown de ligne : gras, italique, code, barré, liens Markdown `[texte](adresse)`, liens entre notes `[[titre]]` et `[[titre|texte]]` (règles des liens : `doc/format/note.md`).
- Une case à cocher (`- [ ] À faire`) ou un `#` en tête (`- # B`) restent du texte du titre, tels quels.
- Un commentaire HTML qui n'est pas un commentaire de couleur reste dans le titre, tel quel (`- Valise <!-- note: à finir -->` a pour titre `Valise <!-- note: à finir -->`).

### 5.5 Détail d'un nœud

- Une ligne de détail est une ligne qui, après son retrait, commence par `>`. Son texte est ce qui suit le `>`, moins un seul espace s'il y en a un (une tabulation ou un second espace restent dans le texte). Les espaces de fin sont gardés.
- Elle appartient au plus proche ancêtre de la dernière puce (cette puce comprise) dont le retrait est **strictement plus petit** que le sien. Il faut donc qu'une ligne de détail soit plus en retrait que la puce de son nœud : `- A` suivi de `> x` au même retrait n'a pas de nœud.
- Une ligne de détail sans nœud (avant la première puce, ou pas assez en retrait) est hors format.
- Une ligne `>` seule est une ligne vide du détail. Une ligne vraiment vide entre deux lignes de détail est ignorée : elle ne fait pas une ligne vide du détail.
- Les lignes de détail d'un même nœud s'ajoutent dans l'ordre du fichier, même séparées par des enfants : après `- A`, `  - B`, une ligne `  > x` (retrait 2, comme B) appartient à A ; elle sera réécrite avant B.
- Le détail accepte tout le Markdown : listes (`> - item`), gras, code, liens Markdown, liens entre notes.
- L'application écrit le détail juste sous la puce, avant les enfants, au retrait des enfants (retrait de la puce + 2 espaces). Chaque ligne commence par `> ` ; une ligne vide du détail s'écrit `>`.

## 6. Attributs d'un nœud

Un nœud n'a que trois choses : son titre, son détail, sa couleur ; plus ses enfants. Il n'a ni identifiant, ni état replié, ni icône, ni date dans le fichier.

### 6.1 Couleur de nœud

- C'est un commentaire HTML tout au bout de la puce, après le titre : `- Clients <!-- couleur: bleu -->`.
- Les 10 noms de la palette de couleurs, dans l'ordre des menus : `rouge`, `orange`, `jaune`, `vert`, `turquoise`, `bleu`, `violet`, `rose`, `marron`, `ardoise`. Aucune couleur libre.
- Lecture :
  - le texte de la puce, espaces de fin retirés, doit finir par `-->` ; c'est le dernier `<!--` de la ligne qui ouvre le commentaire ;
  - à l'intérieur, la clé est avant le premier `:` ; elle vaut `couleur` sans tenir compte des majuscules ni des espaces autour ;
  - le nom est après le `:` ; espaces et majuscules ignorés (`<!--   COULEUR :  Rouge-->` donne `rouge`) ;
  - un nom de la palette donne cette couleur ; tout autre nom (`fuchsia`) se lit « sans couleur » : le commentaire est retiré du titre et disparaît au prochain enregistrement fait par la carte ;
  - un commentaire au milieu du titre, ou dont la clé n'est pas `couleur`, n'est pas une couleur et reste dans le titre.
- Écriture : un espace, puis `<!-- couleur: nom -->`, le nom en minuscules.

### 6.2 Repli

Plier ou déplier une branche n'écrit rien dans le fichier (§ 3.3).

## 7. Chemin d'un nœud

Un nœud est désigné par son chemin : ses rangs depuis 0, du nœud racine jusqu'à lui, séparés par des points.
- `0` est le premier nœud racine ; `0.1` le deuxième enfant de ce nœud ; `1.0.2` le troisième enfant du premier enfant du deuxième nœud racine.
- Les rangs suivent l'ordre du fichier.
- Un chemin s'écrit avec des chiffres ASCII et des points seulement, sans rang vide (`0..1`, `.1`, `a.1`, chaîne vide : refusés) ; des espaces autour du chemin entier sont tolérés ; un zéro de tête est toléré (`01` vaut `1`).
- Le chemin n'est pas écrit dans le fichier : il se déduit de la liste. Il vaut pour la carte telle qu'elle vient d'être lue : ajouter, déplacer ou supprimer un nœud renumérote ses frères suivants et leurs descendants.
- Il sert aux outils de l'application offerts aux IA (lire la carte, viser un nœud) et aux résultats de recherche, qui ouvrent la carte sur un nœud.

## 8. Tolérance à la lecture

L'application lit sans erreur tout fichier dont l'en-tête déclare `type: carte-mentale`. Ce qu'elle ne comprend pas est ignoré, sans message :
- **texte hors liste** : paragraphes, autres titres, tableaux, lignes entre l'en-tête et le titre, lignes entre le titre et la première puce ;
- **dans la liste** : toute ligne qui n'est ni une puce ni une ligne de détail rattachée à un nœud (paragraphe en retrait, ligne de détail orpheline, puce vide, liste numérotée, autre titre) ;
- **lignes vides** : partout, sans effet ;
- **indentation irrégulière** : acceptée selon la règle du § 5.3 (espaces en nombre libre, tabulations à 4, mélange des deux, niveaux sautés) ;
- **marques de puce** `*` et `+` : acceptées comme `-` ;
- **couleur mal écrite** : majuscules et espaces tolérés ; nom inconnu lu « sans couleur » ;
- **`racines`** absente, incomplète, fausse, trop longue ou trop courte : places par défaut là où il manque (§ 3.2) ;
- **fins de ligne** `\r\n` : acceptées.

Limite à connaître : la lecture ne reconnaît pas les blocs de code ni les commentaires HTML sur plusieurs lignes. Une ligne `- …` à l'intérieur d'un bloc de code délimité par ```` ``` ```` est lue comme une puce, et une ligne `> …` comme une ligne de détail ; les lignes ```` ``` ```` elles-mêmes sont hors format.

## 9. Ce que l'application réécrit

Quand la carte enregistre (à chaque changement fait à l'écran ou par un outil de l'application offert aux IA ; plier ou déplier n'enregistre rien) :
- **Seulement la liste et la clé `racines`** sont réécrites. Le reste de l'en-tête (clés, ordre, commentaires, fins de ligne) et la ligne du titre restent identiques octet pour octet.
- **`racines`** :
  - remplacée à sa place si elle existe (seule la première occurrence compte ; une forme sur plusieurs lignes, la clé et ses lignes en retrait ou commençant par `- ` qui la suivent, est remplacée en entier par la forme en ligne) ;
  - ajoutée après les autres clés si elle manque ;
  - une position par nœud racine, ni plus ni moins ;
  - retirée quand la carte n'a plus aucun nœud.
- **Le contenu** est réécrit ainsi : la ligne du titre (s'il y en a un), une ligne vide, puis la liste ; sans titre, la liste suit directement l'en-tête ; sans nœud, rien après le titre.
- **La liste** est écrite au format du § 5 et du § 6 : `- ` et 2 espaces par niveau, détail en `> ` au retrait des enfants, couleur en commentaire au bout de la puce, aucune ligne vide.
- **Disparaissent** : les lignes hors format, les puces vides, les commentaires de couleur au nom inconnu. La version d'avant est gardée dans l'historique des versions (`doc/format/espace-de-travail.md`).
- **Changent de forme** : `*` et `+` deviennent `-` ; les retraits deviennent 2 espaces par niveau ; `>texte` devient `> texte` ; une couleur devient ` <!-- couleur: nom -->` en minuscules ; une ligne de détail rattachée à un nœud après ses enfants remonte avant eux.
- **Fins de ligne** : le titre et la liste sont écrits avec `\n` ; le fichier finit par un seul retour à la ligne.
- **Stabilité** : un fichier qui suit déjà cette écriture et que la carte réenregistre sans changement reste identique octet pour octet.

### 9.1 Ce que fixent l'écran et les outils

- **Titre d'un nœud** : l'écran prend la première ligne tapée, sans ses espaces de début et de fin, et refuse un titre vide ; les outils offerts aux IA refusent un titre vide ou sur plusieurs lignes.
- **Détail** : à l'écran, les lignes tapées après la première, telles quelles (des lignes vides en fin de détail restent, écrites `>`) ; par les outils, les lignes données, sans les lignes vides de fin.
- **Couleur** : un nom de la palette, ou aucune ; jamais une couleur libre.
- **Place d'un nœud racine** : à l'écran, là où il est posé ou glissé ; par les outils, la place donnée, ou la place par défaut de son rang. Un nœud racine ajouté entre d'autres insère sa place au même rang dans `racines`.
- **Création** : une carte neuve contient l'en-tête `type: carte-mentale` et la ligne `# Titre donné`, sans `racines` ni liste. Créée avec une liste de départ (outil de création offert aux IA), cette liste est lue selon le § 5 puis écrite comme au § 9, avec la place par défaut de chaque nœud racine.

## 10. Exemples

### 10.1 Exemple complet

Ce fichier suit l'écriture de l'application : réenregistré sans changement, il reste identique.

```markdown
---
type: carte-mentale
tags: [atelier, 2027]
pinned: true
racines: [{x: 0, y: 0}, {x: 640, y: 0}, {x: 120.5, y: 480}]
---
# Atelier céramique 2027

- Offre <!-- couleur: bleu -->
  > Trois formules, de la découverte à l'abonnement.
  - Initiation
    > Deux heures, terre fournie.
    >
    > - groupe de **6** au plus
    > - cuisson comprise
  - Stage du week-end <!-- couleur: vert -->
  - Abonnement trimestriel
- Lieux <!-- couleur: orange -->
  - Atelier de la rue Pasteur
  - [[Salle municipale|Salle des fêtes]]
    > Voir la convention : [[Mairie - convention]].
- Questions ouvertes <!-- couleur: ardoise -->
  - Assurance *à vérifier*
  - Prix du four : [devis](https://exemple.fr/devis.pdf)
```

Lecture :
- trois nœuds racines : « Offre » (`0`, posé en 0 ; 0), « Lieux » (`1`, en 640 ; 0), « Questions ouvertes » (`2`, en 120,5 ; 480) ;
- « Offre » a un détail d'une ligne et trois enfants : « Initiation » (`0.0`), « Stage du week-end » (`0.1`, vert), « Abonnement trimestriel » (`0.2`) ;
- « Initiation » a un détail de quatre lignes, la deuxième vide, les deux dernières en liste ;
- « [[Salle municipale|Salle des fêtes]] » (`1.1`) est un lien entre notes, et son détail en contient un autre ;
- « Prix du four » (`2.1`) contient un lien Markdown vers une adresse web.

### 10.2 Fichier écrit à la main, et sa réécriture

Fichier lu :

```markdown
---
type: carte-mentale
racines: [{x: 10, y: 20}]
tags: [voyage]
---

Quelques idées en vrac.

# Voyage au Japon

* Itinéraire <!--COULEUR:Vert-->
    * Tokyo
      >Arrivée le 3 avril.

    * Kyoto <!-- couleur: fuchsia -->
	* Osaka
  du texte perdu
- Budget
> détail orphelin
- 
+ Valise <!-- note: à finir -->
```

Ce que l'application en lit :
- trois nœuds racines : « Itinéraire » (vert), « Budget », « Valise <!-- note: à finir --> » ;
- « Itinéraire » a trois enfants : « Tokyo » (avec le détail « Arrivée le 3 avril. »), « Kyoto » (sans couleur : nom inconnu), « Osaka » (la tabulation vaut 4 espaces) ;
- ignorés : le paragraphe, « du texte perdu », le détail orphelin (même retrait que « Budget »), la puce vide, les lignes vides ;
- places : la première est donnée, les deux autres prennent la place par défaut.

Le même fichier après le premier enregistrement fait par la carte :

```markdown
---
type: carte-mentale
racines: [{x: 10, y: 20}, {x: 0, y: 160}, {x: 0, y: 320}]
tags: [voyage]
---
# Voyage au Japon

- Itinéraire <!-- couleur: vert -->
  - Tokyo
    > Arrivée le 3 avril.
  - Kyoto
  - Osaka
- Budget
- Valise <!-- note: à finir -->
```

## Références

- `doc/specs/carte-mentale.md` : spécification de la fonction (comportement à l'écran).
- `doc/decisions/0050-carte-mentale.md` : lecture et écriture du format par le domaine.
- `doc/decisions/0080-carte-mentale-par-le-mcp.md` : lecture en arbre et gestes par les outils offerts aux IA, chemin d'un nœud.
- `doc/format/note.md` : règles communes à toute note (en-tête, titre, nom de fichier, liens, pièces jointes).
- `doc/format/espace-de-travail.md` : l'espace de travail, l'historique des versions.
- `doc/ontology.md` : vocabulaire.
