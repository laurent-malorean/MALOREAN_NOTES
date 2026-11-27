# Format : l'espace de travail sur le disque

Ce document décrit comment MALOREAN Notes range un espace de travail sur le disque : ce qu'il lit, ce qu'il écrit, ce qu'il ignore. Il suffit pour créer, lire ou modifier un espace de travail avec un autre outil (Finder, éditeur de texte, script) sans casser ce que l'application attend.

Le format d'un fichier de note est décrit dans `doc/format/note.md`. Les autres contenus ont leur propre format : `doc/format/cahier-de-recherche.md`, `doc/format/carte-mentale.md`, `doc/format/canvas.md`, `doc/format/crm.md`.

## Principe

- Un **espace de travail** est un nom et un dossier du disque choisi par l'utilisateur. Le nom n'est écrit nulle part dans le dossier : il est gardé par l'application (voir « Ce qui n'est pas dans l'espace de travail »).
- Les fichiers sont la seule source de vérité. Aucune base de données, aucun fichier de suivi n'est nécessaire dans le dossier : un dossier qui ne contient que des fichiers `.md` est un espace de travail complet.
- L'espace de travail peut vivre dans iCloud Drive ou tout dossier synchronisé : l'application n'a pas son propre service de synchronisation.
- Les changements faits hors de l'application sont vus par la **surveillance** du dossier et relus aussitôt.

## Vue d'ensemble

```text
Notes/                                  ← racine de l'espace de travail (le dossier choisi)
├── idees-en-vrac.md                    ← une note de la racine
├── mon-idee-du-jour.md                 ← une note
├── mon-idee-du-jour.assets/            ← dossier de pièces jointes de cette note
│   ├── image-2026-11-16-1830.png
│   └── devis signe.pdf
├── Journal/                            ← un dossier : le journal
│   ├── 2026-11-25.md                   ← une note du jour
│   └── 2026-11-26.md
├── Modèles/                            ← un dossier : le dossier des modèles
│   └── reunion.md
├── Travail/
│   ├── Réunions/
│   │   └── lundi.md
│   ├── plan-du-projet.canvas           ← un canvas (voir canvas.md)
│   └── courses (conflit 2026-11-06 08h05).md   ← une copie de conflit
├── .trash/                             ← la corbeille (cachée)
│   ├── Travail/
│   │   └── vieille-note.md
│   └── .history/                       ← historique des notes de la corbeille
├── .history/                           ← l'historique des versions (caché)
│   ├── mon-idee-du-jour.md/
│   │   ├── 2026-11-18 14h30.md
│   │   └── 2026-11-18 14h30 (2).md
│   └── Travail/
│       └── Réunions/
│           └── lundi.md/
│               └── 2026-11-20 09h05.md
└── .pending-gestures/                  ← gestes en attente (caché, voir crm.md)
```

## Racine et dossiers

- La **racine** est le dossier de l'espace de travail lui-même. Elle peut contenir des notes et des dossiers.
- Les **dossiers** sont de vrais dossiers du disque, à toute profondeur. Créer un dossier dans le Finder le fait apparaître dans l'application, et inversement.
- Une note est désignée par son **chemin de note** depuis la racine, séparé par `/` : `Travail/Réunions/lundi.md`, ou `lundi.md` à la racine. Un dossier est désigné de la même façon : `Travail/Réunions` ; la racine est le chemin vide.
- Les noms de dossiers sont gardés tels que l'utilisateur les a écrits : majuscules, accents et espaces intérieurs compris (`Travail`, `Réunions`, `Mes projets`). Ils ne sont jamais convertis en kebab-case.
- Les noms sont comparés à l'identique : la casse compte, même sur un disque qui l'ignore. Renommer `travail` en `Travail` est permis.

### Ce qui est un dossier de notes

Un dossier du disque est un dossier de l'espace de travail seulement si son nom est un **nom de dossier** accepté. Sont refusés, et donc ignorés avec tout ce qu'ils contiennent (ni listés, ni cherchés, ni indexés, ni étiquetés, ni liés, ni surveillés) :

- un nom vide ;
- un nom **caché**, qui commence par `.` (`.trash`, `.history`, `.git`, `.obsidian`…) ;
- un nom qui contient `/`, `\` ou le caractère nul ;
- un nom qui se termine par `.assets` (majuscules ignorées) : c'est un **dossier de pièces jointes**, jamais un dossier de notes ;
- `node_modules` (majuscules ignorées) : un **dossier de dépendances** d'outils de programmation ;
- un nom qui commence ou finit par une espace (le nom écrit doit être identique au nom sans espaces autour).

Les **liens symboliques** (vers un dossier ou vers un fichier) ne sont jamais suivis : ce ne sont ni des dossiers ni des notes.

L'application refuse de créer ou de renommer un dossier avec un nom refusé ; elle refuse aussi un nom déjà pris dans le dossier parent.

### Dossiers que l'application ne montre pas sans les ignorer

- Le **dossier des fiches** d'un CRM existe sur le disque et ses notes sont indexées, mais la liste des dossiers ne le montre pas. Sa règle est décrite dans `doc/format/crm.md`.

## Notes et autres fichiers

- Une **note** est un fichier dont le nom se termine par `.md` (majuscules ignorées : `Note.MD` est une note), qui ne commence pas par `.` et qui est un fichier ordinaire (pas un lien symbolique).
- Un fichier qui se termine par `.canvas` est un **canvas** : il suit les mêmes règles de nom et de rangement qu'une note ; son format est dans `doc/format/canvas.md`.
- Tout autre fichier (`.txt`, `.png` hors d'un dossier de pièces jointes, `.pdf`…) est ignoré : ni listé ni indexé, jamais modifié ni supprimé. Une image ou un PDF rangé ainsi peut être joint à une note : il est alors copié dans le dossier de pièces jointes de la note, l'original reste en place.
- Un fichier caché (`.DS_Store`, `.mon-brouillon.md`) n'est jamais une note.
- Les notes d'un dossier sont les fichiers qui sont directement dedans ; celles des sous-dossiers appartiennent aux sous-dossiers.

## Nom de fichier d'une note

Le **nom de fichier** d'une note suit son **titre** (le premier titre `#`, voir `doc/format/note.md`).

### Règle titre → nom de fichier (kebab-case)

Le nom est le titre en kebab-case, suivi de `.md` :

1. les lettres accentuées perdent leurs accents (décomposition Unicode, marques diacritiques retirées) : `é` → `e`, `ç` → `c` ;
2. les lettres A à Z passent en minuscules ;
3. tout caractère qui n'est ni une lettre ASCII ni un chiffre ASCII devient un séparateur : espaces, ponctuation, apostrophes, tirets, `/`, emoji, et aussi les lettres sans équivalent ASCII par décomposition (`œ`, `ß`, `ø`, lettres grecques, cyrilliques, asiatiques…) ;
4. les séparateurs consécutifs sont fusionnés en un seul `-`, sans `-` au début ni à la fin.

Exemples :

- `Mon idée du jour` → `mon-idee-du-jour.md`
- `L'été 2026 : bilan !` → `l-ete-2026-bilan.md`
- `Réunion du 18 novembre 2026` → `reunion-du-18-novembre-2026.md`
- `C++ / Rust` → `c-rust.md`
- `Œuvres` → `uvres.md` (le `Œ` n'a pas d'équivalent ASCII)

Aucune longueur maximale n'est imposée par la règle.

### Note sans titre

- Une note neuve, vide, s'appelle `sans-titre.md`.
- Un titre qui ne laisse aucun caractère utilisable (`# ???`, `# 🎉`) donne aussi `sans-titre.md`.
- Une note **qui n'a pas de titre `#`** garde son nom de fichier tel quel à l'enregistrement : une note importée (`Compte rendu Q3.md`) n'est jamais renommée tant qu'on ne lui écrit pas de titre. Dès qu'elle a un titre `#`, son nom le suit.

### Nom déjà pris : suffixes `-2`, `-3`…

- Si le nom voulu est déjà pris par une autre note **du même dossier**, il reçoit le premier suffixe libre : `idee.md`, puis `idee-2.md`, `idee-3.md`… (le suffixe se place avant l'extension). La note elle-même ne compte pas comme une autre.
- Deux dossiers différents peuvent contenir chacun `idee.md`.
- La même règle vaut pour une note déplacée dans un dossier où son nom est pris, pour une note mise à la corbeille là où une note du même chemin s'y trouve déjà, et pour une note restaurée à un chemin repris entre-temps.

### Quand le nom change

- À chaque enregistrement, le nom est recalculé depuis le titre : changer le titre renomme le fichier (et son dossier de pièces jointes, voir plus bas).
- Exception : une **note du jour** dont le nom est une date (`2026-11-18.md`) et dont le titre est encore cette date en toutes lettres (`# 18 novembre 2026`) garde son nom daté. Voir `doc/format/note.md`, section « Note du jour ».
- Renommer, déplacer ou restaurer une note ne réécrit jamais les liens `[[ ]]` des autres notes : ces liens visent le titre, pas le nom de fichier.

### Noms écrits par d'autres outils

L'application lit toute note dont le nom respecte « Notes et autres fichiers », même s'il n'est pas en kebab-case (`Liste de courses.md`). Elle ne le renomme qu'au premier enregistrement de la note avec un titre `#`.

## Dossier de pièces jointes : `<note>.assets/`

- Chaque note peut avoir **un** dossier de pièces jointes, à côté d'elle, dans le même dossier, nommé comme la note sans son extension, suivi de `.assets` : la note `mon-idee-du-jour.md` a le dossier `mon-idee-du-jour.assets/`.
- Il contient les fichiers joints à cette seule note, directement (pas de sous-dossier). Il n'apparaît jamais comme un dossier de notes.
- Il est créé au premier fichier joint ; une note sans pièce jointe n'en a pas.
- Il suit la note :
  - renommer ou déplacer la note renomme ou déplace son dossier de pièces jointes, et les liens de la note vers ses pièces jointes sont réécrits (voir `doc/format/note.md`, section « Pièces jointes ») ;
  - un renommage ou un déplacement est refusé si le dossier de pièces jointes du nom d'arrivée existe déjà ;
  - mettre la note à la corbeille y emporte son dossier de pièces jointes ; la restaurer le ramène.

### Nom d'une pièce jointe

- **Types acceptés** (extension, majuscules ignorées) : images `png`, `jpg`, `jpeg`, `gif`, `webp`, `heic`, `tiff`, `svg` ; documents `pdf`. L'application refuse tout autre type, et tout fichier de plus de 50 Mo.
- **Image ou PDF collé** : nommé d'après le moment (heure locale, à la minute) : `image-AAAA-MM-JJ-HHMM.<ext>` pour une image (`image-2026-11-16-1830.png`), `document-AAAA-MM-JJ-HHMM.pdf` pour un PDF.
- **Fichier glissé ou joint depuis l'espace de travail** : il garde son nom, rendu sûr :
  - les caractères `/`, `\`, `#`, `?`, `%`, `[`, `]`, `<`, `>` et les caractères de contrôle deviennent `-` ;
  - le nom (sans l'extension) est coupé à 100 caractères ;
  - les espaces autour et les `.` de tête sont retirés ;
  - un nom vide devient `piece-jointe` ;
  - l'extension est écrite en minuscules.
- **Nom déjà pris** : premier suffixe libre `-2`, `-3`… avant l'extension, **sans tenir compte de la casse** (`Photo.png` prend `photo.png`). Un fichier existant n'est jamais écrasé.
- Un fichier déposé à la main dans le dossier `.assets` est reconnu comme pièce jointe s'il a une extension acceptée, un nom non vide qui ne commence pas par `.`, et aucun séparateur.

## Corbeille : `.trash/`

- La **corbeille** est le dossier caché `.trash/` à la racine. Étant caché, il n'apparaît jamais parmi les dossiers, dans la liste des notes ni dans la recherche.
- Il est créé à la première mise à la corbeille.
- Un élément supprimé y garde **son chemin d'origine** : `Travail/lundi.md` va dans `.trash/Travail/lundi.md`. Une note part avec son dossier de pièces jointes ; un dossier part entier.
- Aucune métadonnée (date de suppression, origine) n'est écrite : le chemin dans la corbeille suffit à restaurer.
- **Collisions dans la corbeille** :
  - une note mise à la corbeille là où une note du même chemin s'y trouve déjà reçoit le premier suffixe libre (`lundi-2.md`), et les liens vers ses pièces jointes sont réécrits ;
  - un dossier dont le chemin est déjà pris dans la corbeille devient `Nom 2`, `Nom 3`… (une espace puis le numéro, comme le Finder).
- **Restaurer** remet l'élément à son chemin d'origine, en recréant les dossiers manquants. Une note dont le nom est pris reçoit le premier suffixe libre. Un dossier restauré là où un dossier du même nom existe est fusionné, élément par élément. Les dossiers de la corbeille laissés vides disparaissent (les fichiers cachés comme `.DS_Store` ne comptent pas).
- La racine de l'espace de travail ne va jamais à la corbeille.
- La corbeille ne se vide **qu'à la main**, dans l'application (après confirmation) ou en supprimant le dossier `.trash/`. Vider la corbeille supprime `.trash/` entier, historique des notes jetées compris.

## Historique des versions : `.history/`

### Emplacement

- L'**historique** est le dossier caché `.history/` à la racine. Il n'est ni listé, ni cherché, ni indexé, ni étiqueté, ni surveillé.
- Chaque note y a un dossier **à son propre chemin, nom de fichier complet compris** (`.md` inclus) : la note `Travail/Réunions/lundi.md` a ses versions dans `.history/Travail/Réunions/lundi.md/`. Ainsi, une note `lundi.md` et un sous-dossier `lundi` ne partagent jamais le même dossier d'historique.
- L'historique d'une note de la corbeille est rangé à `.trash/.history/<chemin de la note dans la corbeille>/`.

### Fichiers de version

- Une **version** est une copie exacte du texte de la note (en-tête compris), dans un fichier Markdown ordinaire, lisible dans le Finder.
- Son nom est le moment où elle a été gardée, à la minute, en heure locale : `AAAA-MM-JJ HHhMM.md`, par exemple `2026-11-18 14h30.md`.
- Une deuxième version gardée dans la même minute s'appelle `2026-11-18 14h30 (2).md`, puis `(3)`… Le rang est un nombre d'au moins 2, écrit sans zéro devant.
- Les versions se rangent par moment, puis par rang.
- Un fichier du dossier d'historique dont le nom ne suit pas exactement ce format est ignoré (jamais lu, jamais supprimé). Une version en cours d'écriture est un fichier caché (`.2026-11-18 14h30.md`), renommé une fois complet.
- Une version n'est jamais gardée si son texte est identique à celui de la version la plus récente.

### Quand une version est gardée

- 5 minutes après la première frappe dans une note (le délai repart à la frappe qui suit) ;
- en quittant la note (onglet fermé, autre note montrée), en quittant l'application ou en changeant d'espace de travail, si la note a été enregistrée depuis sa dernière version ;
- juste avant un changement venu de l'extérieur : le texte que l'application connaissait est gardé s'il n'est plus celui du disque (la version porte le moment où le changement a été vu) ;
- avant une restauration de version : le texte actuel est gardé d'abord.

### Conservation

À chaque nouvelle version d'une note, l'application retire de son dossier d'historique les versions qui ne sont plus conservées :

- toutes les versions des dernières 24 heures sont gardées ;
- au-delà de 24 heures et jusqu'à 30 jours, seule la plus récente de chaque jour (jour calendaire) est gardée ;
- au-delà de 30 jours, seule la plus récente de chaque semaine (du lundi au dimanche) est gardée.

Les âges sont comptés en minutes depuis le moment de la nouvelle version. Les versions des autres notes ne sont pas touchées.

### L'historique suit la note

- Renommer ou déplacer une note (y compris le renommage qui suit le titre) déplace son dossier d'historique ; déplacer ou renommer un dossier déplace l'historique de toutes ses notes.
- Mettre une note ou un dossier à la corbeille déplace son historique sous `.trash/.history/` ; restaurer le ramène sous `.history/`. Si le dossier d'arrivée existe déjà, les versions y sont versées une à une (une version du même nom est remplacée).
- Une note supprimée hors de l'application garde son historique dans `.history/`.

## Copie de conflit

Quand une note a changé à la fois dans l'application et sur le disque, l'application ne perd rien : elle crée à côté de la note une **copie de conflit**, `<nom sans extension> (conflit AAAA-MM-JJ HHhMM).md` (par exemple `courses (conflit 2026-11-06 08h05).md`), qui garde la version trouvée sur le disque. Si ce nom est pris, il reçoit le premier suffixe libre (`courses (conflit 2026-11-06 08h05)-2.md`). C'est une note ordinaire.

## Gestes en attente : `.pending-gestures/`

Le dossier caché `.pending-gestures/` à la racine garde, le temps de les appliquer, les changements qui touchent plusieurs fichiers d'un CRM. Il n'est ni listé, ni indexé, ni surveillé, et il est vide en temps normal. Voir `doc/format/crm.md`.

## Fichiers temporaires

Une note est toujours écrite de façon atomique : d'abord un fichier caché `.<nom>.enregistrement` dans le même dossier (par exemple `.lundi.md.enregistrement`), puis renommé à la place de la note. Une pièce jointe est écrite de la même façon dans son dossier `.assets` : fichier caché puis lien sous son vrai nom, qui échoue si le nom est pris. Un tel fichier caché laissé par une coupure peut être supprimé sans risque.

## Encodage et fins de ligne

- Les notes sont en **UTF-8**, sans marque d'ordre des octets (BOM) : avec un BOM, la première ligne `---` d'un en-tête n'est pas reconnue.
- Une note qui n'est pas de l'UTF-8 valide reste listée, avec un titre tiré de ce qui est lisible, mais l'application refuse de l'ouvrir et ne l'écrit jamais, pour ne pas l'abîmer.
- Les fins de ligne `LF` (`\n`) et `CRLF` (`\r\n`) sont lues toutes les deux.
- Épingler, désépingler, changer les étiquettes, renommer par « Renommer… » ou mettre à jour les liens vers les pièces jointes ne touchent que les lignes concernées et gardent les fins de ligne de la note (une ligne ajoutée à l'en-tête reprend celle de la ligne `---` d'ouverture ; un en-tête créé prend `CRLF` si la note en contient, `LF` sinon).
- Une note modifiée dans l'éditeur de l'application est enregistrée avec des fins de ligne `LF`. Une note ouverte sans être modifiée n'est pas réécrite.
- La date de modification du fichier sert au tri par date ; épingler ou désépingler une note la conserve.

## Ce qui n'est pas dans l'espace de travail

Rien de ce qui suit n'est écrit dans le dossier de l'espace de travail ; tout se reconstruit ou se rechoisit sans perte de notes :

- **L'index** (index de mots et index de sens) : un fichier SQLite par espace de travail, `~/Library/Application Support/com.malorean.notes/index-<empreinte>.sqlite`, où l'empreinte est le FNV-1a 64 bits du chemin du dossier, en 16 chiffres hexadécimaux. C'est un cache, reconstructible à tout moment depuis les fichiers (« Reconstruire l'index »).
- **Les préférences de l'application** : `~/Library/Application Support/com.malorean.notes/preferences.json` : la liste des espaces de travail (nom et dossier), le dernier ouvert, et pour chacun son **dossier des modèles**, sa **note des favoris** (son chemin ; voir `doc/format/note.md`, « La note des favoris ») et son autorisation pour les IA.
- **Les modèles de sens** téléchargés : `~/Library/Application Support/com.malorean.notes/models/`.
- **Les réglages de confort** gardés par l'interface pour chaque espace de travail : disposition des colonnes, dossiers pliés, tri de la liste, notes récentes, et réglages du **journal** (son dossier, « Journal » par défaut, et la création de la note du jour au lancement).

## Références

- `doc/decisions/0002-notes-markdown-nom-tire-du-titre.md`
- `doc/decisions/0008-sous-dossiers.md`
- `doc/decisions/0012-corbeille.md`
- `doc/decisions/0013-pieces-jointes-collees.md`
- `doc/decisions/0014-modifications-externes.md`
- `doc/decisions/0023-note-du-jour.md`
- `doc/decisions/0024-espaces-de-travail.md`
- `doc/decisions/0028-index-sqlite.md`
- `doc/decisions/0030-historique-des-versions.md`
- `doc/decisions/0044-index-de-sens-dans-le-fichier-de-l-index.md`
- `doc/decisions/0058-crm-stockage.md`
- `doc/decisions/0077-dossier-des-modeles-pour-les-ia.md`
- `doc/decisions/0089-dossiers-de-fiches-cachees.md`
