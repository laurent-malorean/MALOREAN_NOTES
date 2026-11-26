# Format d'un canvas (`.canvas`)

Ce document décrit le fichier d'un canvas tel que MALOREAN Notes le lit et l'écrit. Il est la seule description de ce format dans le projet : un développeur doit pouvoir lire ou produire un canvas avec un autre outil sans lire le code.

Le format est **JSON Canvas 1.0**, le format ouvert d'Obsidian (<https://jsoncanvas.org/spec/1.0/>). L'application l'écrit comme Obsidian l'écrit, pour qu'un même fichier passe de l'un à l'autre sans changement parasite. Les écarts avec JSON Canvas 1.0 sont rassemblés dans la section « Différences avec JSON Canvas 1.0 ».

Vocabulaire : le fichier parle de **nœuds** (`nodes`) et d'**arêtes** (`edges`) ; l'application les appelle **cartes** et **flèches**. Un **groupe** est une carte.

Règles communes, non reprises ici :
- nom du fichier, titre tiré du nom, création sans écraser un fichier existant : voir [note.md](note.md) ;
- liens `[[…]]` (y compris ceux qui désignent un canvas, `[[nom.canvas]]`) : voir [note.md](note.md) ;
- espace de travail, dossiers, corbeille, historique, surveillance : voir [espace-de-travail.md](espace-de-travail.md).

Mots-clés **DOIT**, **NE DOIT PAS**, **DEVRAIT**, **PEUT** : au sens de la RFC 2119.

## 1. Reconnaissance du fichier

- Un canvas est un fichier de l'espace de travail dont le nom se termine par `.canvas`, majuscules et minuscules confondues (`Plan.CANVAS` est un canvas).
- Il est reconnu **à son extension seulement**, jamais à son contenu : une note `.md` dont l'en-tête dit `type: canvas` reste une note.
- Son titre est le nom du fichier sans `.canvas` ; le contenu ne porte aucun titre.
- Encodage : UTF-8. Type MIME : `application/json` (aucun type propre).
- Un fichier `.canvas` dont le contenu n'est pas un canvas valide (section 7) reste dans l'espace de travail mais ne s'ouvre pas comme canvas : l'application dit pourquoi, et n'y écrit jamais.

## 2. Structure générale

Le fichier est un document JSON strict (RFC 8259 : pas de commentaires, pas de virgule finale) dont la racine est un **objet**.

| Champ | Type | Obligatoire | Rôle |
|---|---|---|---|
| `nodes` | tableau de cartes | non | Les cartes, du fond vers le premier plan. |
| `edges` | tableau de flèches | non | Les flèches entre cartes. |
| `tags` | tableau de chaînes | non | Les étiquettes du canvas (extension de l'application, section 2.2). |
| tout autre champ | toute valeur JSON | non | Propriété inconnue, conservée (section 8). |

- `{}` est un canvas vide valide. L'application l'écrit `{"nodes":[],"edges":[]}` mis en forme (section 9).
- **Ordre des cartes** : le rang dans `nodes` est l'ordre d'empilement ; la première carte est au fond, la dernière au premier plan. Les groupes DEVRAIENT venir en tête pour ne pas masquer leur contenu.
- L'ordre des flèches n'a pas de sens.
- Un identifiant, et non un rang, désigne une carte ou une flèche : Obsidian déplace en fin de tableau les cartes qu'on sélectionne ou déplace.

### 2.1 Coordonnées

- Origine `(0, 0)` arbitraire ; les valeurs négatives sont permises.
- `x` croît vers la droite, `y` vers le bas ; unité : le point logique, indépendant du zoom.
- `x` et `y` désignent le **coin haut gauche** de la carte.
- Positions et tailles sont des **entiers** (section 3).

### 2.2 Étiquettes (`tags`)

- Les étiquettes d'un canvas sont rangées dans la propriété `tags` de la racine : un tableau de chaînes, comme la liste `tags` de l'en-tête d'une note.
- À la lecture : chaque chaîne est nettoyée comme une étiquette de note (guillemets et `#` de tête retirés) ; une chaîne vide ou répétée est ignorée ; un élément qui n'est pas une chaîne est ignoré ; une propriété `tags` qui n'est pas un tableau ne donne aucune étiquette (elle est conservée telle quelle).
- À l'écriture : `tags` garde sa place parmi les propriétés de la racine si elle existait, sinon elle vient après les autres ; sans étiquette, la propriété est retirée. Une propriété `tags` qui n'était pas un tableau est remplacée par le tableau.
- Obsidian conserve cette propriété sans la montrer ni l'utiliser (constaté le 25/11/2026).

## 3. Champs communs à toutes les cartes

| Champ | Type | Obligatoire | Valeurs |
|---|---|---|---|
| `id` | chaîne | oui | Unique dans le fichier, cartes et flèches confondues. |
| `type` | chaîne | oui | `text`, `file`, `link` ou `group`. |
| `x` | entier | oui | Position horizontale du coin haut gauche. |
| `y` | entier | oui | Position verticale du coin haut gauche. |
| `width` | entier | oui | Largeur. |
| `height` | entier | oui | Hauteur. |
| `color` | chaîne | non | Couleur (section 6). Absente : couleur neutre du thème. |

- **`id`** : toute chaîne est acceptée à la lecture, même vide. L'application crée ses identifiants comme Obsidian : **16 chiffres hexadécimaux minuscules** (`a3f9c2d41b7e8056`), tirés au hasard et différents de tous ceux du fichier. Elle ne change jamais un identifiant existant.
- **Entiers** : un nombre JSON écrit sans partie décimale ni exposant, dans les bornes d'un entier signé de 64 bits. `100.0`, `1.5`, `1e2` sont refusés ; `-0` se lit `0` et se réécrit `0`.
- **Taille** : la lecture accepte une largeur ou une hauteur nulle ou négative ; les outils de l'application n'en créent pas (section 10).
- La hauteur d'une carte ne s'adapte pas à son contenu : un texte trop long est coupé en bas de la carte (Obsidian comme l'application). Un outil qui produit un canvas DOIT dimensionner `height` selon le texte.

## 4. Les sortes de cartes

### 4.1 Carte texte (`"type":"text"`)

| Champ | Type | Obligatoire | Valeurs |
|---|---|---|---|
| `text` | chaîne | oui | Markdown (vide permis). Les retours à la ligne s'écrivent `\n`. |

Taille d'une carte texte neuve (Obsidian et l'application) : 250 × 60.

### 4.2 Carte de fichier (`"type":"file"`)

Une note, un canvas ou un média (image, PDF…) de l'espace de travail.

| Champ | Type | Obligatoire | Valeurs |
|---|---|---|---|
| `file` | chaîne | oui | Chemin du fichier depuis la **racine de l'espace de travail**, séparé par `/` (jamais relatif au dossier du canvas). |
| `subpath` | chaîne | non | Ancre dans une note ; DOIT commencer par `#` : `#Titre` (une section) ou `#^bloc` (un paragraphe portant cet identifiant de bloc). |

- Un `subpath` qui ne commence pas par `#` rend le fichier invalide.
- Un fichier absent de l'espace de travail ou une ancre introuvable ne rendent pas le canvas invalide : la carte reste, son chemin et son ancre sont conservés tels quels.
- Un média ajouté depuis l'application est copié dans le dossier de pièces jointes du canvas (`<nom>.assets`, à côté du canvas), puis désigné par son chemin depuis la racine.
- Taille d'une carte de fichier neuve : 400 × 300 ; une image ajoutée depuis l'écran prend les proportions de l'image (règle dans `doc/specs/canvas-comportement.md`, section 2). Une carte déjà dans le fichier garde sa taille.

### 4.3 Carte de page web (`"type":"link"`)

| Champ | Type | Obligatoire | Valeurs |
|---|---|---|---|
| `url` | chaîne | oui | Adresse absolue (`https://…`). |

- La lecture accepte toute chaîne.
- Taille d'une carte de page web neuve : 400 × 300.

### 4.4 Groupe (`"type":"group"`)

Un cadre qui en regroupe d'autres.

| Champ | Type | Obligatoire | Valeurs |
|---|---|---|---|
| `label` | chaîne | non | Nom du groupe, affiché sur le coin haut gauche du cadre. |
| `background` | chaîne | non | Image d'arrière-plan, chemin depuis la racine de l'espace de travail. |
| `backgroundStyle` | chaîne | non | `cover` (remplit le cadre ; rendu par défaut), `ratio` (garde les proportions) ou `repeat` (répète l'image à sa taille). Toute autre valeur rend le fichier invalide. |

- **Appartenance purement géométrique** : le fichier ne contient aucune liste de membres. Une carte fait partie d'un groupe quand son rectangle est **entièrement** dans celui du groupe, bords compris ; une carte qui dépasse, même d'un point, n'en fait pas partie. Déplacer un groupe déplace ses membres.
- Une image d'arrière-plan introuvable n'est pas une erreur : le groupe s'affiche sans fond.
- Taille d'un groupe neuf : 400 × 300. Un groupe créé autour de cartes les entoure avec une marge de 20 de chaque côté. Un groupe neuf est placé en tête de `nodes`.

## 5. Flèches (`edges`)

| Champ | Type | Obligatoire | Défaut | Valeurs |
|---|---|---|---|---|
| `id` | chaîne | oui | — | Unique dans le fichier, cartes et flèches confondues. |
| `fromNode` | chaîne | oui | — | `id` d'une carte existante : le départ. |
| `fromSide` | chaîne | non | déduit | `top`, `right`, `bottom` ou `left`. |
| `fromEnd` | chaîne | non | `none` | `none` (le trait s'arrête) ou `arrow` (une pointe). |
| `toNode` | chaîne | oui | — | `id` d'une carte existante : l'arrivée. |
| `toSide` | chaîne | non | déduit | `top`, `right`, `bottom` ou `left`. |
| `toEnd` | chaîne | non | `arrow` | `none` ou `arrow`. |
| `color` | chaîne | non | — | Couleur (section 6), pour la ligne et les pointes. |
| `label` | chaîne | non | — | Étiquette au milieu de la ligne ; peut contenir des `\n`. |

- **Côté** : la flèche s'accroche au milieu du côté nommé.
- **Côtés absents** : ils sont déduits des positions des deux cartes, à partir de l'écart entre leurs centres :
  - si l'écart horizontal est au moins égal à l'écart vertical : de `right` vers `left` quand l'arrivée est à droite (ou au même centre), de `left` vers `right` sinon ;
  - sinon : de `bottom` vers `top` quand l'arrivée est plus bas, de `top` vers `bottom` sinon.
  Un côté écrit dans le fichier n'est jamais remplacé ; seul le côté absent est complété. Les côtés déduits sont **écrits** au prochain enregistrement (comme Obsidian). Un outil qui produit un canvas DEVRAIT toujours donner les deux côtés.
- **Extrémités** :
  - flèche du départ vers l'arrivée (« unidirectionnel », le défaut) : aucun champ ;
  - trait sans pointe (« non directionnel ») : `"toEnd":"none"` ;
  - flèche aux deux bouts (« bidirectionnel ») : `"fromEnd":"arrow"` ;
  - pointe au départ seulement : `"fromEnd":"arrow","toEnd":"none"` (permise et conservée ; l'écran ne propose pas ce choix).
  Les valeurs par défaut écrites explicitement (`"fromEnd":"none"`, `"toEnd":"arrow"`) sont lues puis **retirées** à l'écriture.
- **Flèche d'une carte vers elle-même** : acceptée à la lecture et conservée ; les outils de l'application n'en créent pas.

## 6. Couleurs

Une couleur est une **chaîne**, de deux formes reconnues :
- un **préréglage** de `"1"` à `"6"` (une chaîne, pas un nombre), dont la teinte dépend du thème ;
- un **hexadécimal** `#RRGGBB`.

L'application n'a qu'une palette, de dix couleurs (celle de la carte mentale). Ce qu'elle écrit pour chacune :

| Couleur de la palette | Écrit dans le fichier |
|---|---|
| rouge | `"1"` |
| orange | `"2"` |
| jaune | `"3"` |
| vert | `"4"` |
| turquoise (« cyan » de JSON Canvas) | `"5"` |
| violet | `"6"` |
| bleu | `"#2563eb"` |
| rose | `"#ec6aa8"` |
| marron | `"#92643a"` |
| ardoise | `"#64748b"` |

- À la lecture, une valeur désigne une couleur de la palette si elle est égale à l'une des valeurs ci-dessus ; la casse des hexadécimaux est ignorée (`#2563EB` est le bleu).
- **Toute autre chaîne** (`"#FF5733"`, `"7"`, `""`…) est acceptée, affichée telle quelle quand c'est une couleur affichable, et **réécrite exactement comme elle était écrite**.
- Choisir dans l'application la couleur que la valeur désignait déjà garde la valeur d'origine (`#2563EB` reste en majuscules) ; choisir une autre couleur écrit la valeur du tableau. On ne peut choisir aucune couleur hors de la palette.
- Une valeur `color` qui n'est pas une chaîne (nombre, `null`…) rend le fichier invalide.

## 7. Ce que l'application refuse ou tolère à la lecture

### 7.1 Refusé : le fichier n'est pas un canvas valide

L'application refuse le fichier, dit la raison en clair (« ce fichier n'est pas un canvas valide : … ») et n'écrit rien, si :
- le texte n'est pas du JSON bien formé (la position du caractère fautif est donnée), ou imbrique plus de 128 niveaux de tableaux ou d'objets ;
- la racine n'est pas un objet ;
- `nodes` ou `edges` est présent sans être un tableau (`null` compris) ;
- une carte ou une flèche n'est pas un objet ;
- une carte n'a pas `id`, `type`, `x`, `y`, `width`, `height`, ou le champ obligatoire de sa sorte (`text`, `file`, `url`) ;
- `type` n'est pas `text`, `file`, `link` ou `group` ;
- `x`, `y`, `width` ou `height` n'est pas un nombre, ou pas un entier (section 3) ;
- un champ connu qui attend une chaîne en reçoit une autre valeur (`id`, `type`, `text`, `file`, `subpath`, `url`, `label`, `background`, `backgroundStyle`, `color`, `fromNode`, `toNode`, `fromSide`, `toSide`, `fromEnd`, `toEnd`), y compris `null` ;
- `subpath` ne commence pas par `#` ;
- un côté, une extrémité ou un style d'arrière-plan a une valeur inconnue ;
- une flèche n'a pas `id`, `fromNode` ou `toNode` ;
- deux identifiants sont égaux, entre cartes, entre flèches ou entre une carte et une flèche ;
- une flèche désigne une carte qui n'existe pas.

### 7.2 Toléré

- Une marque d'ordre des octets (BOM) en tête du fichier est ignorée ; elle n'est pas réécrite.
- Espaces, tabulations et fins de ligne quelconques (`\n`, `\r\n`) entre les éléments JSON.
- Champs dans n'importe quel ordre.
- `nodes` ou `edges` absent : lu comme un tableau vide.
- Couleur hors palette (section 6), `id` de n'importe quelle forme, taille nulle ou négative, flèche d'une carte vers elle-même, fichier ou ancre introuvable, image d'arrière-plan absente.
- Champ inconnu, partout (section 8).
- Champ connu d'une autre sorte de carte (un `url` sur une carte texte, par exemple) : traité comme un champ inconnu, donc conservé.
- Clé répétée dans une carte ou une flèche : la première occurrence est lue comme le champ connu, les suivantes sont gardées comme champs inconnus et réécrites. Clé `nodes` ou `edges` répétée à la racine : la dernière l'emporte.

## 8. Champs inconnus et extensions d'Obsidian

- Toute propriété que l'application ne connaît pas est **conservée telle quelle**, à la racine, sur une carte et sur une flèche : propriétés ajoutées par une extension (plugin) d'Obsidian, par une autre version du format, par un autre outil.
- Sa valeur est gardée entière, quelle qu'en soit la forme (objet, tableau, nombre, booléen, `null`) ; l'ordre des champs d'un objet est gardé ; un nombre garde son écriture exacte (`2.50` reste `2.50`).
- Seule la mise en forme change : la valeur est réécrite compacte (sans espace) et les chaînes sont réécrites avec l'échappement de la section 9.3 (`é` devient `é`, `\/` devient `/`).
- Place à l'écriture : sur une carte ou une flèche, les champs inconnus suivent les champs connus, dans leur ordre d'origine ; à la racine, ils suivent `nodes` et `edges`, dans leur ordre d'origine, quelle que soit leur place dans le fichier lu.
- Obsidian conserve de même les propriétés libres à la racine, sur une carte et sur une flèche (constaté le 25/11/2026).

## 9. Écriture

### 9.1 Quand le fichier est écrit

- Lire ou ouvrir un canvas ne l'écrit jamais.
- Le fichier est réécrit en entier, dans la forme ci-dessous, quand on le change : un geste à l'écran, un outil d'une IA branchée, un changement d'étiquettes.
- Rien n'est écrit si le texte produit est identique au fichier.
- Un fichier déjà écrit dans cette forme (par Obsidian ou par l'application) se réécrit à l'identique, hors changements voulus.
- Un fichier écrit autrement est normalisé à son premier enregistrement : mise en forme, ordre des champs, côtés déduits ajoutés, extrémités par défaut retirées.

### 9.2 Mise en forme

C'est celle d'Obsidian :
- indentation par **tabulations** ;
- la racine sur plusieurs lignes : `{`, puis une ligne par propriété (`"nodes"`, `"edges"`, puis les propriétés inconnues et `tags`), séparées par `,` en fin de ligne, puis `}` ;
- `nodes` et `edges` toujours écrits, même vides ; un tableau vide s'écrit sur sa ligne (`"nodes":[]`) ; sinon `[` en fin de ligne, **un objet par ligne** indenté de deux tabulations, `]` sur sa ligne indenté d'une tabulation ;
- chaque carte et chaque flèche sur une seule ligne compacte ; une propriété inconnue de la racine aussi ;
- **aucune espace** après `:` ni après `,` ;
- fins de ligne `\n` ;
- **pas de retour à la ligne final** ;
- pas de BOM.

Canvas vide, tel que l'application le crée :

```
{
	"nodes":[],
	"edges":[]
}
```

### 9.3 Chaînes

Les chaînes sont écrites comme le fait `JSON.stringify` :
- échappés : `"` en `\"`, `\` en `\\`, et les caractères de contrôle : `\n`, `\r`, `\t`, `\b`, `\f`, les autres en `\u00XX` (hexadécimal minuscule) ;
- tout le reste tel quel : accents, émojis, `/`.

À la lecture, tous les échappements JSON sont acceptés, y compris les paires `😀` ; une moitié de paire isolée rend le fichier invalide.

### 9.4 Ordre des champs

Les champs facultatifs absents sont omis.

| Objet | Ordre écrit |
|---|---|
| Carte texte | `id`, `type`, `text`, `x`, `y`, `width`, `height`, `color` |
| Carte de fichier | `id`, `type`, `file`, `subpath`, `x`, `y`, `width`, `height`, `color` |
| Carte de page web | `id`, `type`, `url`, `x`, `y`, `width`, `height`, `color` |
| Groupe | `id`, `type`, `backgroundStyle`, `x`, `y`, `width`, `height`, `color`, `label`, `background` |
| Flèche | `id`, `fromNode`, `fromSide`, `toNode`, `toSide`, `fromEnd`, `toEnd`, `color`, `label` |
| Racine | `nodes`, `edges`, puis les autres propriétés dans leur ordre |

Les champs inconnus suivent, dans leur ordre d'origine (section 8).

### 9.5 Ordre des cartes à l'écriture

- L'application garde l'ordre des cartes du fichier.
- Elle place une carte neuve en fin de tableau (au premier plan), un groupe neuf en tête (au fond).
- À l'écran, sélectionner ou déplacer une carte la passe en fin de tableau, comme Obsidian. Un déplacement par un outil d'IA ne change pas l'ordre.

## 10. Ce que les outils de l'application écrivent

Ces règles disent ce que l'application produit elle-même ; elles ne restreignent pas ce qu'elle lit.

- Identifiant neuf : 16 chiffres hexadécimaux minuscules, unique dans le fichier.
- Positions et tailles : entiers. Les positions venues de l'écran sont arrondies à l'entier le plus proche. Les outils d'une IA branchée refusent une taille nulle ou négative, et toute position ou taille hors de ±1 000 000 000.
- Tailles d'une carte neuve : 250 × 60 (texte), 400 × 300 (fichier, page web, groupe) ; image ajoutée à l'écran : voir la section 4.2.
- Couleurs : seulement celles de la palette (section 6) ; retirer la couleur supprime le champ `color`.
- Adresse d'une carte de page web créée ou changée par une IA : commence par `http://`, `https://` ou `mailto:`, sans espace ni retour à la ligne.
- Changer le fichier d'une carte de fichier retire son `subpath`.
- Retirer une carte retire les flèches qui y touchent ; retirer un groupe ne retire que son cadre.
- Un nom de groupe ou une étiquette de flèche vide retire le champ.
- Les outils ne créent pas de flèche d'une carte vers elle-même, ne posent pas d'image d'arrière-plan de groupe et n'écrivent pas de `backgroundStyle`.

## 11. Fusion quand le fichier a changé ailleurs

L'application garde le texte du fichier tel qu'elle l'a lu (la version de départ). À l'enregistrement, elle relit le fichier :
- s'il est identique à la version de départ, elle écrit sa version ;
- sinon (Obsidian, un autre outil, une IA l'a changé entre-temps), elle **fusionne** trois versions : celle de départ, la sienne, celle du fichier. Elle écrit le résultat, sauf s'il est identique au fichier.

Règles de la fusion :
- Cartes et flèches sont reconnues à leur `id` ; chacune est traitée **en entier** (pas champ par champ).
- Présente des deux côtés : si la mienne est restée celle de départ, celle du fichier est prise ; sinon la mienne est prise. Changée des deux côtés : **la mienne l'emporte en entier**, y compris sur des champs que je n'ai pas touchés.
- Présente d'un seul côté : gardée si elle diffère de la version de départ (ajoutée de ce côté, ou changée de ce côté pendant que l'autre la retirait) ; retirée si elle est restée celle de départ (l'autre côté l'a retirée).
- Retirée des deux côtés : retirée.
- Une flèche dont l'une des cartes a disparu disparaît aussi.
- Ordre : celui de ma version, puis, à la suite, les éléments présents seulement dans le fichier, dans leur ordre.
- Propriétés de la racine (étiquettes et propriétés inconnues), en bloc : si les miennes sont restées celles de départ, celles du fichier sont prises ; sinon les miennes.
- Si la version de départ ou le fichier d'aujourd'hui n'est pas un canvas valide, rien n'est écrit et l'erreur est rendue : un fichier invalide n'est jamais écrasé.

## 12. Différences avec JSON Canvas 1.0

### 12.1 Ce que l'application ajoute

- **`tags` à la racine** : propriété propre à l'application pour les étiquettes du canvas (section 2.2). JSON Canvas ne la définit pas ; pour un autre lecteur, c'est une propriété inconnue.
- **Côtés déduits écrits** : une flèche sans `fromSide` ou `toSide` les reçoit à l'enregistrement (JSON Canvas les laisse facultatifs, sans règle de déduction ; la règle de la section 5 est celle de l'application).
- **Mise en forme et ordre des champs imposés** (section 9) : JSON Canvas n'impose ni l'une ni l'autre ; l'application suit Obsidian.
- **Valeurs par défaut retirées** : `"fromEnd":"none"` et `"toEnd":"arrow"` explicites disparaissent à l'écriture.

### 12.2 Ce que l'application refuse alors que JSON Canvas 1.0 ne l'interdit pas expressément

- **Sorte de carte inconnue** : un `type` autre que `text`, `file`, `link`, `group` rend tout le fichier invalide (pas d'ignorance de la seule carte). Un canvas produit par une future version du format avec une nouvelle sorte de carte ne s'ouvrira pas.
- **Valeur inconnue** de côté, d'extrémité ou de style d'arrière-plan : fichier invalide.
- **Nombres non entiers** : `100.0` ou `1e2` sont refusés, même s'ils valent un entier.
- **`null` ou une valeur non chaîne** dans un champ connu facultatif (`"color":null`, `"label":null`) : fichier invalide, au lieu d'un champ absent.
- **Flèche vers une carte absente** et **identifiants répétés** : fichier invalide (JSON Canvas demande des identifiants uniques et des flèches vers des cartes existantes, sans dire quoi faire d'un fichier qui ne le respecte pas).

### 12.3 Ce que l'application tolère au-delà de JSON Canvas 1.0

- **Couleur de toute forme** : JSON Canvas prévoit les préréglages `"1"`–`"6"` et l'hexadécimal ; l'application lit et conserve n'importe quelle chaîne.
- **BOM** en tête du fichier : ignoré.
- **Tailles nulles ou négatives** et **identifiants vides** : lus et conservés.

### 12.4 Restrictions de l'application à l'écriture

- Couleurs choisies uniquement dans la palette de dix couleurs ; aucune couleur libre.
- Pas de flèche d'une carte vers elle-même ; pas d'image d'arrière-plan ni de `backgroundStyle` posés par les outils.
- Chemins `file` et `background` relatifs à la racine de l'espace de travail (JSON Canvas ne fixe pas la base des chemins ; Obsidian prend la racine du coffre, équivalente).

### 12.5 Affichage (hors format, pour mémoire)

Le fichier est le même, mais l'écran de l'application diffère d'Obsidian sur deux points : une carte de note montre un lien vers la note et non un aperçu ; une couleur hors palette est montrée telle quelle sans pouvoir être choisie. Le comportement à l'écran est décrit dans `doc/specs/canvas-comportement.md`.

## 13. Ce qu'Obsidian fait du fichier (constaté)

Utile pour produire un fichier qu'Obsidian ouvre et réécrit sans le changer. Constats faits sur des canvas réels et des fichiers de test, version d'Obsidian non relevée.

- Il écrit la même mise en forme et le même ordre des champs que l'application (section 9) ; l'ordre des champs d'une carte de page web n'a pas été vu écrit par Obsidian.
- Il retire `"fromEnd":"none"` et `"toEnd":"arrow"` explicites, ajoute les côtés absents, déplace `label` d'un groupe après `color` et `background` en dernier.
- Il n'ajoute pas de `backgroundStyle` absent ; il conserve un `subpath` introuvable, un fichier absent, `toEnd:"none"`, les couleurs hexadécimales dans leur casse, et les propriétés libres.
- Il passe en fin de tableau les cartes sélectionnées ou déplacées.
- Il recharge un fichier modifié hors de lui pendant qu'il est ouvert ; une écriture concurrente peut être perdue.
- Non vérifié : les formes courtes d'hexadécimal (`#F53`, à ne pas employer), les teintes exactes des préréglages (elles dépendent du thème), les fichiers autres que notes et images dans une carte de fichier.

## 14. Exemple complet

Un canvas `Projets/atlas.canvas` tel que l'application l'écrit : un groupe vert contenant une carte texte, une carte de note avec ancre et une page web ; une image hors du groupe ; trois flèches (une simple avec étiquette, une bidirectionnelle bleue, un trait sans pointe) ; une propriété d'extension sur une carte ; des étiquettes à la racine.

```
{
	"nodes":[
		{"id":"d0a6f3b8e7c91524","type":"group","x":-40,"y":-60,"width":1180,"height":460,"color":"4","label":"Lancement"},
		{"id":"a3f9c2d41b7e8056","type":"text","text":"# Lancement d'Atlas\n\n- Mise en marché : *juin*\n- Voir [[budget-atlas]]","x":0,"y":0,"width":260,"height":140,"color":"2"},
		{"id":"b81e04c9d2f35a67","type":"file","file":"Projets/atlas-objectifs.md","subpath":"#Objectifs","x":320,"y":0,"width":400,"height":300},
		{"id":"c5d7e1a09f284b36","type":"link","url":"https://jsoncanvas.org/spec/1.0/","x":760,"y":0,"width":340,"height":200,"color":"#FF5733","pluginData":{"pinned":true}},
		{"id":"f27c0b9e4a1d6358","type":"file","file":"Images/maquette.png","x":0,"y":460,"width":400,"height":225}
	],
	"edges":[
		{"id":"e94b7a2c6d1f8035","fromNode":"a3f9c2d41b7e8056","fromSide":"right","toNode":"b81e04c9d2f35a67","toSide":"left","label":"détaille"},
		{"id":"7b3e5f0a9c2d4186","fromNode":"b81e04c9d2f35a67","fromSide":"right","toNode":"c5d7e1a09f284b36","toSide":"left","fromEnd":"arrow","color":"#2563eb"},
		{"id":"5a8d1c6e0f3b7294","fromNode":"a3f9c2d41b7e8056","fromSide":"bottom","toNode":"f27c0b9e4a1d6358","toSide":"top","toEnd":"none"}
	],
	"tags":["projet","atlas"]
}
```

À noter :
- le groupe est en tête : il est dessiné au fond ;
- la carte texte, la note et la page web sont entièrement dans le cadre du groupe (de `-40` à `1140` en `x`, de `-60` à `400` en `y`) : elles en sont membres ; l'image (`y` de `460` à `685`) n'en est pas ;
- `"2"` est l'orange de la palette, `"#2563eb"` le bleu ; `"#FF5733"` est hors palette et sera réécrit tel quel ;
- `pluginData` est inconnu de l'application : conservé, après les champs connus ;
- le fichier se termine par `}` sans retour à la ligne.

## Références

- JSON Canvas 1.0 : <https://jsoncanvas.org/spec/1.0/> ; dépôt : <https://github.com/obsidianmd/jsoncanvas>
- Comportement du canvas à l'écran : `doc/specs/canvas-comportement.md`
- Constats faits dans Obsidian (rendu, vérifications) : `doc/specs/canvas.md`
- Décision du canvas (format, fichiers, index, enregistrement, fusion) : `doc/decisions/0052-canvas.md`
- Le canvas par le MCP (lecture, gestes, identifiants, tailles, refus) : `doc/decisions/0079-canvas-par-le-mcp.md`
- Créer un canvas par le MCP : `doc/decisions/0087-creer-un-canvas-par-le-mcp.md`
- Règles communes d'un fichier de l'espace de travail : `doc/format/note.md`, `doc/format/espace-de-travail.md`
