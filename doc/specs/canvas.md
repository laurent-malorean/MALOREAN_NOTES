# Spécification du format Canvas d'Obsidian

Version de la spécification : 1.1. Elle part de **JSON Canvas 1.0**, le format ouvert sur lequel repose Obsidian Canvas, et ajoute ce qui a été **observé dans Obsidian** : rendu, valeurs par défaut, réécriture à l'enregistrement. Le §10 dit ce qui est vérifié et ce qui ne l'est pas.

Les fichiers qui accompagnent cette spécification (`valider_canvas.py`, `canvas.schema.json`, `exemple.canvas`, `kit-test/`) ne sont pas repris dans ce projet pour l'instant.

Mots-clés **DOIT**, **DOIT NE PAS**, **DEVRAIT**, **PEUT** : à lire au sens de la RFC 2119.

Pour produire un canvas qu'Obsidian ouvre et réécrit sans le modifier, aller directement au [§9](#9-générer-un-canvas-compatible-obsidian).

## 1. Vue d'ensemble

Un canvas est un tableau blanc infini contenant des **nœuds** (cartes positionnées librement) reliés par des **arêtes** (flèches ou lignes). Le format est du JSON.

| Élément | Valeur |
|---|---|
| Extension | `.canvas` |
| Type MIME | `application/json` (pas de type propre enregistré) |
| Encodage | UTF-8, sans BOM |
| Syntaxe | JSON strict (RFC 8259) : pas de commentaires, pas de virgule finale |
| Emplacement | Dans un coffre (*vault*) Obsidian, comme n'importe quelle note |

Pour qu'Obsidian ouvre un fichier : il DOIT se terminer par `.canvas`, se trouver dans le coffre, et contenir un objet JSON valide (voir §8).

**Chemins.** Tous les chemins du fichier (`file`, `background`) sont relatifs à la **racine du coffre**, avec des `/`, et non au dossier du canvas. Si le coffre est le dossier du projet, un canvas rangé dans `SPEC-OPSIDIAN-CANVAS/kit-test/` cite ses voisins par `SPEC-OPSIDIAN-CANVAS/kit-test/Notes/Projet.md`.

## 2. Structure racine

```json
{
  "nodes": [],
  "edges": []
}
```

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `nodes` | tableau de nœuds | non | Les cartes du canvas. |
| `edges` | tableau d'arêtes | non | Les liens entre nœuds. |

- `{}` est un canvas vide valide (spec JSON Canvas). Pour un fichier neuf, le plus sûr est `{"nodes":[],"edges":[]}`.
- Obsidian n'écrit aucun autre champ à la racine.
- L'**ordre du tableau `nodes` fixe l'ordre d'empilement** : le premier nœud est au fond, le dernier au premier plan. Les groupes DEVRAIENT donc venir en premier pour ne pas masquer leur contenu.
- Les propriétés inconnues DOIVENT être conservées à la réécriture (§7.4).

## 3. Système de coordonnées

- Origine `(0, 0)` : arbitraire, sans signification particulière. Les valeurs négatives sont permises.
- Axe `x` : croît vers la **droite**. Axe `y` : croît vers le **bas**.
- Unité : pixel logique, indépendant du zoom.
- `x` et `y` désignent le **coin supérieur gauche** du nœud.
- Toutes les valeurs de position et de taille sont des **entiers** (aussi après un déplacement ou un redimensionnement à la souris).

## 4. Nœuds

### 4.1 Propriétés communes

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `id` | chaîne | **oui** | Identifiant unique dans le fichier (nœuds et arêtes confondus). |
| `type` | chaîne | **oui** | `text`, `file`, `link` ou `group`. |
| `x` | entier | **oui** | Position horizontale du coin supérieur gauche. |
| `y` | entier | **oui** | Position verticale du coin supérieur gauche. |
| `width` | entier | **oui** | Largeur en pixels. |
| `height` | entier | **oui** | Hauteur en pixels. |
| `color` | couleur | non | Voir §6. Sans `color`, couleur neutre du thème. |

**`id`.** Le format n'impose que l'unicité. Obsidian écrit toujours 16 caractères hexadécimaux minuscules (ex. `a3f9c2d41b7e8056`) : s'y tenir.

**Taille.** Une carte texte créée dans Obsidian mesure **250 × 60** par défaut. La hauteur **ne s'adapte pas au contenu** : un texte plus long est coupé en bas de la carte (une barre de défilement apparaît quand la carte est sélectionnée). Il faut donc dimensionner `height` selon le texte.

### 4.2 Nœud texte (`type: "text"`)

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `text` | chaîne | **oui** | Contenu en **Markdown** (syntaxe Obsidian : `[[liens]]`, `#tags`, listes de tâches…). |

```json
{"id":"a3f9c2d41b7e8056","type":"text","text":"# Titre\n\nUn paragraphe avec un [[lien interne]].","x":0,"y":0,"width":260,"height":120}
```

Les retours à la ligne sont encodés `\n` dans la chaîne JSON. Le Markdown est rendu (`# …` en gros titre).

### 4.3 Nœud fichier (`type: "file"`)

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `file` | chaîne | **oui** | Chemin du fichier, relatif à la racine du coffre (§1). |
| `subpath` | chaîne | non | Ancre dans une note : `#Titre` ou `#^id-de-bloc`. |

```json
{"id":"b81e04c9d2f35a67","type":"file","file":"Notes/Projet.md","subpath":"#Objectifs","x":300,"y":0,"width":400,"height":300}
```

**Rendu selon le fichier.** Note Markdown : aperçu. Image : affichée. Le `subpath` s'applique aux notes Markdown :

| `subpath` | Titre de la carte | Contenu affiché |
|---|---|---|
| absent | nom de la note sans extension (`Projet`) | la note entière |
| `#Objectifs` (titre) | `Projet › Objectifs` | la section : le titre et son contenu, jusqu'au titre suivant |
| `#^bloc-test` (bloc) | `Projet › ^bloc-test` | le seul paragraphe portant l'identifiant (sans l'identifiant lui-même) |
| `#Inexistant` (introuvable) | `Projet › Inexistant` | message « Impossible de trouver “Inexistant” dans Projet » ; la note existe, seule l'ancre manque |

Le `subpath` s'écrit avec le `#` (et `#^` pour un bloc), sans espace, comme dans un lien interne `[[Projet#Objectifs]]`. Obsidian conserve un `subpath` introuvable tel quel.

**Fichier absent du coffre.** La carte reste affichée avec le message « *chemin#ancre n'a pas été trouvé* » et les boutons Nouvelle note, Échanger le fichier, Supprimer. Le canvas n'est pas invalide pour autant, et Obsidian ne retire pas le nœud.

### 4.4 Nœud lien (`type: "link"`)

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `url` | chaîne | **oui** | URL absolue (`https://…`). |

```json
{"id":"c5d7e1a09f284b36","type":"link","url":"https://jsoncanvas.org","x":0,"y":400,"width":400,"height":300}
```

Obsidian charge réellement la page dans la carte et affiche le titre de la page au-dessus.

### 4.5 Nœud groupe (`type: "group"`)

Cadre visuel qui regroupe d'autres nœuds.

| Champ | Type | Obligatoire | Description |
|---|---|---|---|
| `label` | chaîne | non | Titre, affiché dans une étiquette sur le coin supérieur gauche du cadre (de la couleur du groupe). |
| `background` | chaîne | non | Chemin d'une image de fond, relatif à la racine du coffre. |
| `backgroundStyle` | chaîne | non | `cover`, `ratio` ou `repeat`. Absent : rendu de `cover`. |

```json
{"id":"d0a6f3b8e7c91524","type":"group","x":-40,"y":-60,"width":780,"height":400,"color":"4","label":"Phase 1"}
```

**Fond d'image** (vérifié avec une image 128 × 64, soit 2:1) :

| `backgroundStyle` | Rendu |
|---|---|
| `cover` (ou absent) | L'image remplit tout le groupe. |
| `ratio` | L'image garde ses proportions. Dans l'essai, le groupe mesurait 300 × 150 (exactement 2:1) : l'image le remplit sans bande vide. |
| `repeat` | Mosaïque de l'image à sa taille d'origine (128 × 64 px), coupée aux bords du groupe. |

Une image introuvable ne produit **aucune erreur** : le groupe s'affiche sans fond.

**Libellé.** Un `label` trop long pour la largeur du groupe est tronqué avec « … » : prévoir des libellés courts ou un groupe assez large.

**Appartenance à un groupe : purement géométrique.** Le format ne contient aucune liste d'enfants. Un nœud appartient à un groupe quand son rectangle est contenu dans celui du groupe. Déplacer un groupe dans Obsidian déplace les nœuds qu'il contient ; un lecteur qui veut reproduire ce comportement DOIT faire le test de contenance lui-même.

## 5. Arêtes

| Champ | Type | Obligatoire | Défaut | Description |
|---|---|---|---|---|
| `id` | chaîne | **oui** | — | Identifiant unique. |
| `fromNode` | chaîne | **oui** | — | `id` du nœud de départ. |
| `fromSide` | côté | non | déduit | Côté du nœud de départ où s'accroche l'arête. |
| `fromEnd` | extrémité | non | `none` | Forme de l'extrémité côté départ. |
| `toNode` | chaîne | **oui** | — | `id` du nœud d'arrivée. |
| `toSide` | côté | non | déduit | Côté du nœud d'arrivée. |
| `toEnd` | extrémité | non | `arrow` | Forme de l'extrémité côté arrivée. |
| `color` | couleur | non | — | Voir §6. S'applique à la ligne et aux pointes. |
| `label` | chaîne | non | — | Texte au milieu de la ligne. Peut contenir des `\n`. |

- **Côté** : `top`, `right`, `bottom` ou `left`. Le point d'accroche est le **milieu** du côté.
- **Côtés absents** : Obsidian les déduit de la position des cartes (cartes l'une à gauche de l'autre : de `right` vers `left`), puis **les écrit** à l'enregistrement. Obsidian écrit toujours les deux côtés : un canvas généré DEVRAIT toujours les donner.
- **Extrémité** : `none` ou `arrow`. Par défaut une arête est une flèche de `fromNode` vers `toNode`.

  | Voulu | Écriture |
  |---|---|
  | flèche de départ vers arrivée | rien (défaut) |
  | ligne sans pointe | `"toEnd":"none"` |
  | flèche aux deux bouts | `"fromEnd":"arrow"` |
  | pointe côté départ seulement | `"fromEnd":"arrow","toEnd":"none"` |

  Obsidian **supprime** les valeurs par défaut explicites (`fromEnd:"none"`, `toEnd:"arrow"`) à l'enregistrement : ne les écrire que si l'on accepte ce diff.
- **Tracé** : Obsidian trace une courbe de Bézier entre les deux points d'accroche (une ligne droite quand les cartes sont alignées face à face). Le tracé exact n'est pas défini par le format.
- **Libellé** : posé au milieu, sur un fond qui masque la ligne ; garder des libellés courts et un écart suffisant entre cartes.
- `fromNode` et `toNode` DOIVENT référencer des `id` de nœuds existants. Une arête d'un nœud vers lui-même est permise par le format ; son rendu n'est pas garanti.

```json
{"id":"e94b7a2c6d1f8035","fromNode":"a3f9c2d41b7e8056","fromSide":"right","toNode":"b81e04c9d2f35a67","toSide":"left","label":"détaille"}
```

## 6. Couleurs

Une valeur `color` est une chaîne, de deux formes :

1. **Préréglage** : un chiffre de `"1"` à `"6"`, **entre guillemets** (chaîne, pas nombre). La teinte réelle est définie par le thème d'Obsidian. **C'est la forme à privilégier** : elle suit le thème (clair/sombre, thèmes communautaires). Dans les 4 canvas réels analysés, l'hexadécimal n'apparaît que sur 18 nœuds d'un seul fichier ; tout le reste utilise les préréglages.
2. **Hexadécimal** : `#RRGGBB` (6 chiffres), ex. `"#FF5733"`. Couleur fixe, identique dans tous les thèmes. La casse n'est pas normalisée par Obsidian (majuscules et minuscules sont conservées). Les formes courtes (`#F53`) n'ont pas été testées : ne pas les utiliser.

| Préréglage | Nom (spec JSON Canvas) | Rendu vérifié dans Obsidian |
|---|---|---|
| `"1"` | rouge | oui (carte, flèche et pointes) |
| `"2"` | orange | oui (carte texte) |
| `"3"` | jaune | non (présent dans les canvas réels, pas vu à l'écran) |
| `"4"` | vert | oui (groupe) |
| `"5"` | cyan | oui (groupes) |
| `"6"` | violet | non |

Les valeurs RGB exactes des préréglages ne sont pas définies par le format et n'ont pas été relevées : elles dépendent du thème. Un groupe sans `color` est gris neutre.

## 7. Écriture et réécriture par Obsidian

Cette section décrit ce qu'Obsidian **écrit** et ce qu'il **modifie** quand il enregistre un canvas ouvert, y compris un canvas produit par un autre outil.

### 7.1 Mise en forme du fichier

Constatée sur 4 fichiers réels et sur les fichiers de test réécrits : indentation par **tabulations**, **un objet par ligne** (nœud ou arête sur une ligne compacte), pas d'espace après les `:` ni les `,`, fins de ligne `\n`, **pas de retour à la ligne final**, caractères accentués écrits tels quels (pas de `é`). JSON n'impose rien de cela ; le respecter évite des diffs Git parasites dans un coffre versionné.

```
{
	"nodes":[
		{"id":"…","type":"text","text":"…","x":0,"y":0,"width":250,"height":60,"color":"6"},
		{"id":"…","type":"file","file":"…","x":0,"y":0,"width":400,"height":300}
	],
	"edges":[
		{"id":"…","fromNode":"…","fromSide":"right","toNode":"…","toSide":"left","label":"…"}
	]
}
```

### 7.2 Ordre des champs

| Objet | Ordre écrit par Obsidian |
|---|---|
| Nœud `text` | `id`, `type`, `text`, `x`, `y`, `width`, `height`, `color` |
| Nœud `file` | `id`, `type`, `file`, `subpath`, `x`, `y`, `width`, `height`, `color` |
| Nœud `link` | `id`, `type`, `url`, `x`, `y`, `width`, `height`, `color` (ordre non vu écrit par Obsidian) |
| Nœud `group` | `id`, `type`, `backgroundStyle`, `x`, `y`, `width`, `height`, `color`, `label`, `background` |
| Arête | `id`, `fromNode`, `fromSide`, `toNode`, `toSide`, `fromEnd`, `toEnd`, `color`, `label` |

Les champs facultatifs absents sont simplement omis. Position de `color` par rapport à `toEnd` : non vue.

### 7.3 Ce que l'enregistrement modifie

| Ce qui avait été écrit | Après enregistrement par Obsidian |
|---|---|
| `fromEnd:"arrow"` + `toEnd:"arrow"` | `fromEnd:"arrow"` seul (`toEnd:"arrow"` est le défaut, supprimé) |
| `fromEnd:"none"` + `toEnd:"none"` | `toEnd:"none"` seul (`fromEnd:"none"` est le défaut, supprimé) |
| `fromEnd:"arrow"` + `toEnd:"none"` | inchangé |
| arête sans `fromSide`/`toSide` | côtés déduits **ajoutés** (`right`, `left` dans l'essai) |
| groupe `label` avant `x` | `label` déplacé après `color`, `background` en dernier |
| groupe sans `backgroundStyle` | aucun `backgroundStyle` ajouté |
| `subpath` introuvable, fichier absent | conservés tels quels |
| `toEnd:"none"`, `url`, `subpath`, `color` hexadécimal | conservés tels quels |
| nœud sélectionné ou déplacé | passe en **fin de tableau** (premier plan) |

Aucun champ n'est supprimé en dehors des valeurs par défaut ci-dessus.

**Ordre des nœuds instable.** Les nœuds touchés se retrouvent à la fin dans l'ordre où on les a manipulés ; le groupe non touché reste en tête. Un diff Git montre donc des lignes déplacées sans changement de contenu. Un outil externe ne doit pas utiliser la position dans `nodes` comme identifiant : utiliser `id`.

### 7.4 Propriétés inconnues, extensions

Un lecteur DOIT ignorer les propriétés inconnues sans erreur, et un éditeur DOIT les conserver telles quelles à la réécriture. Les 4 canvas réels n'en contenaient aucune, mais des extensions (plugins) d'Obsidian peuvent en ajouter ; les supprimer casserait leurs fonctions.

**Constaté le 25/11/2026** (Obsidian de l'utilisateur, un canvas ouvert, une carte ajoutée pour forcer l'écriture) : Obsidian réécrit le fichier et **conserve** les propriétés libres à la racine (`tags` : liste de mots, `malorean` : objet), sur une carte (`tags`) et sur une flèche (`note`). Il reformate seulement : clés d'une carte réordonnées, une clé par ligne. MALOREAN Notes range donc les étiquettes d'un canvas dans une propriété `tags` à la racine du fichier (liste de mots, comme l'en-tête d'une note) ; Obsidian ne les montre ni ne les indexe. Sous les onglets de sa colonne, le **champ d'étiquettes** de l'application les montre en pastilles avec « × », avec un champ « Ajouter une étiquette » et un « + » : un geste réécrit le fichier avec la propriété `tags` changée (retirée s'il n'y en a plus), toutes les autres propriétés gardées, et le canvas relit le fichier. Le filtre par étiquette de l'application montre un canvas par ses étiquettes.

### 7.5 Édition simultanée

Si le fichier est modifié hors d'Obsidian pendant qu'il est ouvert, Obsidian le recharge (constaté) ; une écriture concurrente peut être perdue. Fermer le canvas avant une édition externe massive.

### 7.6 Versions

JSON Canvas 1.0 ne définit aucun champ de version dans le fichier. La version d'Obsidian utilisée pour les observations n'a pas été relevée.

## 8. Règles de validation

Un fichier est **valide** si :

1. Il s'agit d'un document JSON bien formé (UTF-8 sans BOM), dont la racine est un objet.
2. `nodes` et `edges`, s'ils sont présents, sont des tableaux.
3. Chaque nœud possède `id`, `type`, `x`, `y`, `width`, `height` et les champs obligatoires de son type (§4).
4. `type` vaut `text`, `file`, `link` ou `group`.
5. `x`, `y`, `width`, `height` sont des entiers.
6. Les `id` sont uniques (nœuds et arêtes confondus).
7. Chaque arête possède `id`, `fromNode`, `toNode`, et ces deux derniers désignent des nœuds existants.
8. `fromSide`/`toSide` ∈ {`top`, `right`, `bottom`, `left`} ; `fromEnd`/`toEnd` ∈ {`none`, `arrow`} ; `backgroundStyle` ∈ {`cover`, `ratio`, `repeat`}.
9. `color` est un préréglage `"1"`–`"6"` ou un hexadécimal `#RRGGBB`.
10. `subpath`, s'il est présent, commence par `#`.

**DEVRAIT** (valide mais à corriger, signalé en avertissement) : `width` et `height` strictement positifs ; groupes avant leur contenu ; `id` au format d'Obsidian ; côtés d'arête présents ; pas de valeur par défaut explicite sur `fromEnd`/`toEnd` ; chemins relatifs à la racine du coffre et existants ; pas de propriété inconnue.

**Outils**
- `valider_canvas.py` : applique les règles ci-dessus et signale les avertissements. Sans dépendance (Python 3). `python3 valider_canvas.py --vault <racine du coffre> --style mon.canvas` ; `--strict` traite les avertissements comme des erreurs ; `--style` contrôle aussi la mise en forme du §7.1 ; `--vault` vérifie l'existence des fichiers, images et ancres.
- `canvas.schema.json` : schéma JSON pour les règles 1 à 5, 8, 9 et 10. Les règles 6 et 7 (unicité, références) ne sont pas exprimables en JSON Schema : utiliser le script.

## 9. Générer un canvas compatible Obsidian

Liste à suivre pour qu'Obsidian ouvre le fichier, le rende comme prévu et le réécrive sans le changer (hors ordre des nœuds, §7.3) :

1. Racine `{"nodes":[…],"edges":[…]}`, UTF-8 sans BOM, mise en forme du §7.1, champs dans l'ordre du §7.2.
2. `id` : 16 caractères hexadécimaux minuscules, uniques sur nœuds **et** arêtes.
3. Entiers pour `x`, `y`, `width`, `height`.
4. Dimensionner les cartes texte à leur contenu (hauteur non adaptative). Carte courte : 250 × 60.
5. Couleurs : préréglages `"1"` à `"6"` en chaînes ; sinon `#RRGGBB`.
6. Arêtes : toujours `fromSide` et `toSide` ; omettre `fromEnd:"none"` et `toEnd:"arrow"` ; laisser de la place pour les libellés (courts).
7. Groupes en premier dans `nodes`, assez grands pour contenir leurs nœuds (appartenance géométrique), libellé court.
8. `file` et `background` : chemin depuis la racine du coffre. `subpath` : `#Titre` ou `#^bloc`.
9. Ne pas supposer que l'ordre des nœuds survit à une édition dans Obsidian.
10. Valider : `python3 valider_canvas.py --vault <coffre> --style --strict fichier.canvas`.

## 10. Statut de vérification

**Sources**
- **Standard** : JSON Canvas 1.0, <https://jsoncanvas.org/spec/1.0/>.
- **4 canvas réels** créés dans Obsidian, analysés le 2026-11-24 par script (31 + 77 + 19 + 170 nœuds, 25 + 82 + 22 + 175 arêtes ; 297 nœuds dont 259 texte et 15 fichier, 304 arêtes). Ces fichiers ne sont pas conservés dans le dépôt.
- **`exemple.canvas`** : écrit à la main d'après le standard, ouvert dans Obsidian, modifié (nœuds déplacés) et enregistré par Obsidian ; captures d'écran et fichier relu.
- **`kit-test/`** (`exemple-2.canvas`, une note et une image) : fonds de groupe, ancres, extrémités d'arêtes, arête sans côtés ; trois ouvertures dans Obsidian, captures d'écran, fichier relu après enregistrement.

**Observé dans Obsidian** (rendu et/ou écriture)

| Domaine | Constat |
|---|---|
| Structure | Racine `nodes`/`edges` seulement ; nœuds `text`, `file`, `link`, `group` ; arêtes ; aucune propriété hors spec dans les 4 canvas réels. |
| Nœuds fichier | Images et notes ; `subpath` titre, bloc et introuvable ; fichier absent. |
| Groupes | `label`, `color`, `background` et les trois `backgroundStyle` ; défaut = `cover`. |
| Liens | `url` chargée dans la carte. |
| Arêtes | Les 4 combinaisons d'extrémités ; arête sans côtés ; `label` ; `color`. |
| Couleurs | Préréglages 1, 2, 4, 5 vus à l'écran ; 3 et 6 présents dans les fichiers réels ; hexadécimal en majuscules et en minuscules. |
| Réécriture | Défauts supprimés, côtés ajoutés, ordre des champs, ordre des nœuds (§7.3). |

**Non vérifié**
- Rendu des préréglages `"3"` et `"6"`, valeurs RGB exactes des préréglages (thème).
- Formes courtes d'hexadécimal (`#RGB`).
- Ordre des champs d'un nœud `link` écrit par Obsidian ; position de `color` par rapport à `toEnd`.
- Fichiers autres que notes et images (PDF, audio, vidéo) : prévus par le standard, non testés ici.
- Champs ajoutés par d'autres versions d'Obsidian ou par des extensions ; version d'Obsidian utilisée.
- Pourquoi la hauteur du groupe `ratio` est passée de 220 à 150 pendant l'essai (redimensionnement manuel ou effet du mode `ratio`) : non établi.
- Les 4 canvas réels n'ayant plus été conservés, le validateur n'a pas pu être rejoué dessus.

## 11. Exemples

- `exemple.canvas` : un groupe, deux cartes texte, un fichier avec `subpath`, un lien web et trois arêtes. À ouvrir dans un coffre où `Notes/Projet.md` existe, sinon la carte fichier affiche l'erreur « introuvable ».
- `kit-test/exemple-2.canvas` : version réécrite par Obsidian (voir le README du dossier).

## Références

- JSON Canvas 1.0 : <https://jsoncanvas.org/spec/1.0/>
- Dépôt de la spécification : <https://github.com/obsidianmd/jsoncanvas>
