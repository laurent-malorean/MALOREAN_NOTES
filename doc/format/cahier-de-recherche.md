# Format de fichier : le cahier de recherche

Spécification du fichier d'un **cahier de recherche** : une note Markdown où l'on ne fait qu'ajouter des **entrées** datées, la plus ancienne en haut, la plus récente en bas, comme dans un cahier de laboratoire. Elle suffit pour lire ou écrire un cahier avec un autre outil que MALOREAN Notes.

Les règles communes à toutes les notes ne sont pas reprises ici :

- en-tête YAML en général (délimiteurs, clés `tags`, `pinned`, fins de ligne), titre `#`, nom du fichier, encodage : `doc/format/note.md` ;
- pièces jointes, liens entre notes, organisation des dossiers : `doc/format/note.md` et `doc/format/espace-de-travail.md`.

Ce document ne décrit que ce qui est propre au cahier de recherche.

## 1. Reconnaître un cahier

- Un cahier de recherche est une note dont l'**en-tête** déclare le type de contenu `cahier-de-recherche` :

  ```yaml
  ---
  type: cahier-de-recherche
  ---
  ```

- Règles de lecture de la clé `type` :
  - l'en-tête doit commencer au tout premier caractère du fichier (`---` suivi d'une fin de ligne) et être fermé par une ligne `---` seule ; sans en-tête fermé, la note n'est pas un cahier ;
  - seule compte la **première** ligne `type:` du **premier niveau** (écrite en début de ligne, sans retrait) ; des espaces ou tabulations sont permis entre `type` et `:` ;
  - la valeur est lue jusqu'à un éventuel commentaire `#`, espaces retirés, puis guillemets simples ou doubles retirés : `type: "cahier-de-recherche"`, `type: 'cahier-de-recherche'` et `type: cahier-de-recherche # labo` sont équivalents ;
  - la valeur est sensible à la casse : `Cahier-de-recherche` n'est pas reconnu.
- Une note dont le type est absent ou inconnu est une note ordinaire : elle n'a pas d'entrées, et l'application refuse d'y ajouter une entrée.
- Les autres clés de l'en-tête (`tags`, `pinned`…) sont permises et gardées telles quelles ; elles suivent les règles de `doc/format/note.md`.

## 2. Structure du fichier

Un cahier se compose, dans cet ordre :

1. l'**en-tête** (section 1) ;
2. le **titre** du cahier, une ligne `# Titre` (règles du titre : `doc/format/note.md`) ;
3. le **corps** : des titres d'année, de mois et de jour, et sous chaque titre de jour, ses entrées.

Exemple minimal, un cahier neuf tel que l'application le crée :

```markdown
---
type: cahier-de-recherche
---
# Levures
```

- L'en-tête d'un cahier neuf ne contient que `type: cahier-de-recherche`.
- Le titre est celui demandé à la création, ramené à une seule ligne (espaces et retours à la ligne successifs réduits à une espace) ; un titre vide devient « Cahier de recherche ».
- Un cahier neuf n'a aucune entrée ni aucun titre d'année.

## 3. Titres d'année, de mois et de jour

Les entrées sont rangées sous trois niveaux de titres, toujours écrits en début de ligne :

- **Année** : `## ` suivi de l'année sur exactement 4 chiffres : `## 2026`.
- **Mois** : `### ` suivi du nom du mois en français, en toutes lettres, avec ses accents : `### Novembre`, `### Février`, `### Août`, `### Décembre`.
- **Jour** : `#### ` suivi du jour de la semaine en français et du numéro du jour dans le mois : `#### Vendredi 20` ; le premier du mois s'écrit `1er` : `#### Mardi 1er`.

### 3.1 Ce que l'application écrit

- Le mois commence par une majuscule, le reste en minuscules : `Janvier`, `Février`, `Mars`, `Avril`, `Mai`, `Juin`, `Juillet`, `Août`, `Septembre`, `Octobre`, `Novembre`, `Décembre`.
- Le jour de la semaine commence par une majuscule : `Lundi`, `Mardi`, `Mercredi`, `Jeudi`, `Vendredi`, `Samedi`, `Dimanche`.
- Le numéro du jour s'écrit sans zéro de tête (`#### Lundi 2`, jamais `02`), sauf le premier du mois, écrit `1er`.
- Chaque titre est précédé d'une ligne vide.

### 3.2 Ce que l'application accepte à la lecture

- **Année** : après `## `, exactement 4 chiffres (espaces autour tolérés). `## 20266`, `## +026` ou `## 2026 bis` ne sont pas des titres d'année.
- **Mois** : après `### `, le nom du mois seul, sans tenir compte des majuscules (`### novembre`, `### NOVEMBRE`) ; les accents sont obligatoires (`### Fevrier` n'est pas reconnu). `### Novembre 2026` ou `### Brumaire` ne sont pas des titres de mois.
- **Jour** : après `#### `, seul le **dernier mot** compte ; il doit être un nombre de 1 à 31, éventuellement suivi de `er`. Le jour de la semaine n'est ni exigé ni vérifié : `#### 20`, `#### jeudi 20` et `#### Vendredi 20` désignent tous le 20. `#### Jeudi` (sans numéro) et `#### Vendredi 32` ne sont pas des titres de jour.
- Le numéro du jour n'est pas comparé au nombre de jours du mois : un `#### 31` sous `### Février` est accepté tel quel.

### 3.3 Le jour en cours

En lisant le fichier de haut en bas, l'application tient un **jour en cours** (année, mois, jour), d'après les titres rencontrés :

- un titre d'année fixe l'année et efface le mois et le jour ;
- un titre de mois fixe le mois et efface le jour ;
- un titre de jour fixe le jour ;
- **toute autre ligne qui commence par `#`** (le titre `# Levures`, un `## Notes`, un titre d'année, de mois ou de jour mal formé, `#####`…) efface l'année, le mois et le jour.

Une entrée n'est reconnue que si le jour en cours est complet (année, mois et jour connus). C'est pourquoi les titres suivent l'ordre année, mois, jour : un titre de jour sous un mois sans année, ou une entrée sous un mois sans titre de jour, ne donne pas d'entrée.

## 4. Entrées

### 4.1 Première ligne

Une entrée est un élément de liste du premier niveau, écrit ainsi :

```
- HH:MM - texte
```

- `- ` en tout début de ligne (tiret puis une espace, sans retrait) ;
- l'heure sur exactement deux chiffres, `:`, les minutes sur exactement deux chiffres : `09:42`, `00:01`, `18:05` ;
- puis exactement ` - ` (espace, tiret, espace) ;
- puis le texte de la première ligne.

L'heure va de `00` à `23`, les minutes de `00` à `59`. L'heure est l'heure locale du Mac au moment de l'ajout, à la minute.

### 4.2 Lignes suivantes

- Une entrée peut tenir sur plusieurs lignes. Ses lignes suivantes sont en **retrait de deux espaces** (le retrait du texte d'un élément de liste : le Markdown reste une liste).
- Ses lignes vides intérieures restent vides (sans retrait).
- Une ligne suivante peut contenir n'importe quel Markdown : grâce au retrait, une ligne `  # …` ou `  - 10:00 - …` reste du texte de l'entrée, jamais un titre ni une nouvelle entrée.
- Un retrait plus grand que deux espaces est gardé au-delà des deux premières : `      code` (six espaces) donne `    code` dans le texte de l'entrée.

### 4.3 Moment, ancre et numéro

Chaque entrée reconnue a :

- un **moment** : la date du jour en cours (section 3.3) et l'heure de sa première ligne ; lu en toutes lettres : `20 novembre 2026 à 09:42`, `1er décembre 2026 à 18:05` (mois en minuscules) ;
- une **ancre d'une entrée** : `AAAA-MM-JJ-HHhMM`, par exemple `2026-11-20-09h42` ; la deuxième, la troisième entrée du même moment (même date, même heure et même minute, où qu'elles soient dans le fichier) prennent le suffixe `-2`, `-3`… : `2026-11-20-09h42-2` ;
- un **numéro d'entrée** : sa position parmi les entrées reconnues du cahier, dans l'ordre du fichier, à partir de 1. Il se montre sur 4 chiffres (`0001`, `0007`) et en entier au-delà de 9999 (`10000`).

L'ancre et le numéro ne sont **jamais écrits dans le fichier** : ils se calculent à la lecture. Comme on n'ajoute qu'à la fin, ils ne changent jamais pour une entrée déjà écrite. Un fichier modifié à la main (entrée retirée ou insérée) les décale : l'application ne le vérifie pas.

### 4.4 Ordre et séparation

- Les entrées sont dans l'ordre de leur ajout : l'ordre du fichier est l'ordre chronologique de saisie.
- Les entrées d'un même jour se suivent **sans ligne vide** entre elles.
- Une entrée qui suit un titre ou un paragraphe en est séparée par une ligne vide.
- L'ordre n'est pas vérifié à la lecture : une heure plus ancienne que la précédente (horloge reculée, changement d'heure) reste une entrée valide.

### 4.5 Texte d'une entrée

Le texte d'une entrée, tel que l'application le lit (pour l'index, la recherche, les outils de Claude), est :

- le texte de la première ligne après ` - ` ;
- puis chaque ligne suivante sans son retrait de deux espaces, les lignes vides intérieures gardées ;
- les lignes vides qui suivent la dernière ligne de l'entrée n'en font pas partie.

## 5. Rectifier une entrée

- Une entrée ne se modifie jamais. Une erreur se rectifie par une **nouvelle entrée**, à la fin du cahier, qui peut citer l'entrée rectifiée par un lien vers son ancre :

  ```markdown
  - 10:15 - Rectifie [l'entrée du 20 novembre 2026 à 09:42](#2026-11-20-09h42) : Levure A : mousse
  ```

- Le lien `[texte](#ancre)` vers une entrée ne fonctionne qu'à l'intérieur du même cahier : un clic dessus montre l'entrée de cette ancre. Il n'existe pas de lien vers une entrée depuis une autre note.
- Ce lien est du texte comme un autre : aucune règle de format ne rattache une entrée à celle qu'elle rectifie, et l'application ne vérifie pas que l'ancre existe.
- Les cahiers écrits avant la fiche 0049 peuvent contenir des entrées de la forme `- 10:15 - Correction de [l'entrée du 20 novembre 2026 à 09:42](#2026-11-20-09h42) : …`. Ce sont des entrées ordinaires ; leur lien fonctionne toujours. L'application n'écrit plus cette forme.
- Pour citer une entrée hors du cahier, on emploie la **référence** `Titre du cahier · 0007` (titre du cahier, espace, point médian, espace, numéro d'entrée sur 4 chiffres) : c'est du texte, pas un lien.

## 6. Ce que l'application tolère à la lecture

Le fichier reste la seule vérité ; l'application lit sans jamais réparer. Une ligne du corps est, dans cet ordre de reconnaissance :

1. un titre d'année, de mois ou de jour bien formé (section 3.2) : il change le jour en cours ;
2. toute autre ligne commençant par `#` : elle efface le jour en cours ;
3. une ligne vide (ou faite seulement d'espaces) : elle ne termine pas l'entrée en cours ;
4. une ligne qui commence par une espace ou une tabulation : la suite de l'entrée en cours, s'il y en a une, sinon ignorée ; le retrait retiré est de deux espaces, ou d'une tabulation, ou à défaut tout le retrait (une seule espace) ;
5. une première ligne d'entrée bien formée (section 4.1) ;
6. toute autre ligne (paragraphe, élément de liste d'une autre forme, entrée mal formée) : du **texte libre**.

Conséquences :

- **Texte libre** : un paragraphe, une liste ordinaire, une citation au premier niveau sont permis n'importe où ; ils sont gardés dans le fichier et montrés, mais ne sont pas des entrées. Ils terminent l'entrée en cours : une ligne en retrait qui les suit n'appartient à aucune entrée.
- **Entrée mal formée** : `- 9:02 - …` (heure sur un chiffre), `- 09:03 -collé` (sans espace après le tiret), `- 25:00 - …` (heure hors bornes), `  - 09:42 - …` (en retrait) ou `* 09:42 - …` (autre puce) ne sont pas des entrées. Une première ligne bien formée mais hors bornes (`- 25:00 - …`) ou sous un jour incomplet n'ouvre pas d'entrée : ses lignes suivantes sont ignorées aussi.
- **Lignes vides dans une entrée** : des lignes vides suivies d'une ligne en retrait font partie de l'entrée ; des lignes vides suivies d'une nouvelle entrée ou d'un titre la terminent.
- **Texte d'entrée vide** : `- 09:42 - ` (rien après le séparateur) est une entrée, de texte vide ; `- 09:42 -` (sans l'espace finale) n'en est pas une.
- **Titre intercalé** : un titre d'une autre sorte (`## Notes`) placé après un jour efface le jour en cours ; les entrées qui le suivent ne sont reconnues qu'après de nouveaux titres d'année, de mois et de jour.
- **Fins de ligne** : `\n` et `\r\n` sont acceptées, même mélangées ; le `\r` final de chaque ligne est ignoré.
- Un en-tête non fermé fait de tout le fichier le corps ; mais une note sans en-tête fermé n'est de toute façon pas un cahier (section 1).

## 7. Ce que l'application écrit, et n'écrit jamais

### 7.1 Écritures permises

- **Création** : l'en-tête et le titre seuls (section 2).
- **Ajout d'une entrée**, seule écriture du corps (depuis la zone de saisie du cahier ou l'outil de Claude « ajouter une entrée »), toujours **à la fin du fichier** :
  1. les fins de ligne en fin de fichier sont retirées (les espaces en fin de dernière ligne sont gardés) ;
  2. les titres qui manquent sont écrits, chacun précédé d'une ligne vide, en comparant le moment de l'ajout au **jour en cours en fin de fichier** (section 3.3) :
     - année différente (ou inconnue) : titres d'année, de mois et de jour ;
     - même année, mois différent : titres de mois et de jour ;
     - même mois, jour différent : titre de jour ;
     - même jour : aucun titre ;
  3. l'entrée est écrite après **une seule** fin de ligne si aucun titre n'a été écrit et que la dernière ligne non vide du fichier appartient à une entrée ; après une ligne vide sinon ;
  4. le fichier se termine par une fin de ligne.
- La comparaison ne porte que sur le jour en cours en fin de fichier : une horloge qui recule écrit quand même l'entrée à la fin, sous un titre de jour (voire de mois ou d'année) répété au besoin ; un titre d'une autre sorte en fin de cahier fait réécrire l'année, le mois et le jour.
- **Texte de l'entrée ajoutée** :
  - les fins de ligne `\r\n` et `\r` du texte saisi deviennent des fins de ligne simples ;
  - les espaces de fin de chaque ligne sont retirés ;
  - les lignes vides du début et de la fin sont retirées ;
  - la première ligne perd aussi son retrait de début ; les lignes suivantes gardent le leur, précédé des deux espaces de retrait ;
  - les lignes vides intérieures sont écrites vides.
- **Fins de ligne du fichier** : si le cahier contient au moins une fin de ligne `\r\n`, tout ce qui est ajouté l'est en `\r\n` ; sinon en `\n`.
- **Refus** : un texte vide (ou fait seulement d'espaces et de lignes vides) est refusé (« l'entrée est vide ») ; une note qui n'est pas un cahier est refusée (« cette note n'est pas un cahier de recherche »). Un refus n'écrit rien.
- **En-tête** : les étiquettes (`tags`) et l'épinglage (`pinned`) se changent comme pour toute note, selon `doc/format/note.md` ; le corps n'en est pas touché.
- **Titre** : un renommage remplace le titre `#`, selon `doc/format/note.md`.

### 7.2 Ce que l'application n'écrit jamais

- Elle ne modifie, ne déplace, ne supprime et ne réordonne aucune entrée, aucun titre d'année, de mois ou de jour, aucun texte libre déjà écrit.
- Elle n'insère jamais rien avant la fin du fichier.
- Elle n'écrit ni ancre, ni numéro d'entrée, ni identifiant caché, ni empreinte.
- Elle ne réécrit pas un cahier mal formé pour le corriger.
- Dans l'éditeur, le texte du cahier est en lecture seule ; les outils de Claude qui lisent ou remplacent le texte d'une note refusent un cahier. Un autre outil peut toujours modifier le fichier : l'application relit alors le fichier tel qu'il est, avec les règles de la section 6.

## 8. Découpage en entrées pour l'index

- Seule une note de type `cahier-de-recherche` est découpée en entrées ; une note ordinaire contenant des lignes `- 09:42 - …` ne l'est pas.
- Le cahier lui-même est indexé comme toute note, avec le type de contenu « cahier de recherche ».
- Chaque entrée reconnue (sections 4 et 6) devient un élément à part de l'index :
  - type de contenu : entrée (`entree`) ;
  - titre : son moment en toutes lettres, `20 novembre 2026 à 09:42` ;
  - texte cherché : son texte (section 4.5), sans les retraits ;
  - conteneur : le cahier (son chemin) ; la recherche montre « Entrée · titre du cahier » ;
  - date de modification : celle du cahier ; ni étiquettes, ni épinglage.
- Le texte libre, les titres et les entrées mal formées ne donnent pas d'entrée.
- Une recherche par les mots trouve une entrée quand tous les mots cherchés sont dans la même entrée.
- Les entrées sont relues chaque fois que le cahier est relu ; un cahier oublié de l'index emporte ses entrées. Les entrées ne sont pas des notes : elles n'apparaissent ni dans la liste des notes, ni dans le filtre par étiquette.

## 9. Exemple complet

```markdown
---
type: cahier-de-recherche
tags: [labo, levures]
---
# Levures

## 2026

### Novembre

#### Vendredi 20

- 09:42 - Levure A : rien après une heure
- 09:42 - Levure B : légère mousse
- 14:30 - Protocole du lot 2 :
  1. réhydrater 10 g dans 50 ml d'eau à 35 °C ;
  2. ajouter 5 g de sucre.

  Température de la pièce : 21 °C.

#### Lundi 23

- 08:15 - Levure A, lot 2 : mousse abondante, odeur normale
- 08:20 - Rectifie [l'entrée du 20 novembre 2026 à 09:42](#2026-11-20-09h42) : Levure A : mousse visible après 1 h 20, pas après 1 h

### Décembre

#### Mardi 1er

- 18:05 - Fin de la série. Résumé dans [[Synthèse levures]].

## 2027

### Janvier

#### Lundi 4

- 10:00 - Nouvelle série avec la levure C
```

Ce que l'application lit dans cet exemple :

- 7 entrées, numérotées de `0001` à `0007` ;
- ancres : `2026-11-20-09h42`, `2026-11-20-09h42-2` (même minute que la précédente), `2026-11-20-14h30`, `2026-11-23-08h15`, `2026-11-23-08h20`, `2026-12-01-18h05`, `2027-01-04-10h00` ;
- titres dans l'index : `20 novembre 2026 à 09:42`, …, `1er décembre 2026 à 18:05`, `4 janvier 2027 à 10:00` ;
- texte de la troisième entrée : `Protocole du lot 2 :`, les deux lignes numérotées, une ligne vide, puis `Température de la pièce : 21 °C.` ;
- la cinquième entrée rectifie la première par un lien vers son ancre ; la première reste telle quelle.

Une entrée « Essai levure D » ajoutée le lundi 4 janvier 2027 à 11:30 s'écrit, sans titre ni ligne vide, juste après la dernière ligne :

```markdown
- 10:00 - Nouvelle série avec la levure C
- 11:30 - Essai levure D
```

Ajoutée le mardi 5 janvier 2027 à 08:00, elle s'écrit sous un nouveau titre de jour :

```markdown
- 10:00 - Nouvelle série avec la levure C

#### Mardi 5

- 08:00 - Essai levure D
```

## Références

- `doc/decisions/0041-cahier-de-recherche.md` : le cahier de recherche, son format, son index.
- `doc/decisions/0049-zone-de-saisie-du-cahier.md` : la zone de saisie du cahier, la fin de la correction.
- `doc/decisions/0095-numero-d-entree-de-cahier.md` : le numéro d'entrée.
- `doc/specs/entree-de-cahier.md` : spécification fonctionnelle de l'écriture d'une entrée.
- `doc/ontology.md` : cahier de recherche, entrée, ancre d'une entrée, numéro d'entrée, zone de saisie du cahier, conteneur, type de contenu.
- `doc/format/note.md` : règles communes à toutes les notes (en-tête, titre, nom du fichier, pièces jointes, liens).
- `doc/format/espace-de-travail.md` : organisation de l'espace de travail.
