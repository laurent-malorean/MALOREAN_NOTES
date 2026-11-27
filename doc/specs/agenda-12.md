# Agenda 12

Spécification fonctionnelle rédigée le 27/11, **validée par l'utilisateur le 27/11** (demande de développement). Ce document se lit seul.

## 1. Idée

Un agenda classique est mal fait pour les événements qu'on situe d'abord par leur mois : le salon professionnel de février, le renouvellement des noms de domaine du site en février dans trois ans, l'audit ISO de janvier. Posés sur un jour précis, on les oublie si l'on rate ce jour ; posés sur plusieurs jours, ils encombrent l'agenda. Et l'agenda ne donne pas de vue d'ensemble : quels salons cette année (budget à prévoir, pas de congés sur ces dates), où en sont les renouvellements de domaines, l'audit est-il dans deux mois.

L'**agenda 12** est un nouveau type de contenu, à côté de la note, du cahier de recherche, de la carte mentale, du canvas et du CRM : une grille de 12 cases, une par mois, de janvier à décembre, où chaque événement est rangé dans son mois. Le jour et l'année sont facultatifs. Chaque événement est une note, où l'on écrit tout son détail.

## 2. Vocabulaire

- **Agenda 12** : le contenu, une note de type `agenda-12` montrée en grille de 12 mois. Un espace de travail en a autant qu'on veut (un pour les salons, un pour les domaines…), indépendants.
- **Événement** : une note rangée dans le dossier d'un agenda 12 ; elle a au moins un titre et un mois.
- **Case** : la place d'un mois dans la grille ; elle liste les événements de ce mois.
- **Clore** : sortir un événement de la grille en le rangeant dans les archives de son agenda 12.
- **Archives** : les événements clos d'un agenda 12.

Ces mots entrent dans `doc/ontology.md` avant le code. « Événement » existe déjà dans « Événement de Claude » : l'ontologie distingue les deux.

## 3. Principes

- Un agenda 12 est une note, ses événements aussi : renommage, déplacement, corbeille, historique des versions, recherche, liens entre notes, synchronisation par iCloud.
- **Un fichier par événement**, en Markdown ordinaire, lisible et modifiable à la main (Obsidian, une IA). La grille est calculée à la lecture, jamais écrite.
- **La grille est toujours la même** : janvier à décembre, sans année affichée, sans passage d'une année à l'autre. L'année d'un événement est une information de l'événement, montrée sur sa ligne (§ 5.3).
- **Rien ne disparaît seul** : un événement d'une année passée, jamais clos, reste dans sa case. C'est à l'utilisateur de le clore.
- Pas de rappel, pas de notification, pas de lien automatique avec le CRM (un lien entre notes écrit à la main reste possible).

## 4. Un événement

### 4.1 Ce qu'il porte

- **Titre** : obligatoire.
- **Mois** : obligatoire, de janvier à décembre.
- **Date ou intervalle de dates** :
  - jour : facultatif ;
  - année : facultative ;
  - fin : facultative, pour un événement sur plusieurs jours (un salon du 10 au 13) : un jour de fin, et un mois de fin s'il diffère du mois (du 30 janvier au 2 février). La fin n'a de sens qu'avec un jour de début : sans jour, elle est refusée.
  - L'événement est toujours rangé dans la case de son mois de début.
- **Pays** : facultatif, choisi dans la liste des pays (nom en français, filtré en tapant) ; montré par son drapeau.
- **Ville** : facultative, texte libre.
- **Étiquettes** : comme toute note, avec le champ d'étiquettes de l'application.
- **Texte** : le détail de l'événement, en Markdown, comme dans une note (budget, contacts, notes prises sur place…).

Une date impossible (31 février, 29 février d'une année non bissextile, fin avant le début) est refusée à la saisie avec un message.

### 4.2 Son écran

Un clic sur un événement dans la grille ouvre sa note dans la colonne active, comme une note. Au-dessus du texte, une bande montre ses champs (mois, jour, année, fin, pays, ville, étiquettes), modifiables d'un clic, et deux boutons : « Clore » (§ 7) et « Placer dans la corbeille ». Un lien « ← nom de l'agenda 12 » ramène à la grille.

## 5. La grille

### 5.1 Disposition

- 12 cases, de janvier à décembre, le nom du mois en tête de chaque case.
- **Bandeau du haut** : le titre de l'agenda 12, le choix du nombre de colonnes (3, 4 ou 6 : 4 lignes de 3, 3 lignes de 4 ou 2 lignes de 6), le filtre par étiquette (§ 5.4) et le lien « Archives » (§ 8).
- Le nombre de colonnes est gardé par agenda 12, d'un lancement à l'autre (4 à la création).
- Le mois en cours n'est pas mis en évidence.
- Une case trop pleine défile ; les cases d'une même ligne gardent la même hauteur.

### 5.2 Ordre dans une case

1. par année croissante (2026 avant 2029) ;
2. puis par jour croissant ; ceux sans jour après ceux qui en ont un, dans la même année ;
3. puis par titre (sans tenir compte des majuscules ni des accents).

Les événements sans année viennent en dernier, rangés de même par jour puis par titre.

### 5.3 Une ligne

Dans cet ordre, chaque partie absente disparaît avec son séparateur :

`date – drapeau (ville) – titre`

- **Date** : le jour et le mois (`12/02`), ou l'intervalle (`10–13/02`, `30/01 → 02/02`), suivi de l'année en pastille. Sans jour : la pastille de l'année seule. Sans année : le jour et le mois seuls.
- **Couleur de la pastille de l'année** (couleurs de la palette de l'application) :
  - année en cours : vert ;
  - année suivante : orange ;
  - années plus lointaines : marron ;
  - années passées : sans couleur (pastille neutre).
- **Drapeau** : celui du pays ; **ville** entre parenthèses après le drapeau (la ville seule, sans pays, est montrée entre parenthèses aussi).
- Exemples :
  - `10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World`
  - `[2029] – Renouveler malorean.fr`
  - `15/01 – Audit ISO`

Le rendu exact (pastille, tailles, séparateurs) se règle à la réalisation, dans le thème.

### 5.4 Filtre par étiquette

- Dans le bandeau : la liste des étiquettes portées par les événements de l'agenda 12 ; en choisir une ne montre que les événements qui la portent. « Toutes » retire le filtre.
- Le filtre n'est pas gardé : l'agenda 12 s'ouvre toujours sans filtre.

## 6. Créer

- **Un agenda 12** : « Agenda 12 » dans le menu de création (le chevron du « + » de la liste des notes) et dans la palette. Demande un titre, crée l'agenda 12 vide dans le dossier affiché et l'ouvre.
- **Un événement** : un « + » dans chaque case. Il crée l'événement « Sans titre » de ce mois et ouvre sa note, le curseur sur le titre.
- Pas de glisser-déposer d'un événement d'une case à l'autre : on change le mois dans la bande de l'événement.

## 7. Clore un événement

- Le bouton « Clore » est dans la note de l'événement.
- Une fenêtre demande : « Clore « titre » ? Il passe dans les archives. » avec trois choix :
  - **« Clore et préparer le suivant »** : clôt l'événement et crée sa copie ;
  - **« Clore »** : clôt sans copie ;
  - **« Annuler »**.
- **La copie** reprend le titre, le mois, le pays, la ville et les étiquettes ; elle n'a ni jour, ni année, ni fin, et son texte est vide. Exemple : on a fait le salon cette année, pris des notes, noté les dates ; la copie prépare le salon de l'an prochain sans en garder les détails.
- Après la clôture, la grille de l'agenda 12 s'ouvre ; la copie y est visible dans sa case.
- L'événement clos garde tout (champs et texte) et retient le jour de sa clôture.

## 8. Archives

- Le lien « Archives » du bandeau montre la liste des événements clos de l'agenda 12, du plus récemment clos au plus ancien, chacun avec sa ligne (§ 5.3) et son jour de clôture.
- Un clic ouvre sa note (en lecture et en écriture, comme tout événement).
- **« Rouvrir »** remet l'événement dans la grille, dans la case de son mois.
- Un événement clos peut aussi être placé dans la corbeille.

## 9. Supprimer

- « Placer dans la corbeille » sur un événement (ouvert ou clos) : confirmation, puis la note va à la corbeille ; la restaurer la remet dans son agenda 12 (dans la grille ou les archives, selon son état).
- Mettre l'agenda 12 à la corbeille y emporte tous ses événements, clos compris ; le restaurer les ramène.

## 10. Fichiers

Le format des fichiers (fichier de l'agenda 12, dossier des événements, sous-dossier `archives/`, noms de fichier, en-tête d'un événement, cohérence des dates, ce que l'application réécrit et garde) est décrit dans `doc/format/agenda-12.md`, seule description de ce format. Choix validés le 27/11 : clés de l'en-tête en français, jour, mois et année en champs séparés, pays par son code sur deux lettres, événements clos dans le sous-dossier `archives/`.

## 11. Outils pour les IA (MCP)

- `read_agenda_12` : les événements d'un agenda 12 (désigné par son chemin), case par case, dans l'ordre de la grille, avec leurs champs ; option pour y joindre les archives.
- `add_agenda_12_event` : crée un événement (titre, mois, et les champs facultatifs) ; mêmes refus qu'à l'écran.
- `close_agenda_12_event` : clôt un événement, avec ou sans copie.
- Le texte d'un événement se lit et s'écrit avec les outils des notes. Ceux qui changent un fichier sont retenus par le garde-fou du web. Documentés dans `doc/mcp/`.

## 12. Hors périmètre

- Rappels et notifications.
- Lien automatique avec le CRM ou avec un agenda externe (Calendrier du Mac, Google Agenda).
- Vue qui regroupe plusieurs agendas 12.
- Glisser-déposer d'un événement entre deux cases.
- Événements répétés automatiquement : la copie à la clôture en tient lieu.

## 13. Contrat du moteur

Ce que le moteur offre à l'interface (fiche 0104). Les commandes agissent sur l'espace de travail ouvert ; les arguments sont en camelCase ; une erreur est un objet `{ message }` dont le message est en français, prêt à afficher. Les types sont générés dans `ui/src/bridge/generated/` (`Agenda12Item`, `Agenda12CellItem`, `Agenda12EventItem`, `Agenda12LineItem`, `Agenda12EndItem`, `Agenda12EventDetailItem`, `Agenda12ClosedItem`, `Agenda12EventChangeItem`, `Agenda12ClosingItem`, `CountryItem`, `YearToneItem`). Les chemins sont ceux de l'espace de travail (`pro/salons.md`) ; un événement se désigne par le chemin de sa note.

### Types

- `Agenda12Item` : `{ title, columns, tags, cells, archives, unreadable }` : l'agenda 12 lu.
  - `title` : son titre (« Sans titre » s'il n'en a pas) ; `columns` : 3, 4 ou 6 (4 par défaut) ;
  - `tags` : les étiquettes portées par les événements de la grille (la liste du filtre, § 5.4), par ordre alphabétique, chacune une fois ; les archives n'y comptent pas ;
  - `cells` : toujours 12 `Agenda12CellItem`, de janvier à décembre ;
  - `archives` : les événements clos, du plus récemment clos au plus ancien (§ 8), jamais filtrés ;
  - `unreadable` : les chemins des événements illisibles (sans titre ou sans mois lisible), laissés de côté et signalés, jamais modifiés ni effacés.
- `Agenda12CellItem` : `{ month, name, events }` : `month` de 1 à 12, `name` en français et en minuscules (`février`), `events` dans l'ordre de la case (§ 5.2). Avec un filtre, seuls les événements qui portent l'étiquette.
- `Agenda12EventItem` : `{ path, title, month, day, year, end, country, city, tags, closedOn, line }` : un événement.
  - `month` : le mois de début, de 1 à 12 ; `day`, `year`, `end`, `country`, `city` : `null` s'ils sont absents ; `tags` : liste, éventuellement vide ;
  - `end` : `Agenda12EndItem` `{ day, month }`, `month` étant le mois du début quand la fin tombe le même mois ; une fin le jour du début n'existe pas (`null`) ;
  - `country` : `CountryItem` `{ code, name, flag }` (`DE`, `Allemagne`, `🇩🇪`) ;
  - `closedOn` : `2026-11-27`, le jour de la clôture ; `null` pour un événement ouvert ou clos sans avoir retenu son jour ;
  - `line` : `Agenda12LineItem`.
- `Agenda12LineItem` : `{ date, year, yearTone, flag, city, title, text }` : la ligne de § 5.3 en parties, à mettre en forme et à colorer par l'écran.
  - `date` : `12/02`, `10–13/02` (tiret demi-cadratin) ou `30/01 → 02/02`, `null` sans jour ; `year` : à montrer en pastille ; `flag` : le drapeau, `city` : à montrer entre parenthèses ;
  - `yearTone` : `YearToneItem`, `"current"` (année en cours, vert), `"next"` (suivante, orange), `"later"` (plus lointaine, marron) ou `"past"` (passée, neutre), d'après le jour du Mac ; `null` sans année ;
  - `text` : la ligne entière en texte (`10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World`), si l'écran n'a pas besoin des parties.
- `Agenda12EventDetailItem` : `{ agenda, agendaTitle, closed, event }` : l'événement d'une note pour sa bande (§ 4.2) : le chemin et le titre de son agenda 12 (le lien « ← … »), s'il est clos (dans `archives/`), et son `Agenda12EventItem`.
- `Agenda12ClosedItem` : `{ closed, successor }` : le chemin de l'événement dans les archives, et celui de la copie (`null` sans copie).
- `Agenda12EventChangeItem` : un geste, objet à champ `kind` :
  - `{ kind: "title", title }`, `{ kind: "month", month }` (1 à 12), `{ kind: "day", day }` (`null` pour l'effacer), `{ kind: "year", year }` (`null` pour l'effacer), `{ kind: "end", end }` (`{ day, month }`, ou `null` pour l'effacer), `{ kind: "country", country }` (code ISO sur deux lettres, ou `null`), `{ kind: "city", city }` (`null` ou vide pour l'effacer), `{ kind: "tags", tags }` (toutes les étiquettes ; vide pour les retirer).
- `Agenda12ClosingItem` : `"alone"` (« Clore ») ou `"withSuccessor"` (« Clore et préparer le suivant »).

### Commandes

- `create_agenda_12({ folder, title })` → `{ path }` : crée l'agenda 12 titré `title` dans `folder` (`""` pour la racine), sous le nom tiré du titre (suffixe `-2`… si pris) ; il naît sans événement et sans dossier. L'interface l'ouvre avec le chemin rendu. Erreurs : « Le titre est vide. », « Le titre tient sur une seule ligne. » ; dossier invalide ou absent.
- `read_agenda_12({ path, tag })` → `Agenda12Item` : la grille, les archives et la liste du filtre. `tag` : une étiquette (`null` : « Toutes »). Le filtre n'est pas gardé (§ 5.4). À appeler à l'ouverture et à chaque changement venu du disque. Erreurs : « cette note n'est pas un agenda 12 » ; « la note « … » n'existe pas ».
- `change_agenda_12_columns({ path, columns })` → rien : garde 3, 4 ou 6 dans l'agenda 12 (clé `colonnes`, § 5.1) ; rien n'est écrit si le nombre est déjà celui-là. Erreurs : « « 5 » colonnes : la grille a 3, 4 ou 6 colonnes. » ; « cette note n'est pas un agenda 12 ».
- `create_agenda_12_event({ agenda, month })` → `{ path }` : le « + » d'une case (§ 6) : crée l'événement « Sans titre » du mois `month` (1 à 12), sous le nom `sans-titre.md` (suffixe `-2`… si pris), et rend le chemin de sa note, que l'interface ouvre, le curseur sur le titre. Le dossier des événements naît avec le premier. Erreurs : « « 13 » n'est pas un mois : un nombre de 1 (janvier) à 12 (décembre) est attendu. » ; « cette note n'est pas un agenda 12 ».
- `read_agenda_12_event({ path })` → `Agenda12EventDetailItem` : la bande d'un événement, ouvert ou clos. À appeler à l'ouverture de sa note et après chaque geste ou changement venu du disque. Erreurs : « Cet événement n'existe plus. » ; « cette note n'est pas un événement d'un agenda 12 » (une note ordinaire, ou un événement sans note d'agenda 12 à côté de son dossier) ; « Cet événement n'a pas de titre. » ; « Cet événement n'a pas de mois lisible. ».
- `change_agenda_12_event({ path, change })` → rien : un geste de la bande (§ 4.2), sur la version la plus récente du fichier ; seule la clé touchée est réécrite, le texte et le reste de l'en-tête restent identiques ; un geste qui ne change rien n'écrit rien. Vaut pour un événement ouvert ou clos. Après un geste de mois, la case change : relire la grille. Erreurs :
  - date (§ 4.1, message à montrer tel quel dans la bande) : « Ce jour n'existe pas dans ce mois. » (31 février, 29 février d'une année non bissextile, y compris après un changement de mois ou d'année), « La fin exige un jour de début. » (fin donnée sans jour, ou jour effacé alors qu'une fin existe : effacer la fin d'abord), « La fin est avant le début. », « L'année doit être comprise entre 1 et 9999. » ;
  - « Le titre est vide. », « Le titre tient sur une seule ligne. » ;
  - « « 13 » n'est pas un mois : … » ; « « ZZ » n'est pas un pays connu : un code sur deux lettres (FR, DE, US…) est attendu. » ;
  - « Cet événement n'existe plus. », « cette note n'est pas un événement d'un agenda 12 ».
  - Changer le titre ne change jamais le nom du fichier. Changer le mois d'un événement dont la fin tombe le même mois déplace la fin avec lui.
- `close_agenda_12_event({ path, closing })` → `Agenda12ClosedItem` : « Clore » ou « Clore et préparer le suivant » (§ 7). L'événement retient le jour de sa clôture (jour du Mac) et passe dans `archives/` ; avec `"withSuccessor"`, la copie (titre, mois, pays, ville, étiquettes ; ni jour, ni année, ni fin, ni texte) naît dans la grille. L'interface ouvre ensuite la grille (`read_agenda_12`). Les onglets ouverts sur l'événement suivent son nouveau chemin (`closed`). Erreurs : « Cet événement est déjà clos. », « Cet événement n'existe plus. », « cette note n'est pas un événement d'un agenda 12 ».
- `reopen_agenda_12_event({ path })` → `{ path }` : « Rouvrir » (§ 8) : l'événement perd son jour de clôture et revient dans la grille, dans la case de son mois ; son nom de fichier prend un suffixe (`-2`…) si le nom est déjà pris dans le dossier des événements. Rend son nouveau chemin. Erreurs : « Cet événement n'est pas clos. », « Cet événement n'existe plus. ».
- `delete_agenda_12_event({ path })` → chemin dans la corbeille (texte) : « Placer dans la corbeille » (§ 9), après la confirmation de l'écran ; vaut pour un événement ouvert ou clos, même illisible ; restauré, il revient dans la grille ou dans les archives selon son état. Équivalent de `trash_note` avec la vérification du type. Erreurs : « Cet événement n'existe plus. », « cette note n'est pas un événement d'un agenda 12 ».
- `list_countries()` → `CountryItem[]` : les 249 pays de la norme, rangés par nom en français sans compter les accents ni les majuscules (`Afghanistan`, `Afrique du Sud`, `Albanie`…) : la liste où l'on choisit (§ 4.1), filtrée en tapant par l'écran. Ne dépend pas de l'espace de travail ; ne rend jamais d'erreur.
- Commandes existantes qui valent pour l'agenda 12 : `trash_note`, `move_note`, `rename_note`, `restore_note` (un agenda 12 emporte ses événements, archives comprises) ; `crm_fiches_in_trash({ path })` rend le nombre d'événements (ouverts et clos) qui partent avec un agenda 12 (le nom de la commande dit « fiches » : c'est la même règle) ; `read_note` et `save_note` pour le texte d'un événement (l'enregistrement ne renomme jamais le fichier d'un événement) ; `add_favorite` pour un agenda 12 entier (un événement n'a pas d'étoile : « Un événement d'un agenda 12 n'a pas d'étoile : seul l'agenda 12 entier se met en favori. ») ; `list_backlinks` (un lien entrant venu d'un événement porte `contentType: "agenda12Event"` et `agenda`, le chemin de son agenda 12 ; venu d'un agenda 12, `contentType: "agenda12"`).

### Types de contenu et recherche

- `ContentTypeItem` compte deux valeurs de plus : `"agenda12"` (l'agenda 12) et `"agenda12Event"` (l'événement). `read_note` d'un agenda 12 rend sa note comme toute note ; l'écran de la grille se choisit sur `contentType === "agenda12"`, la bande d'un événement sur `"agenda12Event"`.
- Un résultat de recherche d'un événement a `contentType: "agenda12Event"`, `container` (le chemin de son agenda 12) et `containerTitle` (son titre) ; un événement est cherché par son texte, sa ville, le nom de son pays et ses étiquettes, jamais par ses propriétés techniques (mois, jour, année, fin, jour de clôture).

### Événements

Aucun événement nouveau. Un changement de fichier (écran, IA, éditeur extérieur) est annoncé par l'événement existant `workspace-changed` (`WorkspaceChanged.notes`, environ 300 ms après l'écriture) ; une clôture annonce le fichier d'archives et celui de la copie. L'écran de la grille relit `read_agenda_12` quand un chemin annoncé est celui de son agenda 12 ou se trouve dans son dossier des événements (`salons/…` pour `salons.md`, archives comprises) ; la bande d'un événement relit `read_agenda_12_event` quand son chemin est annoncé. Après un geste de l'écran, il rafraîchit seul sans attendre l'événement.

### Règles que l'interface n'a pas à connaître

- Le format des fichiers, les noms de fichier, l'ordre d'une case, le calcul de la ligne et de la couleur de l'année, la validité des dates, le nom que prend une copie ou un événement rouvert, le suivi du dossier des événements par le renommage, le déplacement et la corbeille de l'agenda 12 : tout est dans le moteur.
- Le dossier des événements n'est pas dans la liste des dossiers (`list_folders`, dossier affiché) tant qu'il ne contient que des événements.
- Les outils pour les IA (§ 11) passent par les mêmes cas d'usage que ces commandes.

