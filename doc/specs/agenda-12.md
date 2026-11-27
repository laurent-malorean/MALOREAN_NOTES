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
