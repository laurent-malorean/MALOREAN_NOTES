# Format de fichiers d'un agenda 12

Ce document est la seule description du format de fichiers d'un agenda 12 : le fichier de l'agenda 12, son dossier des événements, ses archives et le fichier d'un événement. Il suffit pour lire ou écrire un agenda 12 avec un autre outil (Obsidian, un script, une IA) sans lire le code de l'application. Ce que l'écran montre et les gestes qui changent un agenda 12 sont dans `doc/specs/agenda-12.md`.

Format validé par l'utilisateur le 27/11 (clés en français, dates en champs séparés, pays par son code, archives dans un sous-dossier), comme la spécification.

Les règles communes à toute note ne sont pas redites ici : forme générale de l'en-tête, titre, nom de fichier, liens entre notes, étiquettes (`tags`) et pièces jointes sont décrits dans `doc/format/note.md` ; l'espace de travail et la corbeille dans `doc/format/espace-de-travail.md`. Un agenda 12 et ses événements sont des notes : tout ce qui vaut pour une note vaut pour eux, sauf ce que ce document précise.

## 1. Vue d'ensemble

```
pro/
├── salons.md                                 type: agenda-12
└── salons/                                   dossier des événements
    ├── salon-embedded-world.md               type: agenda-12-evenement
    ├── audit-iso.md                          type: agenda-12-evenement
    └── archives/                             événements clos
        └── salon-embedded-world.md           type: agenda-12-evenement, clos-le
```

- L'**agenda 12** est une note dont l'en-tête déclare `type: agenda-12`.
- Ses **événements** sont des notes rangées dans son **dossier des événements** ; les événements clos sont dans le sous-dossier `archives/`.
- La grille (cases, ordre, couleur de l'année, drapeau) est calculée à la lecture, jamais écrite dans un fichier.

## 2. Types

La sorte d'un fichier est donnée par la propriété `type:` de son en-tête.

- `agenda-12` : l'agenda 12, où l'on veut dans l'espace de travail.
- `agenda-12-evenement` : un événement, dans `<dossier des événements>/` (ouvert) ou `<dossier des événements>/archives/` (clos).

Règles de lecture de `type:` : les mêmes que pour le CRM (`doc/format/crm.md`, § 2). Seule compte la première ligne `type:` du premier niveau de l'en-tête ; la valeur peut être entre apostrophes ou guillemets ; elle doit être exactement l'une des deux ci-dessus, en minuscules ; toute autre valeur fait du fichier une note ordinaire.

## 3. Emplacement et nommage

### 3.1 Le fichier de l'agenda 12

- Où l'on veut dans l'espace de travail, avec l'extension `.md`, nommé comme toute note (`doc/format/note.md`) : l'application tire le nom du titre à la création, puis à chaque renommage.
- Le dossier `x/` posé à côté d'un fichier `x.md` de type `agenda-12` est son dossier des événements. Renommer, déplacer ou mettre à la corbeille l'agenda 12 emporte ce dossier, avec les mêmes règles de nom déjà pris que le CRM (`doc/format/crm.md`, § 3.1).

### 3.2 Le dossier des événements et les archives

- Le dossier des événements porte le nom du fichier de l'agenda 12 sans `.md`, dans le même dossier parent : `pro/salons/` pour `pro/salons.md`.
- Il naît avec le premier événement ; `archives/` naît avec la première clôture. Un agenda 12 sans événement n'a pas de dossier.
- **Un événement est un fichier `.md` posé directement dans le dossier des événements, ou directement dans `archives/`**, avec `type: agenda-12-evenement`. Pour cette raison :
  - un fichier rangé plus profond (`salons/2027/x.md`, `salons/archives/2026/x.md`) n'est pas lu ;
  - un fichier sans ce `type:` (une note ordinaire posée dans `salons/`) n'est pas lu ;
  - un fichier `.canvas` n'est jamais un événement.
- Un fichier posé directement dans un dossier nommé `archives` est un événement clos de l'agenda 12 du dossier au-dessus (`salons/archives/x.md` appartient à `salons.md`) : si `salons/archives.md` était lui-même un agenda 12, ce serait toujours la clôture qui l'emporterait.
- Seul le sous-dossier nommé exactement `archives` est celui des événements clos. Un autre sous-dossier est ignoré par l'agenda 12.
- L'agenda 12 d'un événement se déduit uniquement de son chemin : `pro/salons/x.md` et `pro/salons/archives/x.md` appartiennent à `pro/salons.md`. Aucune propriété de l'événement ne nomme son agenda 12.
- **Ouvert ou clos** se déduit uniquement du dossier : un événement dans `archives/` est clos, un événement hors de `archives/` est ouvert, quelle que soit la clé `clos-le`.
- Le dossier des événements n'est pas montré dans la liste des dossiers, sauf s'il contient une note ordinaire (même règle que le dossier des fiches du CRM).

### 3.3 Nom de fichier d'un événement

- Le titre en kebab-case, puis `.md` : « Salon Embedded World » donne `salon-embedded-world.md`. Kebab-case : mêmes règles que le CRM (`doc/format/crm.md`, § 3.3) ; un titre sans lettre ni chiffre utilisable donne `sans-titre`.
- **Nom déjà pris** dans le dossier où le fichier arrive : l'application ajoute `-2`, puis `-3`, etc. Les noms se comparent dans ce seul dossier : un événement ouvert et un événement clos peuvent avoir le même nom de fichier.
- **Le nom de fichier ne change jamais** après la création : renommer un événement réécrit seulement sa ligne de titre `#`. Seuls la clôture et la réouverture le déplacent (§ 6), et le suffixent si besoin.
- Un autre outil peut créer un événement sous n'importe quel nom de fichier valide : l'application le lit pareillement.

## 4. Règles communes

### 4.1 Titre

- Chaque événement a un titre : le premier titre `#` de la note, sur une ligne. Un événement sans titre est **illisible** : l'agenda 12 le laisse de côté et le signale, sans jamais le modifier ni l'effacer.
- Un agenda 12 sans titre reste lisible : il est montré « Sans titre ».

### 4.2 Lecture et écriture de l'en-tête

Les mêmes règles que le CRM, dans `doc/format/crm.md` :

- lecture clé par clé, au premier niveau, première ligne de chaque clé seule comptée, valeurs entre apostrophes ou guillemets permises, commentaires YAML retirés, valeur vide = clé absente (§ 4.2) ;
- écriture des valeurs (§ 4.3) ; les nombres (`mois`, `jour`, `annee`, `jour-fin`, `mois-fin`, `colonnes`) sont écrits nus (`mois: 2`) ;
- un geste ne change que la clé touchée, à sa place ; une clé absente est ajoutée après les autres ; une valeur vidée retire la clé ; les clés inconnues, le titre et le texte restent identiques octet pour octet ; une valeur illisible reste dans le fichier tant que le geste qui touche sa clé n'est pas fait (§ 4.4) ;
- étiquettes `tags` comme toute note (§ 4.9).

### 4.3 Nombres

Un nombre s'écrit en chiffres, sans signe ni décimale ; des zéros en tête sont permis à la lecture (`02` vaut `2`) et jamais écrits. Une autre forme (`février`, `2.0`, `-1`) est illisible.

## 5. Le fichier de l'agenda 12

### 5.1 En-tête

- `type` : obligatoire, `agenda-12`.
- `colonnes` : facultatif, `3`, `4` ou `6` ; le nombre de colonnes de la grille. Absente ou autre valeur : 4. L'application l'écrit quand l'utilisateur change le nombre de colonnes.
- `vue` : facultatif, `grille` ou `liste` ; la vue gardée de l'agenda 12 (spécification § 5.5). Absente ou autre valeur : `grille`. L'application l'écrit (sans apostrophes) quand l'utilisateur change de vue.
- `tags` : facultatif, comme toute note.

### 5.2 Corps

- Le titre `#` est le nom de l'agenda 12.
- Le texte sous le titre n'est ni lu ni montré par l'agenda 12, et jamais modifié.

### 5.3 Fichier neuf

```markdown
---
type: agenda-12
---
# Salons
```

## 6. Un événement

### 6.1 En-tête

- `type` : obligatoire, `agenda-12-evenement`.
- `mois` : **obligatoire**, de `1` (janvier) à `12` (décembre) ; le mois de début, qui donne la case.
- `jour` : facultatif, de `1` à `31` ; le jour de début.
- `annee` : facultatif, de `1` à `9999` ; l'année de début.
- `jour-fin` : facultatif, de `1` à `31` ; le jour de fin d'un événement sur plusieurs jours. Exige `jour`.
- `mois-fin` : facultatif, de `1` à `12` ; seulement quand la fin tombe un autre mois que le début. Exige `jour-fin`.
- `pays` : facultatif ; le code du pays sur deux lettres de la norme ISO 3166-1 alpha-2 (`FR`, `DE`, `US`), d'où l'application tire le drapeau et le nom du pays. Lu sans compter les majuscules ni les espaces autour, écrit en majuscules. Un code inconnu de la norme est illisible.
- `ville` : facultatif, texte libre sur une ligne.
- `tags` : facultatif, comme toute note.
- `clos-le` : le jour de la clôture, `AAAA-MM-JJ` (`doc/format/crm.md`, § 4.6). Écrit à la clôture, retiré à la réouverture. Un événement clos sans `clos-le` (rangé à la main dans `archives/`) reste clos et vient en dernier dans la liste des archives.

**Ordre des clés** dans un fichier écrit par l'application : `type`, `mois`, `jour`, `annee`, `jour-fin`, `mois-fin`, `pays`, `ville`, `tags`, `clos-le` ; seules les clés qui ont une valeur sont écrites.

### 6.2 Cohérence des dates

- Avec une année, le jour doit exister ce mois-là (pas de 31 avril, pas de 29 février 2027). Sans année, le jour doit exister pour au moins une année (le 29 février est permis, pas le 30).
- La fin suit les mêmes règles, avec l'année du début (ou l'année suivante quand la fin passe l'année, voir ci-dessous).
- **Fin dans le même mois** (`mois-fin` absente) : `jour-fin` est après `jour`. Égal au jour du début, l'événement tient sur un jour (la fin est ignorée à la lecture, et l'application ne l'écrit pas à la saisie).
- **Fin un autre mois** : un `mois-fin` plus grand que `mois` est dans la même année (30 janvier → 2 février) ; un `mois-fin` plus petit passe à l'année suivante (30 décembre → 2 janvier). Un `mois-fin` égal à `mois` vaut une fin dans le même mois.
- `jour-fin` sans `jour`, `mois-fin` sans `jour-fin`, une fin avant le début : la fin est illisible et ignorée ; l'événement reste lisible, sans fin.
- `mois` absent ou illisible : l'événement est **illisible** (laissé de côté et signalé, jamais effacé). Un autre champ illisible est seulement ignoré : l'événement reste dans sa case, sans ce champ.

### 6.3 Corps

- Le titre `#` est le titre de l'événement.
- Le texte sous le titre est le détail de l'événement, en Markdown, comme une note ; l'agenda 12 ne le lit pas.

### 6.4 Fichier neuf

Créé par le « + » d'une case (ici, celle de février) :

```markdown
---
type: agenda-12-evenement
mois: 2
---
# Sans titre
```

## 7. Gestes qui touchent plusieurs fichiers

- **Clore** : le fichier de l'événement passe de `<dossier des événements>/` à `<dossier des événements>/archives/` (nom suffixé si déjà pris, § 3.3) et reçoit `clos-le` (le jour de la clôture, à l'heure du Mac). Le contenu ne change pas autrement.
- **Clore et préparer le suivant** : la clôture ci-dessus, puis un fichier neuf dans le dossier des événements, nommé d'après le même titre (le nom est libre, puisque l'original vient de partir), avec `type`, `mois`, `pays`, `ville` et `tags` repris de l'événement clos, sans `jour`, `annee`, `jour-fin`, `mois-fin` ni `clos-le`, et sans texte sous le titre.
- **Rouvrir** : le chemin inverse (nom suffixé si déjà pris) ; `clos-le` est retiré.
- **Placer un événement dans la corbeille** : comme toute note ; restauré, il revient dans le dossier d'où il est parti (ouvert ou archives).
- Les liens entre notes vers un événement suivent ses déplacements, comme pour toute note.

## 8. Ce que l'application tolère à la lecture

- Les clés inconnues, gardées telles quelles.
- Des zéros en tête dans les nombres, des majuscules dans le code du pays.
- Un dossier `archives/` vide, ou absent.
- Un événement d'une année passée, jamais clos : lu et montré normalement.

## 9. Exemple complet

```
pro/
├── salons.md
└── salons/
    ├── salon-embedded-world.md
    ├── vivatech.md
    └── archives/
        └── salon-embedded-world.md
```

`pro/salons.md` :

```markdown
---
type: agenda-12
colonnes: 6
tags: [salon]
---
# Salons
```

`pro/salons/salon-embedded-world.md`, la copie préparée pour l'an prochain :

```markdown
---
type: agenda-12-evenement
mois: 3
pays: DE
ville: Nuremberg
tags: [salon]
---
# Salon Embedded World
```

`pro/salons/vivatech.md`, à cheval sur deux mois :

```markdown
---
type: agenda-12-evenement
mois: 5
jour: 30
annee: 2027
jour-fin: 2
mois-fin: 6
pays: FR
ville: Paris
---
# Vivatech

Budget : deux entrées, train aller-retour.
```

`pro/salons/archives/salon-embedded-world.md`, l'édition passée :

```markdown
---
type: agenda-12-evenement
mois: 3
jour: 10
annee: 2026
jour-fin: 12
pays: DE
ville: Nuremberg
tags: [salon]
clos-le: 2026-11-27
---
# Salon Embedded World

Stand 4A-110. Contacts pris : …
```
