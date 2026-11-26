# Canvas d'Obsidian : rendu constaté

Version de la spécification : 1.2. **Le format du fichier `.canvas` (structure, champs, couleurs écrites, validation, écriture, fusion) est décrit dans [doc/format/canvas.md](../format/canvas.md), seule description du format dans le projet.** Ce document garde ce qui a été **observé à l'écran dans Obsidian** (rendu des cartes, des groupes, des flèches et des couleurs) et l'état de ces vérifications. Le comportement du canvas dans MALOREAN Notes est dans [canvas-comportement.md](canvas-comportement.md).

Les fichiers qui accompagnaient cette spécification (`valider_canvas.py`, `canvas.schema.json`, `exemple.canvas`, `kit-test/`) ne sont pas repris dans ce projet pour l'instant.

Les numéros de sections sont gardés : du code et des fiches y renvoient.

## 1. Vue d'ensemble

Un canvas est un tableau blanc infini contenant des cartes positionnées librement, reliées par des flèches. Le fichier : voir [doc/format/canvas.md](../format/canvas.md), sections 1 et 2.

## 2. Structure racine

Voir [doc/format/canvas.md](../format/canvas.md), section 2.

## 3. Système de coordonnées

Voir [doc/format/canvas.md](../format/canvas.md), section 2.1.

## 4. Nœuds

Les champs de chaque sorte de carte : [doc/format/canvas.md](../format/canvas.md), sections 3 et 4. Rendu constaté dans Obsidian :

### 4.1 Toutes les cartes

La hauteur d'une carte **ne s'adapte pas au contenu** : un texte plus long est coupé en bas de la carte (une barre de défilement apparaît quand la carte est sélectionnée). Une carte sans couleur prend la couleur neutre du thème.

### 4.2 Carte texte

Le Markdown est rendu (`# …` en gros titre ; syntaxe d'Obsidian : `[[liens]]`, `#tags`, listes de tâches…).

### 4.3 Carte de fichier

**Rendu selon le fichier.** Note Markdown : aperçu. Image : affichée. L'ancre s'applique aux notes Markdown :

| Ancre | Titre de la carte | Contenu affiché |
|---|---|---|
| absente | nom de la note sans extension (`Projet`) | la note entière |
| `#Objectifs` (titre) | `Projet › Objectifs` | la section : le titre et son contenu, jusqu'au titre suivant |
| `#^bloc-test` (bloc) | `Projet › ^bloc-test` | le seul paragraphe portant l'identifiant (sans l'identifiant lui-même) |
| `#Inexistant` (introuvable) | `Projet › Inexistant` | message « Impossible de trouver “Inexistant” dans Projet » ; la note existe, seule l'ancre manque |

**Fichier absent du coffre.** La carte reste affichée avec le message « *chemin#ancre n'a pas été trouvé* » et les boutons Nouvelle note, Échanger le fichier, Supprimer. Obsidian ne retire pas la carte.

### 4.4 Carte de page web

Obsidian charge réellement la page dans la carte et affiche le titre de la page au-dessus.

### 4.5 Groupe

Le nom est affiché dans une étiquette sur le coin supérieur gauche du cadre, de la couleur du groupe. Un nom trop long pour la largeur du groupe est tronqué avec « … ». Un groupe sans couleur est gris neutre. Déplacer un groupe dans Obsidian déplace les cartes qu'il contient (l'appartenance : [doc/format/canvas.md](../format/canvas.md), section 4.4).

**Fond d'image** (vérifié avec une image 128 × 64, soit 2:1) :

| Style d'arrière-plan | Rendu |
|---|---|
| `cover` (ou absent) | L'image remplit tout le groupe. |
| `ratio` | L'image garde ses proportions. Dans l'essai, le groupe mesurait 300 × 150 (exactement 2:1) : l'image le remplit sans bande vide. |
| `repeat` | Mosaïque de l'image à sa taille d'origine (128 × 64 px), coupée aux bords du groupe. |

Une image introuvable ne produit **aucune erreur** : le groupe s'affiche sans fond.

## 5. Arêtes

Les champs d'une flèche, les côtés et les extrémités : [doc/format/canvas.md](../format/canvas.md), section 5. Rendu constaté dans Obsidian :

- **Tracé** : une courbe de Bézier entre les deux points d'accroche (une ligne droite quand les cartes sont alignées face à face). Le tracé exact n'est pas défini par le format.
- **Couleur** : elle s'applique à la ligne et aux pointes.
- **Étiquette** : posée au milieu, sur un fond qui masque la ligne ; garder des étiquettes courtes et un écart suffisant entre cartes.
- Une flèche d'une carte vers elle-même : son rendu n'est pas garanti.

## 6. Couleurs

Les valeurs écrites et la palette de l'application : [doc/format/canvas.md](../format/canvas.md), section 6. Rendu constaté des préréglages dans Obsidian :

| Préréglage | Nom (JSON Canvas) | Rendu vérifié dans Obsidian |
|---|---|---|
| `"1"` | rouge | oui (carte, flèche et pointes) |
| `"2"` | orange | oui (carte texte) |
| `"3"` | jaune | non (présent dans les canvas réels, pas vu à l'écran) |
| `"4"` | vert | oui (groupe) |
| `"5"` | cyan | oui (groupes) |
| `"6"` | violet | non |

Un préréglage suit le thème d'Obsidian (clair, sombre, thèmes communautaires) ; un hexadécimal est identique dans tous les thèmes. Dans les 4 canvas réels analysés, l'hexadécimal n'apparaît que sur 18 cartes d'un seul fichier ; tout le reste utilise les préréglages.

## 7. Écriture et réécriture par Obsidian

Voir [doc/format/canvas.md](../format/canvas.md), sections 8, 9 et 13.

### 7.4 Étiquettes d'un canvas à l'écran

Où le fichier les range : [doc/format/canvas.md](../format/canvas.md), section 2.2. Sous les onglets de sa colonne, le **champ d'étiquettes** de l'application les montre en pastilles avec « × », avec un champ « Ajouter une étiquette » et un « + » : un geste réécrit les étiquettes du fichier, et le canvas relit le fichier. Le filtre par étiquette de l'application montre un canvas par ses étiquettes. Obsidian ne les montre ni ne les indexe.

## 8. Règles de validation

Voir [doc/format/canvas.md](../format/canvas.md), section 7.

## 9. Générer un canvas compatible Obsidian

Voir [doc/format/canvas.md](../format/canvas.md), sections 3, 5, 9 et 13.

## 10. Statut de vérification

**Sources**
- **Standard** : JSON Canvas 1.0, <https://jsoncanvas.org/spec/1.0/>.
- **4 canvas réels** créés dans Obsidian, analysés le 2026-11-24 par script (31 + 77 + 19 + 170 nœuds, 25 + 82 + 22 + 175 arêtes ; 297 nœuds dont 259 texte et 15 fichier, 304 arêtes). Ces fichiers ne sont pas conservés dans le dépôt.
- **`exemple.canvas`** : écrit à la main d'après le standard, ouvert dans Obsidian, modifié (nœuds déplacés) et enregistré par Obsidian ; captures d'écran et fichier relu.
- **`kit-test/`** (`exemple-2.canvas`, une note et une image) : fonds de groupe, ancres, extrémités d'arêtes, arête sans côtés ; trois ouvertures dans Obsidian, captures d'écran, fichier relu après enregistrement.
- **Propriétés libres** : constaté le 25/11/2026 sur l'Obsidian de l'utilisateur (un canvas ouvert, une carte ajoutée pour forcer l'écriture).

**Observé dans Obsidian** (rendu et/ou écriture)

| Domaine | Constat |
|---|---|
| Structure | Racine `nodes`/`edges` seulement ; nœuds `text`, `file`, `link`, `group` ; arêtes ; aucune propriété hors spec dans les 4 canvas réels. |
| Nœuds fichier | Images et notes ; ancre titre, bloc et introuvable ; fichier absent. |
| Groupes | Nom, couleur, fond d'image et les trois styles ; défaut = `cover`. |
| Liens | Page chargée dans la carte. |
| Arêtes | Les 4 combinaisons d'extrémités ; arête sans côtés ; étiquette ; couleur. |
| Couleurs | Préréglages 1, 2, 4, 5 vus à l'écran ; 3 et 6 présents dans les fichiers réels ; hexadécimal en majuscules et en minuscules. |
| Réécriture | Défauts supprimés, côtés ajoutés, ordre des champs, ordre des nœuds, propriétés libres conservées. |

**Non vérifié**
- Rendu des préréglages `"3"` et `"6"`, valeurs RGB exactes des préréglages (thème).
- Formes courtes d'hexadécimal (`#RGB`).
- Ordre des champs d'un nœud `link` écrit par Obsidian ; position de `color` par rapport à `toEnd`.
- Fichiers autres que notes et images (PDF, audio, vidéo) : prévus par le standard, non testés ici.
- Champs ajoutés par d'autres versions d'Obsidian ou par des extensions ; version d'Obsidian utilisée.
- Pourquoi la hauteur du groupe `ratio` est passée de 220 à 150 pendant l'essai (redimensionnement manuel ou effet du mode `ratio`) : non établi.
- Les 4 canvas réels n'ayant plus été conservés, le validateur n'a pas pu être rejoué dessus.

## 11. Exemples

Un exemple complet de fichier : [doc/format/canvas.md](../format/canvas.md), section 14. Les fichiers d'essai d'origine (`exemple.canvas`, `kit-test/exemple-2.canvas`) ne sont pas dans le dépôt.

## Références

- Format du fichier : [doc/format/canvas.md](../format/canvas.md)
- JSON Canvas 1.0 : <https://jsoncanvas.org/spec/1.0/>
- Dépôt de la spécification : <https://github.com/obsidianmd/jsoncanvas>
