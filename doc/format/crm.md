# Format de fichiers d'un CRM

Ce document est la seule description du format de fichiers d'un CRM : le fichier du CRM, son dossier des fiches et les quatre sortes de fiche (entreprise, personne, action, projet). Il suffit pour lire ou écrire un CRM avec un autre outil (Obsidian, un script, une IA) sans lire le code de l'application. Ce que l'écran montre et les gestes qui changent un CRM sont dans `doc/specs/crm.md`.

Les règles communes à toute note ne sont pas redites ici : forme générale de l'en-tête, titre, nom de fichier, liens entre notes, étiquettes (`tags`), pièces jointes et dossier de pièces jointes sont décrits dans `doc/format/note.md` ; l'espace de travail, ses dossiers et ses dossiers cachés dans `doc/format/espace-de-travail.md`. Un CRM et ses fiches sont des notes : tout ce qui vaut pour une note vaut pour eux, sauf ce que ce document précise.

## 1. Vue d'ensemble

```
ventes/
├── clients.md                                   type: crm
└── clients/                                     dossier des fiches
    ├── entreprises/acme.md                      type: crm-entreprise
    ├── personnes/jean-dupont.md                 type: crm-personne
    ├── actions/2026-11-24-demande-de-devis.md   type: crm-action
    └── projets/refonte-du-site.md               type: crm-projet
```

- Le **CRM** est une note dont l'en-tête déclare `type: crm`.
- Ses **fiches** sont des notes rangées dans son **dossier des fiches**, un sous-dossier par sorte de fiche.
- Une fiche désigne une autre fiche par sa **référence** `[[nom-de-fichier]]`.
- Tout ce que l'écran affiche d'autre (colonnes du Kanban, Ma semaine, compteurs, actions d'une personne, personnes d'une entreprise) est calculé à la lecture, jamais écrit dans un fichier.

## 2. Types

La sorte d'un fichier est donnée par la propriété `type:` de son en-tête.

| Valeur de `type:` | Sorte | Dossier |
|---|---|---|
| `crm` | le CRM | où l'on veut dans l'espace de travail |
| `crm-entreprise` | une entreprise | `<dossier des fiches>/entreprises/` |
| `crm-personne` | une personne | `<dossier des fiches>/personnes/` |
| `crm-action` | une action | `<dossier des fiches>/actions/` |
| `crm-projet` | un projet | `<dossier des fiches>/projets/` |

- Seule compte la **première** ligne `type:` du **premier niveau** de l'en-tête (la clé écrite en début de ligne, sans retrait). Les autres lignes `type:` sont ignorées.
- La valeur peut être entre apostrophes ou guillemets (`type: 'crm'`). Un commentaire YAML en fin de ligne est ignoré.
- La valeur doit être exactement l'une des cinq ci-dessus, en minuscules. Toute autre valeur (`crm-`, `CRM`, `crm-contact`) fait du fichier une note ordinaire.
- Une propriété `tags: [crm]` ou un titre `# crm` ne déclarent rien.
- Un fichier qui perd son `type:` redevient une note ordinaire. Il n'est plus lu par le CRM et ne part plus avec lui.

## 3. Emplacement et nommage

### 3.1 Le fichier du CRM

- Où l'on veut dans l'espace de travail, avec l'extension `.md`.
- Son nom de fichier suit les règles de toute note (`doc/format/note.md`). L'application le tire du titre à la création, puis à chaque renommage du CRM.
- Le dossier `x/` posé à côté d'un fichier `x.md` de type `crm` est son dossier des fiches. À la mise à la corbeille et au déplacement, l'application donne au CRM un suffixe (`x-2.md`, dossier `x-2/`) quand un dossier de ce nom existe déjà à l'arrivée ; un renommage vers un nom dont le dossier existe est refusé. La création d'un CRM ne fait pas ce contrôle : un CRM neuf `x.md` posé à côté d'un dossier `x/` existant le prend pour dossier des fiches.

### 3.2 Le dossier des fiches

- C'est le dossier qui porte le nom du fichier du CRM sans `.md`, dans le même dossier parent : `ventes/clients/` pour `ventes/clients.md`.
- Il contient au plus quatre sous-dossiers, nommés exactement `entreprises`, `personnes`, `actions` et `projets`.
- Le dossier des fiches et chaque sous-dossier naissent avec leur première fiche. Un CRM sans fiche n'a pas de dossier.
- **Une fiche est un fichier `.md` posé directement dans le sous-dossier de sa sorte**, avec le `type:` de cette sorte. Pour cette raison :
  - un fichier rangé dans un sous-dossier plus profond (`clients/actions/2026/x.md`) n'est pas lu ;
  - un fichier rangé dans le sous-dossier d'une autre sorte (une `crm-personne` dans `entreprises/`) n'est pas lu ;
  - un fichier sans le bon `type:` (une note ordinaire posée dans `personnes/`) n'est pas lu ;
  - un fichier `.canvas` n'est jamais une fiche.
- Une note ordinaire, ou un autre CRM avec son propre dossier des fiches, peut être rangé dans le dossier des fiches : l'application la laisse en place et ne la lit pas comme une fiche. Ce dossier est alors montré dans la liste des dossiers (voir la spécification pour l'écran).
- Le CRM qui contient une fiche se déduit uniquement de son chemin : `A/B/ventes/actions/x.md` appartient à `A/B/ventes.md`. Aucune propriété de la fiche ne nomme son CRM.

### 3.3 Nom de fichier d'une fiche

Le nom de fichier sans `.md` est la **référence** de la fiche : les autres fiches la désignent par ce nom.

- **Entreprise, personne, projet** : le nom (le titre) en kebab-case, puis `.md`.
- **Action** : le **jour de sa création** (pas sa `date`), une espace, son titre, le tout en kebab-case, puis `.md` : `2026-11-24-demande-de-devis.md` pour « Demande de devis » créée le 24 novembre 2026.
- **Kebab-case** : les accents sont retirés, chaque caractère qui n'est pas une lettre ou un chiffre ASCII devient un séparateur, les lettres passent en minuscules, les séparateurs successifs se réduisent à un seul trait d'union, sans trait d'union au début ni à la fin. « Acme, S.A. » donne `acme-s-a` ; « Élodie Marchand » donne `elodie-marchand`. Un nom sans lettre ni chiffre utilisable donne `sans-titre`.
- **Nom déjà pris** dans le sous-dossier de la sorte : l'application ajoute `-2`, puis `-3`, etc. (`acme-2.md`). Les noms se comparent dans ce seul sous-dossier : une personne et une entreprise peuvent avoir le même nom de fichier.
- **Le nom de fichier ne change jamais** une fois la fiche créée : renommer une fiche réécrit seulement sa ligne de titre `#`. Un outil externe ne doit pas renommer ni déplacer le fichier d'une fiche : toutes les références vers elle seraient perdues.
- Un autre outil peut créer une fiche sous n'importe quel nom de fichier valide. L'application la lit pareillement ; seule compte la référence que donne ce nom.

## 4. Règles communes aux fichiers du CRM

### 4.1 Titre

- Chaque fiche a un titre : le premier titre `#` de la note, sur une ligne.
- Une fiche sans titre est **illisible** : le CRM la laisse de côté (il la signale comme illisible), sans jamais la modifier ni l'effacer.
- Un CRM sans titre reste lisible : il est montré « Sans titre ».

### 4.2 En-tête

L'en-tête suit la forme générale de `doc/format/note.md`. Le CRM le lit comme du YAML simple, clé par clé, sans analyseur YAML complet :

- Une clé n'est reconnue qu'au premier niveau : écrite en début de ligne, suivie de `:` (des espaces sont permis avant les deux-points). Une clé en retrait n'est pas lue.
- Seule compte la **première** ligne d'une clé.
- Une **valeur seule** : le texte après les deux-points, sans espaces autour. Elle peut être entre apostrophes (`'l''atelier'` se lit `l'atelier`) ou entre guillemets (`"a\"b"` se lit `a"b`). Un commentaire YAML (`#` précédé d'une espace, hors guillemets) est retiré. Une valeur vide vaut une clé absente.
- Une **liste** s'écrit de trois façons, toutes lues :
  - entre crochets, éléments séparés par des virgules : `tags: [devis, relance]` ; une virgule entre guillemets ou à l'intérieur de `[[…]]` ne sépare pas ;
  - en liste YAML, un élément par ligne sous la clé laissée vide : `etapes:` puis `  - Négo` ;
  - une valeur seule, lue comme une liste d'un élément.
- Une valeur qui n'est qu'une référence (`[[acme]]`, sans guillemets) est lue comme une référence, pas comme une liste.
- Un élément vide est ignoré.
- Les clés que le CRM ne connaît pas (`aliases`, `pinned`, toute clé libre) sont lues comme pour une note et toujours gardées telles quelles.

### 4.3 Écriture des valeurs par l'application

L'application écrit les valeurs ainsi :

- **Références et jours** : toujours entre apostrophes : `projet: '[[refonte-du-site]]'`, `date: '2026-11-24'`. Les éléments d'une liste de références aussi : `notes: ['[[Cahier des charges]]']`.
- **Rang** : un entier nu : `rang: 2`.
- **Autres valeurs seules** (statut, canal, couleur, champs d'une entreprise ou d'une personne) : telles quelles, sauf si YAML les lirait autrement que comme du texte ; elles sont alors mises entre apostrophes. C'est le cas d'une valeur :
  - vide ou avec des espaces au début ou à la fin ;
  - qui commence par l'un des signes `[ ] { } & * ! | > ' " % @ ` # , ?`, ou par `- `, ou qui vaut `-` ;
  - qui contient `: ` ou ` #`, ou qui finit par `:` ;
  - qui vaut, sans compter les majuscules, `true`, `false`, `yes`, `no`, `on`, `off`, `null`, `~`, `y`, `n` ou `nan` ;
  - qui se lit comme un nombre (`0612345678`, `1.5`).
- **Éléments d'une liste entre crochets** (étapes) : mêmes règles, et aussi entre apostrophes s'ils contiennent `,`, `[`, `]`, `{` ou `}` : `etapes: [Négo, 'A, B']`.
- Une apostrophe dans une valeur entre apostrophes est doublée (`'l''atelier'`). Un retour à la ligne dans une valeur devient une espace.
- Les listes sont toujours écrites entre crochets, sur une ligne : une liste YAML écrite à la main est remplacée par une liste entre crochets quand l'application réécrit cette clé.

### 4.4 Ce que l'application réécrit et ce qu'elle garde

- **Un geste ne change que la clé touchée**, sur la version du fichier lue juste avant : sa ligne (et la liste YAML qui la suivait) est remplacée **à sa place**. Les autres lignes de l'en-tête, leurs commentaires YAML, les clés inconnues, le titre et le texte restent identiques octet pour octet.
- Une clé absente est **ajoutée après les autres clés** de l'en-tête.
- Une valeur vidée **retire la clé** (sa ligne et sa liste).
- Un commentaire YAML écrit sur la ligne même d'une clé réécrite est perdu avec cette ligne.
- Un geste qui ne change rien laisse le fichier intact (il n'est pas réécrit).
- Les fins de ligne `\r\n` d'un en-tête sont reprises pour une ligne ajoutée.
- Une valeur inconnue ou illisible (canal inconnu, couleur hors palette, jour mal écrit) **reste dans le fichier** tant que le geste qui touche sa clé n'est pas fait ; elle est seulement ignorée à la lecture.
- Un fichier neuf écrit par l'application finit par un seul retour à la ligne.

### 4.5 Référence

- Une référence s'écrit `[[cible]]` : deux crochets ouvrants, la cible, deux crochets fermants.
- Pour une fiche, la cible est son **nom de fichier sans dossier ni extension** : `[[jean-dupont]]` désigne `personnes/jean-dupont.md` du même CRM. La sorte de la fiche visée est donnée par la clé qui porte la référence (une `entreprise` est cherchée dans `entreprises/`, un `projet` dans `projets/`).
- Pour une note liée, la cible est le **titre de la note**, comme un lien entre notes (`doc/format/note.md`).
- Des espaces autour de la cible sont permis et retirés (`[[ acme ]]` vaut `[[acme]]`).
- Un texte montré après une barre est permis et ignoré : `[[acme|Acme SA]]` désigne `acme`.
- N'est pas une référence : une cible vide, une cible qui contient `[`, `]`, `|` ou un retour à la ligne, un texte avant ou après les crochets (`x [[a]]`), deux références collées (`[[a]][[b]]`). Une valeur qui n'est pas une référence est ignorée à la lecture.
- **Une référence vers une fiche qui n'existe pas** (fiche supprimée hors de l'application, mal écrite) est ignorée à l'affichage. Elle reste dans le fichier : l'application ne la retire que lorsqu'elle supprime elle-même la fiche visée (§ 10).
- Les références d'une fiche ne sont pas des liens entre notes : une note qui porte le titre « Acme » ne reçoit pas de lien entrant des actions de l'entreprise `[[acme]]`.

### 4.6 Jour et moment

- Un **jour** s'écrit `AAAA-MM-JJ` : quatre chiffres, deux, deux, séparés par des traits d'union (`2026-11-24`). L'année va de 1 à 9999 ; le jour doit exister (pas de `2026-02-30`). Toute autre forme (`2026-1-5`, `24/11/2026`) est illisible et ignorée.
- Un **moment** (date d'un commentaire) s'écrit `AAAA-MM-JJ HH:MM`, une espace entre le jour et l'heure, deux chiffres pour l'heure (00 à 23) et pour la minute (00 à 59). Il est à l'heure du Mac, sans fuseau.
- Il n'y a pas de semaine dans les fichiers : Ma semaine (du lundi au dimanche) est calculée d'après la `date` des actions ouvertes.

### 4.7 Couleurs

Une couleur s'écrit par son nom dans la palette de l'application, en minuscules : `rouge`, `orange`, `jaune`, `vert`, `turquoise`, `bleu`, `violet`, `rose`, `marron`, `ardoise` (dans cet ordre, celui des menus).

- À la lecture, les majuscules et les espaces autour sont ignorés (`Violet` vaut `violet`). Un autre nom, ou une valeur hexadécimale (`#2563eb`), est inconnu.
- L'application écrit toujours le nom en minuscules.
- La couleur d'une étiquette n'est jamais écrite : elle est calculée d'après son nom.

### 4.8 Texte comparé « sans majuscules ni accents »

Plusieurs valeurs (statut, étape, canal) se comparent sans compter les majuscules ni les accents, les espaces ramenées à une seule et sans espaces autour : `progress`, `PROGRESS` et ` Progress ` désignent la même étape ; `Réseau   social` et `reseau social` le même canal.

### 4.9 Étiquettes

- Le CRM et chaque fiche peuvent porter `tags`, avec les règles de lecture et d'écriture de toute note (`doc/format/note.md`).
- La clé n'est écrite que s'il y a au moins une étiquette.
- Changer les étiquettes ne change que la clé `tags`.

## 5. Le fichier du CRM

### 5.1 En-tête

| Clé | Type | Obligatoire | Valeurs | Absente |
|---|---|---|---|---|
| `type` | texte | oui | `crm` | le fichier n'est pas un CRM |
| `etapes` | liste de noms d'étape | non | voir ci-dessous | « Progress » puis « WaitingFor » |
| `tags` | liste d'étiquettes | non | § 4.9 | aucune étiquette |

**`etapes`** : la liste ordonnée des étapes, les colonnes du Kanban entre « TODO » et « Done ».

- Clé absente : les étapes par défaut, `Progress` puis `WaitingFor`.
- Clé présente et vide (`etapes: []`, ou `etapes:` sans élément) : aucune étape ; le Kanban a trois colonnes.
- Liste entre crochets ou liste YAML : les deux sont lues.
- Un nom d'étape tient sur une ligne, fait au plus 40 caractères (sans espaces autour) et n'est ni `TODO`, ni `Done`, ni `Cancel` (sans compter majuscules ni accents).
- À la lecture, un élément qui n'est pas une étape valable, ou qui répète une étape déjà lue (comparaison du § 4.8), est ignoré ; le fichier ne change pas.
- L'application écrit la liste entière entre crochets, à la place de la clé, quand les étapes changent (`etapes: [Négo, 'Relance 2']`). Retirer toutes les étapes écrit `etapes: []` : la clé ne disparaît pas, sinon les étapes par défaut reviendraient.
- Un CRM neuf est écrit sans `etapes`.

### 5.2 Corps

- Le titre `#` est le nom du CRM.
- Le texte sous le titre n'est ni lu ni montré par le CRM, et jamais modifié.

### 5.3 Fichier neuf

```markdown
---
type: crm
---
# Clients
```

## 6. Une entreprise

### 6.1 En-tête

| Clé | Type | Obligatoire | Valeurs | Absente |
|---|---|---|---|---|
| `type` | texte | oui | `crm-entreprise` | pas une entreprise |
| `site` | texte | non | une adresse web, libre | pas de site |
| `secteur` | texte | non | libre | pas de secteur |
| `adresse` | texte | non | libre | pas d'adresse |
| `telephone` | texte | non | libre | pas de téléphone |
| `tags` | liste | non | § 4.9 | aucune étiquette |

- Les quatre champs sont du texte libre, sans contrôle de forme. L'application les écrit selon le § 4.3 (un numéro tout en chiffres est donc mis entre apostrophes).
- L'application ajoute un champ absent après les autres clés et retire un champ vidé.

### 6.2 Corps

- Le titre `#` est le nom de l'entreprise, obligatoire.
- Le texte sous le titre est les **notes libres** : tout le Markdown, liens entre notes compris. Les lignes vides du début et de la fin ne comptent pas.
- L'application écrit les notes libres ainsi : une ligne vide après le titre, les notes, un retour à la ligne ; rien sous le titre si elles sont vides.

### 6.3 NODATA

NODATA est l'entreprise des personnes qui n'en ont pas. **Ce n'est pas une fiche** : aucun fichier ne la représente, aucune clé ne l'écrit. Une personne sans clé `entreprise` est dans NODATA ; une action sans personne, ou dont la personne n'avait pas d'entreprise, est dans NODATA. Le nom `NODATA` n'est pas réservé : un fichier `entreprises/nodata.md` serait une entreprise ordinaire.

### 6.4 Fichier neuf

```markdown
---
type: crm-entreprise
---
# Acme
```

## 7. Une personne

### 7.1 En-tête

| Clé | Type | Obligatoire | Valeurs | Absente |
|---|---|---|---|---|
| `type` | texte | oui | `crm-personne` | pas une personne |
| `entreprise` | référence | non | `'[[nom-de-fichier]]'` d'une entreprise | la personne est dans NODATA |
| `parcours` | liste de passages | non | voir ci-dessous | parcours vide |
| `fonction` | texte | non | libre | pas de fonction |
| `email` | texte | non | libre | pas d'e-mail |
| `telephone` | texte | non | libre | pas de téléphone |
| `linkedin` | texte | non | une adresse web, libre | pas de LinkedIn |
| `tags` | liste | non | § 4.9 | aucune étiquette |

- **`entreprise`** : l'entreprise actuelle, une seule. Une valeur qui n'est pas une référence vaut une clé absente (NODATA).
- **`parcours`** : un élément par **passage**, dans l'ordre écrit :
  - `[[entreprise]] · début → fin` pour un passage terminé : `'[[globex]] · 2024-01-10 → 2026-03-01'` ;
  - `[[entreprise]] · début →` pour le passage en cours, sans jour de fin.
  - Le séparateur entre l'entreprise et les jours est le point médian `·` (U+00B7) ; entre les deux jours, la flèche `→` (U+2192). Les espaces autour sont libres à la lecture ; l'application écrit une espace de chaque côté.
  - Les jours suivent le § 4.6.
  - Un élément illisible (pas de `·` ou de `→`, référence ou jour invalide) est ignoré à la lecture, mais gardé dans le fichier.
- Les champs `fonction`, `email`, `telephone`, `linkedin` sont du texte libre, écrits selon le § 4.3.
- L'application écrit `entreprise` et chaque élément de `parcours` entre apostrophes.

### 7.2 Changer d'entreprise

Quand une personne change d'entreprise un jour J (dans l'application, ou parce que son entreprise est supprimée), l'application :

1. ferme à J le **dernier** passage en cours lisible du parcours (il reçoit ` J` après la flèche) ;
2. ajoute à la fin un passage `[[nouvelle]] · J →`, sauf pour NODATA ;
3. écrit `entreprise: '[[nouvelle]]'`, ou retire la clé pour NODATA ;
4. réécrit `parcours` en entier entre crochets, en gardant tels quels les éléments illisibles.

Une personne qui change vers l'entreprise où elle est déjà ne change pas.

La cohérence entre `entreprise` et `parcours` n'est pas contrôlée à la lecture : un fichier écrit à la main peut avoir une `entreprise` sans passage en cours, ou l'inverse. Chaque clé est lue pour elle-même.

### 7.3 Corps

- Le titre `#` est le nom entier de la personne (prénom et nom), obligatoire.
- Le texte sous le titre est ses notes libres, lues et écrites comme celles d'une entreprise (§ 6.2).

### 7.4 Fichier neuf

Créée depuis une entreprise, la personne y entre le jour même :

```markdown
---
type: crm-personne
entreprise: '[[acme]]'
parcours: ['[[acme]] · 2026-11-24 →']
---
# Jean Dupont
```

Créée ailleurs, elle est dans NODATA : l'en-tête n'a que `type: crm-personne`. Les champs (`fonction`, `email`…) s'ajoutent ensuite après les autres clés.

## 8. Une action

### 8.1 En-tête

| Clé | Type | Obligatoire | Valeurs | Absente ou illisible |
|---|---|---|---|---|
| `type` | texte | oui | `crm-action` | pas une action |
| `personnes` | liste | non | `'[[personne]] · [[entreprise]]'` ou `'[[personne]]'` | aucune personne |
| `statut` | texte | non | `TODO`, une étape du CRM, `Done`, `Cancel` | `TODO` |
| `date` | jour | non | `'AAAA-MM-JJ'` | pas de date |
| `canal` | texte | non | `appel`, `e-mail`, `rendez-vous`, `courrier`, `salon`, `réseau social`, `autre` | pas de canal |
| `projet` | référence | non | `'[[nom-de-fichier]]'` d'un projet | « Sans projet » |
| `couleur` | texte | non | un nom de la palette (§ 4.7) | sans couleur |
| `tags` | liste | non | § 4.9 | aucune étiquette |
| `notes` | liste de références | non | `'[[titre de la note]]'` | aucune note liée |
| `rang` | entier | non | 1 ou plus | pas de place choisie |

**`personnes`** : zéro, une ou plusieurs personnes.

- Chaque élément est la référence de la personne, suivie de ` · ` et de la référence de **l'entreprise qu'elle avait au moment où elle a été donnée à l'action**. Sans ` · …`, la personne était dans NODATA à ce moment.
- Une action garde ainsi l'entreprise du moment : quand la personne change d'entreprise, ses actions ne sont pas réécrites.
- À la lecture : un élément dont la personne n'est pas une référence est ignoré ; si la partie après `·` n'est pas une référence, la personne est lue sans entreprise (NODATA) ; une personne déjà lue plus haut est ignorée (seule la première compte).
- Quand l'application réécrit la liste (donner ou retirer une personne), elle écrit les seuls éléments lisibles, sans doublon : un élément illisible disparaît alors.

**`statut`** : le nom de la colonne du Kanban où se range l'action.

- Lu sans compter majuscules ni accents (§ 4.8) parmi `TODO`, les étapes du CRM (§ 5.1), `Done` et `Cancel`.
- Absent, ou nom qui n'est pas une colonne du CRM (fichier écrit à la main, étape retirée entre-temps) : l'action se range dans « TODO », **sans que son fichier change**.
- L'application écrit le nom exact de la colonne (`WaitingFor`, pas `waitingfor`).
- **Action ouverte** : `TODO` ou une étape. **Action terminée** : `Done` ou `Cancel`.

**`date`** : pour une action ouverte, le jour où elle est à faire ; pour une action terminée, le jour où elle a été faite.

- Absente ou illisible : l'action n'a pas de date ; elle n'est jamais en retard, passe après les autres dans sa colonne et n'apparaît pas dans Ma semaine.
- Une action ouverte est en retard à partir du jour qui suit sa date. Cet état n'est jamais écrit.

**`canal`** : comment l'échange a eu lieu, l'un des sept noms, lu sans compter majuscules ni accents. Une autre valeur : pas de canal (la valeur reste dans le fichier).

**`projet`** : un seul projet. Une valeur qui n'est pas une référence : « Sans projet ».

**`couleur`** : la couleur d'action, sans rapport avec la couleur du projet. Un nom hors palette : sans couleur (la valeur reste dans le fichier jusqu'au prochain choix de couleur).

**`notes`** : les notes liées, chacune désignée par son titre comme un lien entre notes. Un élément qui n'est pas une référence est ignoré. Une note liée absente n'est jamais retirée.

**`rang`** : la place choisie à la main dans une colonne ouverte.

- Un entier de 1 à 4 294 967 295, écrit sans apostrophes. `0`, un nombre négatif, un texte : pas de rang.
- Le rang ne se règle pas à la main : il est tenu par l'application (voir § 9).

### 8.2 Ordre des clés

L'application écrit une action neuve avec ses clés dans l'ordre du tableau ci-dessus (`type`, `personnes`, `statut`, `date`, `canal`, `projet`, `couleur`, `tags`, `notes`, `rang`), sans les clés vides. Ensuite, chaque clé est réécrite à sa place et une clé nouvelle s'ajoute après les autres. L'ordre des clés n'a aucun sens à la lecture.

### 8.3 Corps

Le texte sous le titre a trois sortes de parties : la **description**, les **checklists** et les **commentaires**.

**Titre** : le premier titre `#`, une ligne, obligatoire. Plusieurs actions peuvent porter le même titre.

**Checklist** : une ligne de titre, puis un élément par ligne.

```markdown
#### Liste à cocher : Préparation
- [x] Relire la demande
- [ ] Chiffrer
```

- La ligne de titre est `#### Liste à cocher`, suivie de ` : nom`. Les espaces avant les deux-points sont libres (`#### Liste à cocher: nom`) ; le nom peut manquer (`#### Liste à cocher`), la checklist n'a alors pas de nom.
- Un élément est une puce (`-`, `*` ou `+`), une espace, puis `[ ]` (non coché) ou `[x]` / `[X]` (coché), puis le texte. Un retrait avant la puce est permis.
- Une action peut avoir plusieurs checklists ; elles se lisent dans l'ordre du fichier.

**Commentaires** : une ligne de titre, puis un commentaire par entrée.

```markdown
#### Commentaires
- 2026-11-24 10:32 · Rappelé, pas de réponse.
  Retenter jeudi.
- 2026-11-25 09:05 · Devis reçu.
```

- La ligne de titre est exactement `#### Commentaires`.
- Un commentaire commence par `- `, le moment `AAAA-MM-JJ HH:MM` (§ 4.6), puis ` · ` (point médian U+00B7) et la première ligne du texte.
- Les lignes suivantes d'un commentaire sont **en retrait** (l'application met deux espaces ; à la lecture, deux espaces ou des tabulations sont retirés). Une ligne vide entre deux lignes en retrait est gardée dans le texte.
- Le texte d'un commentaire est du Markdown.
- Les commentaires sont écrits **dans l'ordre d'ajout**, le plus ancien en haut ; un nouveau commentaire s'ajoute à la fin. L'écran les montre dans l'ordre inverse.
- Modifier un commentaire garde son moment d'origine.
- Plusieurs parties `#### Commentaires` sont permises : leurs commentaires se lisent à la suite.

**Description** : tout le reste du texte sous le titre, en Markdown, liens entre notes compris, sans les lignes vides du début et de la fin.

**Découpage** :

- Les parties peuvent se suivre **dans n'importe quel ordre**. Une checklist ou les commentaires vont de leur ligne de titre `####` jusqu'à la ligne de titre de la partie suivante, ou jusqu'à la fin.
- Le texte placé avant la première ligne de titre de partie est la description.
- Une ligne qui n'a pas sa place dans sa partie est rangée **à la fin de la description** : dans une checklist, une ligne qui n'est pas un élément ; dans les commentaires, une ligne qui ne commence pas un commentaire et n'est pas en retrait derrière un commentaire. Les lignes vides ont leur place partout.
- Dans un bloc de code (entre deux lignes qui commencent par ` ``` ` ou `~~~`), une ligne `#### Liste à cocher` ou `#### Commentaires` n'ouvre pas de partie ; un bloc de code placé dans une checklist ou dans les commentaires va à la description.
- Tout autre titre `####` (ou de niveau différent) fait partie de la description.

**Écriture par l'application** :

- Un geste sur le corps (description, une checklist, un élément, un commentaire) réécrit le corps dans l'ordre **description, checklists, commentaires**, chaque partie séparée par une ligne vide, avec une ligne vide après le titre et un retour à la ligne final.
- Une checklist que le geste ne touche pas, et les commentaires s'ils ne changent pas, gardent leur texte tel qu'il était écrit. Seule la partie touchée est réécrite dans la forme canonique (`#### Liste à cocher : nom`, `- [ ] texte`, `- AAAA-MM-JJ HH:MM · texte`).
- Les lignes qui n'avaient pas leur place passent alors définitivement dans la description.
- Un geste sur l'en-tête ne touche jamais le corps.
- Le nom d'une checklist et le texte d'un élément tiennent sur une ligne (l'application refuse un retour à la ligne, et réduit les espaces).

**Liens** : les notes liées (`notes`), les `[[titre]]` de la description et ceux des commentaires sont des liens entre notes (liens entrants de la note visée). Ceux des checklists, et les références de l'en-tête (`personnes`, `projet`), n'en sont pas.

### 8.4 Fichier neuf

L'application écrit une action neuve d'un coup : en-tête dans l'ordre du § 8.2, titre, description s'il y en a une. Une action neuve n'a ni checklist, ni commentaire, ni rang. Sa `date` est celle choisie, aujourd'hui sinon ; son `statut` celui de la colonne choisie, `TODO` sinon. Chaque personne donnée y entre avec la valeur `entreprise` de sa fiche à cet instant.

## 9. Colonnes du Kanban et rang

Les colonnes ne sont écrites nulle part en tant que telles. Elles se déduisent de deux clés :

- **Les colonnes** viennent de `etapes` dans le CRM : `TODO`, puis les étapes dans l'ordre, puis `Done` et `Cancel`.
- **La colonne d'une action** vient de son `statut` (§ 8.1).
- **L'ordre dans une colonne ouverte** : d'abord les actions qui ont un `rang`, par rang croissant ; puis les autres par `date`, la plus ancienne d'abord, celles sans date à la fin ; à égalité, par nom de fichier.
- **L'ordre dans une colonne terminée** (`Done`, `Cancel`) : par `date`, la plus récente d'abord, sans date à la fin ; à égalité, le nom de fichier le plus grand d'abord. Le `rang` n'y compte pas.

Ce que l'application écrit :

- **Changer le statut** d'une action réécrit `statut` et **retire `rang`**. Donner à une action le statut qu'elle a déjà ne change rien.
- **Placer une carte** dans une colonne ouverte renumérote la colonne : chaque action de la colonne reçoit son numéro de place à partir de 1, et seules celles dont le rang change sont réécrites. Toutes ces écritures forment un seul geste (§ 11).
- **Renommer une étape** réécrit `etapes` dans le CRM et le `statut` de chaque action de cette étape ; le rang reste.
- **Retirer une étape** réécrit `etapes` et met chaque action de cette étape en `TODO`, rang retiré.
- **Déplacer ou ajouter une étape** réécrit seulement `etapes`.

Un outil externe peut écrire n'importe quel `statut` ; il ne doit pas écrire `rang` (des rangs incohérents ne cassent rien, ils sont seulement réordonnés au prochain placement).

## 10. Un projet

### 10.1 En-tête

| Clé | Type | Obligatoire | Valeurs | Absente ou inconnue |
|---|---|---|---|---|
| `type` | texte | oui | `crm-projet` | pas un projet |
| `couleur` | texte | non | un nom de la palette (§ 4.7) | lue comme `rouge`, la première de la palette, sans que le fichier change |
| `tags` | liste | non | § 4.9 | aucune étiquette |

- L'application écrit `couleur` à la création (la couleur la moins utilisée par les projets du CRM, la première de la palette en cas d'égalité), puis seulement quand l'utilisateur en choisit une. Plusieurs projets peuvent avoir la même couleur.

### 10.2 Corps

- Le titre `#` est le nom du projet, obligatoire.
- Le texte sous le titre est gardé tel quel, jamais lu ni montré.

### 10.3 Fichier neuf

```markdown
---
type: crm-projet
couleur: bleu
---
# Refonte du site
```

## 11. Gestes qui touchent plusieurs fichiers

Certains gestes réécrivent ou mettent à la corbeille plusieurs fichiers. L'application les applique tous, ou aucun :

| Geste | Fichiers touchés |
|---|---|
| Supprimer une entreprise | chaque personne dont `entreprise` la désigne passe à NODATA (§ 7.2, jour du changement : le jour de la suppression) ; puis l'entreprise va à la corbeille. Les actions ne changent pas : elles gardent l'entreprise du moment. |
| Supprimer une personne | chaque action dont `personnes` la cite est réécrite sans elle ; puis la personne va à la corbeille. |
| Supprimer un projet | chaque action dont `projet` le désigne perd sa clé `projet` ; puis le projet va à la corbeille. |
| Supprimer une action | l'action va à la corbeille avec son dossier de pièces jointes ; aucune autre fiche ne change. |
| Placer une carte | l'action placée et les actions de la colonne dont le rang change. |
| Renommer ou retirer une étape | le CRM et les actions de cette étape. |

- Restaurer une fiche depuis la corbeille ne rétablit pas les références retirées par sa suppression.
- Un geste à plusieurs fichiers est d'abord gardé dans le dossier caché `.pending-gestures/` de l'espace de travail (un fichier JSON par geste, voir `doc/format/espace-de-travail.md`), puis appliqué, puis oublié. Interrompu (coupure, arrêt, disque plein), il est terminé à l'ouverture suivante de l'espace de travail ou avant le geste suivant. Un pas sur un fichier qui n'existe plus est sans effet : un geste ne recrée jamais une fiche.
- Un geste relit chaque fichier juste avant de l'écrire. Si la fiche n'existe plus, ou n'a plus le `type:` de sa sorte, le geste est abandonné (« Cette fiche n'existe plus. »).

## 12. Le CRM et ses fiches, ensemble

Un CRM et ses fiches vivent ensemble (fiche 0091). Côté fichiers :

- **Renommer le CRM** : son fichier prend le nom tiré du nouveau titre, et son dossier des fiches prend le même nom (`clients.md` et `clients/` deviennent `prospects.md` et `prospects/`). Aucune fiche n'est réécrite : les références n'ont pas de dossier. Le renommage est refusé si le nouveau nom de fichier ou le nouveau nom de dossier est déjà pris.
- **Mettre le CRM à la corbeille** :
  - les fiches partent **avant** le fichier du CRM (une erreur laisse le CRM entier, jamais des fiches orphelines) ;
  - si le dossier des fiches ne contient que des fiches de ce CRM, il part **tout entier**, avec ses sous-dossiers (même vides) et les pièces jointes des actions ;
  - sinon seules les fiches partent, une à une, avec leurs pièces jointes ; la note ordinaire reste, et le dossier avec elle. Le dossier d'un autre CRM rangé dedans garde ses propres fiches ;
  - un CRM sans dossier part comme une note ;
  - dans la corbeille, le CRM et son dossier des fiches portent le même nom : un nom déjà pris donne au CRM un suffixe (`clients-2.md`) que le dossier prend aussi (`clients-2/`).
- **Restaurer le CRM** : le CRM et ses fiches reviennent au même endroit. Si le disque a repris le nom, le CRM prend un suffixe et ses fiches vont dans le dossier de ce nom ; une fiche dont le nom est pris prend un suffixe comme toute note restaurée. Restaurer une fiche seule la remet seule, sans son CRM.
- **Déplacer le CRM** : son dossier des fiches suit, selon les mêmes règles (dossier entier, ou fiches seules). Un nom de fichier ou de dossier déjà pris à l'arrivée donne au CRM un suffixe, que son dossier prend aussi. Un CRM ne se déplace pas dans son propre dossier des fiches.
- **Fiches sans CRM** (un fichier de CRM supprimé ou renommé hors de l'application) : elles ne sont jamais supprimées d'office. Leur dossier redevient un dossier ordinaire ; recréer un CRM du même nom de fichier à côté le leur rend.

## 13. Ce que l'application tolère à la lecture

Rien n'est jamais effacé parce qu'il est illisible :

- **Fiche illisible** (bon `type:` et bon dossier, mais pas de titre `#`) : laissée de côté, signalée comme illisible, jamais modifiée.
- **Fichier hors règle** (mauvais dossier, sous-dossier trop profond, `type:` d'une autre sorte) : pas une fiche, ignoré par le CRM.
- **Clé manquante** : la valeur par défaut du tableau de chaque sorte.
- **Clé en double** : seule la première compte ; une réécriture ne touche que la première.
- **Valeur inconnue** (statut, canal, couleur) : la valeur par défaut, le fichier inchangé.
- **Jour ou moment mal écrit** : ignoré ; un commentaire dont le moment est illisible n'est pas un commentaire (sa ligne va à la description).
- **Référence illisible ou vers une fiche absente** : ignorée à l'affichage, laissée dans le fichier.
- **Étape invalide ou répétée** dans `etapes` : ignorée.
- **Doublon de personne** dans `personnes` : seule la première entrée compte.
- **Passage illisible** dans `parcours` : ignoré et gardé.
- **Deux entreprises, deux personnes ou deux projets de même nom** écrits à la main : lus tous les deux. L'application refuse seulement d'en créer ou d'en renommer un sous un nom déjà pris (noms comparés sans majuscules, sans accents et sans ponctuation).
- **Clé inconnue, commentaire YAML, texte inconnu** : gardés octet pour octet.

## 14. Exemple complet

Un CRM `ventes/clients.md` avec une entreprise, une personne, un projet et une action.

`ventes/clients.md` :

```markdown
---
type: crm
etapes: [Progress, WaitingFor, Négociation]
tags: [commercial]
---
# Clients

Suivi commercial des comptes industriels.
```

`ventes/clients/entreprises/acme-industries.md` :

```markdown
---
type: crm-entreprise
site: https://acme-industries.example.com
secteur: Industrie manufacturière
adresse: 12 rue de l'Atelier, 69003 Lyon
telephone: +33 4 00 00 00 01
tags: [compte-cle]
---
# Acme Industries

- Client historique, 3 sites de production
- Décision d'achat : direction industrielle
```

`ventes/clients/personnes/sophie-martin.md` :

```markdown
---
type: crm-personne
entreprise: '[[acme-industries]]'
parcours: ['[[globex]] · 2023-02-01 → 2026-03-01', '[[acme-industries]] · 2026-03-01 →']
fonction: Responsable des achats
email: sophie.martin@acme-industries.example.com
telephone: '0600000002'
linkedin: https://www.linkedin.com/in/sophie-martin
---
# Sophie Martin

Préfère être appelée le matin.
```

`ventes/clients/projets/deploiement-gmao-acme.md` :

```markdown
---
type: crm-projet
couleur: bleu
tags: [gmao]
---
# Déploiement GMAO Acme
```

`ventes/clients/actions/2026-11-20-relance-du-devis-acme.md` :

```markdown
---
type: crm-action
personnes: ['[[sophie-martin]] · [[acme-industries]]', '[[karim-benali]]']
statut: WaitingFor
date: '2026-11-24'
canal: appel
projet: '[[deploiement-gmao-acme]]'
couleur: violet
tags: [devis, relance]
notes: ['[[Devis GMAO 2026]]']
rang: 1
---
# Relance du devis Acme

Devis envoyé le 14 novembre, sans réponse. Voir le [[Compte rendu de la visite Acme]].

#### Liste à cocher : Relance
- [x] Appeler l'acheteuse
- [ ] Envoyer le devis révisé

#### Commentaires
- 2026-11-24 10:23 · Premier appel : messagerie. Message laissé.
- 2026-11-25 09:05 · Rappel reçu.
  L'acheteuse attend l'accord du service financier.
```

Dans cet exemple :

- `[[karim-benali]]` n'a pas d'entreprise après lui : il était dans NODATA quand il a été donné à l'action.
- `[[globex]]` n'a pas de fiche : le passage est ignoré à l'affichage et gardé dans le fichier.
- Le nom de fichier de l'action porte le jour de sa création (20 novembre), sa `date` le jour où elle est à faire (24 novembre).
- `telephone: '0600000002'` est entre apostrophes parce qu'il se lirait comme un nombre.

## Références

- Spécification fonctionnelle : `doc/specs/crm.md`
- Format d'une note : `doc/format/note.md`
- Format de l'espace de travail : `doc/format/espace-de-travail.md`
- Vocabulaire : `doc/ontology.md`
- `doc/decisions/0057-crm-domaine.md`
- `doc/decisions/0058-crm-stockage.md`
- `doc/decisions/0060-crm-vue-kanban.md`
- `doc/decisions/0061-crm-claude.md`
- `doc/decisions/0062-crm-fenetre-action.md`
- `doc/decisions/0063-crm-listes-et-fiches.md`
- `doc/decisions/0081-crm-par-le-mcp.md`
- `doc/decisions/0089-dossiers-de-fiches-cachees.md`
- `doc/decisions/0090-renommer-un-contenu.md`
- `doc/decisions/0091-supprimer-un-crm-avec-ses-fiches.md`
