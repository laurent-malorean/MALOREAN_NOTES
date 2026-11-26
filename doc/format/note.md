# Format : la note

Ce document décrit le format d'une **note** : un fichier `.md` de l'espace de travail, en Markdown, avec un **en-tête** YAML facultatif. Il suffit pour lire ou écrire une note avec un autre outil sans que MALOREAN Notes perde ou abîme quoi que ce soit.

Le rangement des notes sur le disque (dossiers, nom de fichier, pièces jointes, corbeille, historique) est décrit dans `doc/format/espace-de-travail.md`. Certaines notes ont un type de contenu qui ajoute ses propres règles, décrites ailleurs : `doc/format/cahier-de-recherche.md`, `doc/format/carte-mentale.md`, `doc/format/crm.md` ; le canvas, qui n'est pas une note Markdown, est décrit dans `doc/format/canvas.md`.

## Principe

- Une note est un fichier texte UTF-8 lisible et modifiable par n'importe quel éditeur.
- Le Markdown est celui de GitHub (CommonMark avec tableaux, cases à cocher et texte barré).
- L'application n'écrit dans le fichier que ce que l'utilisateur tape, plus les quelques changements ciblés décrits dans « Ce que l'application réécrit » : jamais de mise en forme imposée, jamais de clé ajoutée sans action de l'utilisateur.
- Une note **sans en-tête** est une note valide ; un fichier vide aussi.

## Structure du fichier

```text
---                      ← en-tête facultatif : première ligne exactement « --- »
pinned: true
tags: [projet, client]
---                      ← fin de l'en-tête : une ligne exactement « --- »
# Titre de la note       ← le titre : premier titre « # » du contenu
Le contenu en Markdown…
```

- Le **contenu** est le texte de la note sans l'en-tête.
- Le **titre** est le premier titre `#` du contenu (voir « Titre »).

## En-tête

### Délimitation

- L'en-tête commence **à la toute première ligne du fichier**, qui doit être exactement `---` suivie d'une fin de ligne (`LF` ou `CRLF`). Rien avant : ni ligne vide, ni espace, ni marque d'ordre des octets.
- Il se termine à la première ligne suivante qui est exactement `---` (sans espace avant ni après). La fin de ligne de cette ligne fait partie de l'en-tête ; le contenu commence juste après. Une note peut se terminer sur la ligne `---` de fermeture.
- `...` ne ferme pas un en-tête.
- Un en-tête vide (`---` suivi aussitôt de `---`) est permis.
- **En-tête non fermé** : si aucune ligne `---` ne ferme l'en-tête, il n'y a pas d'en-tête ; tout le fichier est du contenu, `---` compris. Aucune clé n'est alors lue.

### Lecture des clés

L'application ne lit pas le YAML avec un analyseur complet : elle lit ligne par ligne les seules clés qu'elle connaît.

- Une clé n'est reconnue qu'**au premier niveau** : écrite en début de ligne, sans espace ni tabulation devant. `  pinned: true` (indentée) n'est pas lue.
- Le nom de la clé est suivi, éventuellement d'espaces ou de tabulations, puis de `:`. `pinned : true` est lu ; `pinnedx: true` ne l'est pas.
- Les clés sont sensibles à la casse : `Pinned:` n'est pas `pinned:`.
- Tout le reste de l'en-tête (autres clés, valeurs sur plusieurs lignes, commentaires, YAML invalide) n'est pas interprété : il n'empêche jamais de lire les clés connues.

### Clés reconnues dans une note

| Clé | Valeurs | Défaut (clé absente) | Effet |
|---|---|---|---|
| `type` | un nom de type de contenu (voir plus bas) | `note` | Le **type de contenu** de la note. |
| `pinned` | `true` ou `yes` (majuscules ignorées) | non épinglée | La note est **épinglée** : en tête de la liste. |
| `tags` | une liste d'**étiquettes** | aucune étiquette | Les étiquettes de la note. |

Les autres contenus ajoutent leurs propres clés (`racines`, `couleur`, `statut`, `date`, `etapes`…) : elles sont décrites dans les fichiers de format de ces contenus et n'ont aucun effet sur une note ordinaire.

#### `type`

- Seule la **première** ligne `type:` de premier niveau compte.
- La valeur est ce qui suit `:`, coupée au premier `#` (commentaire), espaces autour retirés, puis guillemets `"` ou `'` retirés aux deux bouts.
- Valeurs reconnues (à l'identique, en minuscules) :
  - `note` : une note ordinaire ;
  - `cahier-de-recherche` : voir `doc/format/cahier-de-recherche.md` ;
  - `carte-mentale` : voir `doc/format/carte-mentale.md` ;
  - `crm`, `crm-entreprise`, `crm-personne`, `crm-action`, `crm-projet` : voir `doc/format/crm.md`.
- **Valeur inconnue** (`type: kanban`, `type: Note`, `type: canvas`) : la note reste du type `note`. Elle ne disparaît jamais de la liste ni de la recherche, et la clé est conservée telle quelle.
- Un canvas est reconnu à son extension `.canvas`, jamais à un en-tête : `type: canvas` dans un fichier `.md` donne une note.

Exemples, tous du type `cahier-de-recherche` :

```yaml
type: cahier-de-recherche
type : "cahier-de-recherche"   # commentaire
type: 'cahier-de-recherche'
```

#### `pinned`

- La note est épinglée si **une** ligne `pinned:` de premier niveau a pour valeur `true` ou `yes`, majuscules ignorées (`True`, `YES`).
- La valeur est coupée au premier `#` (commentaire) puis débarrassée des espaces autour. Elle n'est pas débarrassée de ses guillemets : `pinned: "true"` n'épingle pas.
- Toute autre valeur (`false`, `no`, `1`, vide) laisse la note non épinglée.

```yaml
pinned: true
pinned:   YES   # épinglée
```

#### `tags`

Seule la première ligne `tags:` de premier niveau compte. Trois écritures sont lues :

1. **Liste entre crochets** : `tags: [projet, client]`. Les étiquettes sont ce qui se trouve entre le premier `[` et le premier `]` qui suit, séparé par des virgules. Ce qui suit `]` est ignoré. Sans `]`, tout le reste de la ligne est pris.
2. **Valeurs séparées par des virgules** : `tags: projet, client`. Un commentaire (un `#` précédé d'une espace ou d'une tabulation, et tout ce qui le suit) est retiré d'abord.
3. **Liste YAML** : `tags:` sans valeur (ou avec seulement un commentaire), suivie de lignes `- étiquette`. Chaque ligne qui suit, indentée ou non, dont le premier caractère non blanc est `-` suivi d'une espace, d'une tabulation ou de la fin de ligne, donne une étiquette ; la liste s'arrête à la première ligne qui n'en est pas une. Un commentaire est retiré de chaque élément.

Chaque étiquette lue est nettoyée : espaces autour retirés, guillemets `"` ou `'` qui l'entourent retirés, puis les `#` de tête et les espaces autour. Une étiquette vide est ignorée ; une étiquette répétée à l'identique n'est gardée qu'une fois, à sa première place. L'ordre de l'en-tête est conservé.

Les majuscules comptent à la lecture : `Perso` et `perso` sont deux étiquettes différentes.

```yaml
tags: [projet, "client A", '#urgent']
tags: projet, client A   # mes étiquettes
tags:
  - projet
  - client A
```

Ces trois écritures donnent les mêmes étiquettes : `projet`, `client A` (et `urgent` pour la première).

Un mot `#projet` écrit dans le contenu n'est **pas** une étiquette : seules celles de l'en-tête comptent.

### Clés inconnues et en-tête invalide

- Une clé que l'application ne connaît pas (`date:`, `auteur:`, `aliases:`, `created:`…) est conservée à l'identique, à sa place, quelles que soient les modifications que l'application fait à l'en-tête.
- Un en-tête dont le YAML est invalide pour un autre outil reste lisible : seules les lignes des clés connues sont lues, les autres sont conservées telles quelles.
- Un en-tête non fermé n'est pas un en-tête (voir « Délimitation ») : si l'application doit alors ajouter une clé (épingler, étiqueter), elle crée un nouvel en-tête en tête du fichier, au-dessus du texte existant.

## Ce que l'application réécrit

L'application ne modifie l'en-tête qu'à la demande de l'utilisateur ou d'une IA, et seulement les lignes de la clé en cause.

### Épingler, désépingler

- **Épingler** : si une ligne `pinned:` existe, la première est remplacée à sa place par `pinned: true` ; sinon `pinned: true` est ajouté après les autres clés. Sans en-tête, l'application en crée un en tête du fichier : `---`, `pinned: true`, `---`, puis le texte inchangé. Une note déjà épinglée n'est pas réécrite.
- **Désépingler** : toutes les lignes `pinned:` de premier niveau sont retirées. Si l'en-tête ne contient plus que des blancs, il est retiré aussi, sauf si le texte qui suit commencerait alors lui-même par un en-tête valide (dans ce cas, l'en-tête vide reste pour éviter ce faux en-tête). Une note sans ligne `pinned:` n'est pas réécrite.
- Épingler ou désépingler ne change ni le titre, ni le nom du fichier, ni la date de modification du fichier.

### Changer les étiquettes

- Les étiquettes sont toujours écrites sur une seule ligne, sous la forme `tags: [a, b, c]`, à la place de la première clé `tags` (la liste YAML qui la suivait est retirée), ou ajoutées après les autres clés s'il n'y en avait pas.
- Sans en-tête, l'application en crée un en tête du fichier.
- Une liste vide retire la clé `tags`, et l'en-tête s'il ne contient plus rien (même exception que pour désépingler).
- Avant d'être écrite, chaque étiquette est nettoyée (espaces autour et `#` de tête retirés). Une étiquette vide ou qui contient l'un des signes `,` `[` `]` `{` `}` `:` `"` `'` ou un retour à la ligne n'est pas écrite : elle changerait le sens de la liste. Deux étiquettes qui ne diffèrent que par les majuscules ou les accents ne sont écrites qu'une fois (la première).

### Renommer par « Renommer… »

La ligne du titre `#` est remplacée par `# <nouveau titre>` ; une note sans titre reçoit `# <nouveau titre>` en première ligne du contenu, après l'en-tête. Le nom du fichier suit (voir `doc/format/espace-de-travail.md`).

### Liens vers les pièces jointes

Quand la note change de nom de fichier, ses liens vers son dossier de pièces jointes sont réécrits (voir « Pièces jointes »).

### Ce qui est préservé

Tout le reste du texte est conservé à l'octet près par ces opérations : autres clés, commentaires, ordre des clés, lignes vides, fins de ligne (une ligne ajoutée à l'en-tête reprend la fin de ligne de la ligne `---` d'ouverture ; un en-tête créé prend `CRLF` si la note en contient, `LF` sinon). Une note modifiée par la frappe dans l'éditeur est enregistrée avec des fins de ligne `LF`.

## Titre

- Le **titre** est la première ligne du contenu qui commence exactement par `#` suivi d'une espace (`# `), en dehors des blocs de code.
- La ligne doit commencer en colonne 1 : `  # Titre` (indenté) n'est pas un titre. `#Titre` (sans espace) n'en est pas un, ni `## Titre` (niveau 2), ni un titre souligné (`===`).
- Le texte du titre est ce qui suit `# `, espaces autour retirés, `#` de fin retirés, et toute suite d'espaces ou de tabulations ramenée à une seule espace : `#   Mon   idée  ##` donne `Mon idée`.
- Une ligne `# ` dont le texte est vide n'est pas un titre ; la recherche continue aux lignes suivantes.
- **Blocs de code** : une ligne qui, espaces de tête retirées, commence par ` ``` ` ou `~~~` ouvre un bloc de code, et la suivante de ce genre le ferme ; un `#` dans un bloc n'est jamais un titre.
- Les lignes de l'en-tête ne sont jamais un titre.

### Titre affiché

Ce que montrent la liste, les onglets, la recherche et les liens `[[ ]]` :

- le titre `#` de la note s'il existe ;
- sinon, le nom de son fichier sans `.md`, tel quel (`Compte rendu Q3.md` → « Compte rendu Q3 ») ;
- « Sans titre » pour une note neuve sans titre (`sans-titre.md`, `sans-titre-2.md`…).

Le nom du fichier suit le titre selon la règle de `doc/format/espace-de-travail.md`. Dans l'éditeur, ce qu'on tape dans une note vide devient son titre : `# ` se place devant.

## Liens entre notes : `[[ ]]`

### Syntaxe

- `[[cible]]` : un **lien entre notes**, qui désigne un contenu par son nom.
- `[[cible|texte montré]]` : la **cible d'un lien** est ce qui précède la première barre `|` ; l'éditeur montre seulement le texte qui la suit.
- La cible est débarrassée de ses espaces autour : `[[  Courses  ]]` vise `Courses`.
- Un lien vide (`[[]]`, `[[ ]]`, `[[|texte]]`) ou coupé par un retour à la ligne n'est pas un lien.
- Quand des `[[` s'imbriquent, c'est le `[[` le plus proche du `]]` qui ouvre le lien : `[[a [[Courses]]` vise `Courses`.
- Le fichier n'est jamais modifié pour afficher un lien.

### Forme de la cible

- `[[titre]]` : le contenu dont le titre affiché est `titre`. Le nom d'une note, d'une carte mentale, d'un cahier de recherche, d'un CRM ou d'une fiche est son titre affiché.
- `[[nom.canvas]]` : le canvas dont le nom de fichier est `nom.canvas` (extension écrite, majuscules ignorées). Un titre seul ne désigne jamais un canvas.
- `[[Dossier/titre]]`, `[[Dossier/Sous-dossier/titre]]` : le contenu de ce titre rangé dans ce dossier. Le chemin est **le chemin complet depuis la racine** : `[[Vieux/Courses]]` désigne `Vieux/courses.md`, mais pas `Vieux/Archives/courses.md`.
- `[[/titre]]` : le contenu de ce titre rangé à la racine.

### Résolution

La **résolution d'un lien** compare la cible à tous les contenus de l'espace de travail :

- **sans tenir compte des majuscules, des accents ni des espaces en trop** : `[[recette  DE crepes ]]` désigne la note titrée « Recette de crêpes » ; la comparaison porte sur les mots entiers (« Recette » ne désigne pas « Recettes ») ;
- les noms de dossiers d'une cible `Dossier/titre` sont comparés de la même façon, dossier par dossier ;
- si une cible avec `/` ne trouve rien en lisant ce qui précède le dernier `/` comme un dossier, elle est relue en entier comme un titre : `[[Oui/Non]]` trouve la note titrée « Oui/Non ».

Trois issues :

- **un seul contenu** porte ce nom : le lien l'ouvre ;
- **plusieurs** : c'est un **lien ambigu**. Il n'ouvre aucun contenu au hasard ; l'éditeur le souligne en pointillés et invite à préciser le dossier (`[[Dossier/titre]]` ou `[[/titre]]`) ;
- **aucun** : le lien ne mène nulle part.

Quand l'application écrit elle-même un lien (menu des liens), elle écrit le nom seul s'il désigne un seul contenu, sinon le nom précédé du chemin du dossier (`Vieux/Courses`, ou `/Courses` pour la racine).

### Ce que l'application fait des liens

- Les **liens entrants** d'une note sont les autres notes dont un lien la désigne sans ambiguïté. Les liens sont cherchés dans tout le texte de la note, en-tête et blocs de code compris (une action du CRM fait exception, voir `doc/format/crm.md`).
- Changer le titre d'une note, la renommer ou la déplacer **ne réécrit pas** les liens des autres notes : un lien vers l'ancien titre ne mène plus nulle part, et un lien `[[Dossier/titre]]` ne suit pas un déplacement.

## Liens Markdown : adresses web et pièces jointes

Un lien Markdown ordinaire `[texte](cible)` ou une image `![texte](cible)` est ouvert selon sa cible :

- **Adresse web** : une cible qui commence par `http://`, `https://` ou `mailto:` (majuscules ignorées), suivie d'au moins un caractère, sans espace ni caractère de contrôle. Des chevrons autour sont permis : `<https://exemple.fr>`. Elle s'ouvre dans le navigateur (ou l'application de mail) du Mac.
- **Pièce jointe de la note** : une cible relative qui pointe directement dans le dossier de pièces jointes de la note (voir « Pièces jointes »). Elle s'ouvre avec l'application du Mac.
- Toute autre cible (chemin relatif vers ailleurs, autre protocole) est refusée à l'ouverture, avec un message. Elle reste dans le texte telle quelle.

Une image dont la cible est relative est cherchée à partir du dossier de la note ; si elle est introuvable, son texte de remplacement est montré à sa place.

## Pièces jointes

Les fichiers joints à une note sont rangés dans son dossier `<nom de la note>.assets/`, à côté d'elle (règles de nommage dans `doc/format/espace-de-travail.md`).

### Liens insérés par l'application

- Image : `![](<nom de la note>.assets/<nom>)`, par exemple `![](mon-idee-du-jour.assets/image-2026-11-16-1830.png)`. L'image est affichée dans la note.
- PDF : `[<nom>](<nom de la note>.assets/<nom>)`, par exemple `[devis signe.pdf](mon-idee-du-jour.assets/devis%20signe.pdf)`. Le PDF se lit par son nom.
- Dans la cible (et seulement là), l'espace, `(` et `)` sont encodés en `%20`, `%28` et `%29` ; les autres caractères, accents compris, sont écrits tels quels. Le texte entre crochets n'est pas encodé.
- Une pièce jointe collée est insérée à la place de la sélection ; une pièce jointe glissée, là où elle est déposée ; plusieurs fichiers donnent un lien par ligne. Une pièce jointe ajoutée par une IA est ajoutée à la fin de la note, sur sa propre ligne, après une ligne vide (les blancs de fin de note sont d'abord retirés).

### Liens reconnus comme pièce jointe

Une cible désigne une pièce jointe de la note si, une fois les chevrons `<…>` éventuels retirés et les séquences `%XX` décodées (UTF-8), elle s'écrit `<nom de la note>.assets/<nom>`, où `<nom>` est un nom de pièce jointe valable : une extension d'image ou `pdf`, un nom non vide qui ne commence pas par `.`, sans `/` ni `\`. Une cible mal encodée (`%` non suivi de deux chiffres hexadécimaux) n'est pas une pièce jointe.

### Quand la note change de nom

Quand le nom de fichier de la note change (titre modifié, déplacement vers un nom pris, collision dans la corbeille), le dossier de pièces jointes est renommé et, dans le texte de la note, chaque occurrence de `](<ancien nom>.assets/` et de `](<<ancien nom>.assets/` devient `](<nouveau nom>.assets/` (respectivement `](<<nouveau nom>.assets/`). Les autres textes ne sont pas touchés.

## Cases à cocher

Des listes de tâches au format GitHub :

```markdown
- [ ] à faire
- [x] fait
```

- Une case est cochée par `[x]` ou `[X]`, décochée par `[ ]`.
- Un clic sur la case dans l'éditeur la bascule : l'application écrit `[x]` pour cocher, `[ ]` pour décocher.
- Les marques `-`, `*`, `+` et les listes numérotées suivent la syntaxe de GitHub.

## Tableaux

Des tableaux au format GitHub : une ligne d'en-tête, une ligne d'alignement, puis les lignes.

```markdown
| Produit | Quantité | Prix |
|:--------|:--------:|-----:|
| Pommes  | 3        | 2,40 |
| Poires  | 1        | 0,90 |
```

- Les barres `|` de bord sont facultatives. Un `\|` dans une cellule est une barre écrite, pas un séparateur.
- Alignement : `:---` à gauche, `:---:` centré, `---:` à droite, `---` par défaut.
- Une ligne qui a moins de cellules que l'en-tête est complétée par des cellules vides ; les cellules en trop sont ignorées à l'affichage.
- L'application dessine le tableau sans réécrire son texte.

## Étiquettes

Les étiquettes s'écrivent uniquement dans la clé `tags` de l'en-tête (voir « En-tête »). L'application les montre sous chaque note, les compte dans la liste des étiquettes (par ordre alphabétique, majuscules et accents ignorés) et filtre la liste sur l'une d'elles dans tout l'espace de travail.

## Note du jour

Une **note du jour** est une note ordinaire du **journal**, avec un nom et un titre datés.

- **Emplacement** : le journal est un dossier de l'espace de travail, `Journal` par défaut, choisi dans les réglages (un chemin depuis la racine, par exemple `Perso/Journal`). Il est créé au besoin, avec les dossiers qui le contiennent.
- **Nom de fichier** : la date du jour au format ISO, `AAAA-MM-JJ.md`, par exemple `2026-11-26.md`, pour que le journal se range par date.
- **Titre** : la date en toutes lettres, en français : `# 26 novembre 2026`. Le premier du mois s'écrit `1er` : `# 1er décembre 2026`. Les mois s'écrivent en minuscules, avec leurs accents (`février`, `août`, `décembre`).
- **Jamais en double** : si le fichier du jour existe déjà, il est ouvert sans être lu ni réécrit.
- **Texte d'une note neuve** :
  - si le dossier des modèles contient une note dont le titre affiché est exactement `Journal` (majuscule comprise), la note du jour part de ce modèle : sa ligne de titre `#` est remplacée par le titre daté (ou le titre daté est ajouté en première ligne du contenu s'il n'en a pas), puis le modèle est rempli comme tout modèle (voir « Modèles de note »), `{{title}}` valant alors le titre daté ;
  - sinon, la note ne contient que son titre : `# 26 novembre 2026` suivi d'une fin de ligne.
- **Nom daté conservé** : tant que le titre d'une note dont le nom est une date ISO valable reste cette date en toutes lettres, son nom de fichier reste daté (sans cette exception, `# 26 novembre 2026` donnerait `26-novembre-2026.md`). Si l'on change son titre, le nom suit de nouveau le titre.
- Une note du jour renommée ou déplacée n'est plus suivie : redemander la note du jour recrée le fichier daté dans le journal.

Exemple, depuis le modèle `Modèles/journal.md` :

```markdown
---
tags: [journal]
pinned: true
---
# Journal

## Fait à {{time}}

## Notes
```

donne, le 26 novembre 2026 à 08:05, le fichier `Journal/2026-11-26.md` :

```markdown
---
tags: [journal]
---
# 26 novembre 2026

## Fait à 08:05

## Notes
```

## Modèles de note

Un **modèle** est une note ordinaire du **dossier des modèles**, qui sert de point de départ à une nouvelle note.

### Dossier des modèles

- C'est un dossier de l'espace de travail choisi dans les réglages, un par espace de travail. Le choix est gardé dans les préférences de l'application, **jamais dans l'espace de travail**.
- Chaque note qui se trouve **directement** dans ce dossier est un modèle ; celles de ses sous-dossiers n'en sont pas.
- Sans dossier choisi, il n'y a aucun modèle. Un dossier choisi qui n'existe plus donne une liste vide.
- Les modèles sont proposés par leur titre affiché.

### Création d'une note depuis un modèle

1. L'application lit le modèle.
2. Elle retire l'épinglage de son en-tête (toutes les lignes `pinned:` de premier niveau, et l'en-tête s'il ne contient plus rien). Le reste de l'en-tête est conservé, étiquettes et clés inconnues comprises.
3. Elle remplace les **variables de modèle**, dans cet ordre, partout dans le texte (en-tête compris) :
   1. `{{title}}` par le titre `#` du modèle, ou « Sans titre » s'il n'en a pas ;
   2. `{{date}}` par la date du jour en toutes lettres (`26 novembre 2026`, `1er mars 2027`) ;
   3. `{{time}}` par l'heure, sur deux chiffres : `HH:MM` (`08:05`).
4. Elle écrit la note dans le dossier affiché, sous le nom tiré de son titre, avec le premier suffixe libre si ce nom est pris.

Règles d'écriture des variables :

- La syntaxe est exacte : deux accolades, le nom en minuscules, aucune espace. `{{ date }}`, `{{Date}}` ou `{date}` ne sont pas remplacés.
- Toute autre variable (`{{auteur}}`) reste telle quelle dans la note.
- `{{title}}` étant remplacé en premier, un modèle titré `# Réunion du {{date}}` donne une note titrée `# Réunion du 26 novembre 2026`, et `{{title}}` y vaut aussi « Réunion du 26 novembre 2026 ».
- La date et l'heure sont celles du Mac (heure locale), à la minute.

### Création avec un titre donné

Une IA peut créer une note depuis un modèle en donnant le titre de la note. Dans ce cas, `{{title}}` vaut le titre donné, et la ligne de titre `#` de la note (après remplacement des variables) est remplacée par `# <titre donné>`, ou ajoutée en première ligne du contenu si le modèle n'a pas de titre.

### Exemple

Modèle `Modèles/reunion.md` :

```markdown
---
tags: [réunion]
pinned: true
participants: à compléter
---
# Réunion du {{date}}

Créée le {{date}} à {{time}} depuis « {{title}} ».

## Participants

## Décisions
- [ ] {{auteur}}
```

Note créée le 26 novembre 2026 à 14:30 dans le dossier `Travail`, fichier `Travail/reunion-du-26-novembre-2026.md` :

```markdown
---
tags: [réunion]
participants: à compléter
---
# Réunion du 26 novembre 2026

Créée le 26 novembre 2026 à 14:30 depuis « Réunion du 26 novembre 2026 ».

## Participants

## Décisions
- [ ] {{auteur}}
```

## Exemple complet

Fichier `Travail/Projets/refonte-du-site.md` :

```markdown
---
type: note
pinned: yes   # en tête de liste
tags:
  - projet
  - "client A"
date: 2026-11-26
---
# Refonte du site

Point de départ : [[Cahier des charges]], et la version précédente
dans [[Archives/Refonte du site|l'ancien projet]].

Voir aussi [[plan-du-projet.canvas]] et le site actuel : <https://exemple.fr>.

## À faire
- [x] Lister les écrans du site
- [ ] Valider la maquette

| Étape     | Date       |
|-----------|-----------:|
| Maquette  | 2026-12-01 |
| Mise en ligne | 2027-01-15 |

![](refonte-du-site.assets/image-2026-11-26-1430.png)
[devis signé.pdf](refonte-du-site.assets/devis%20signé.pdf)
```

Ce que l'application en lit :

- type de contenu : note ;
- épinglée : oui ;
- étiquettes : `projet`, `client A` ;
- clé `date` : inconnue d'une note, conservée telle quelle ;
- titre : « Refonte du site », d'où le nom `refonte-du-site.md` ;
- liens entre notes : `Cahier des charges`, `Archives/Refonte du site` (montré « l'ancien projet »), `plan-du-projet.canvas` ;
- adresse web : `https://exemple.fr` ;
- pièces jointes : `image-2026-11-26-1430.png` et `devis signé.pdf`, dans `Travail/Projets/refonte-du-site.assets/`.

## Références

- `doc/decisions/0002-notes-markdown-nom-tire-du-titre.md`
- `doc/decisions/0003-apercu-en-direct-par-masquage.md`
- `doc/decisions/0010-notes-epinglees.md`
- `doc/decisions/0013-pieces-jointes-collees.md`
- `doc/decisions/0016-liens-entre-notes.md`
- `doc/decisions/0019-modeles-de-note.md`
- `doc/decisions/0020-etiquettes.md`
- `doc/decisions/0023-note-du-jour.md`
- `doc/decisions/0034-index-par-types-de-contenu.md`
- `doc/decisions/0035-liens-ouverts-d-un-simple-clic.md`
- `doc/decisions/0041-cahier-de-recherche.md`
- `doc/decisions/0070-champ-d-etiquettes.md`
- `doc/decisions/0071-liens-sans-saisie.md`
- `doc/decisions/0077-dossier-des-modeles-pour-les-ia.md`
