# Agenda 12

Spécification fonctionnelle rédigée le 27/11, **validée par l'utilisateur le 27/11** (demande de développement) ; **présentation de l'écran d'un événement et de la grille refaite le 28/11 à la demande de l'utilisateur** (§§ 4.2, 5.1, 5.3, 7 et 14) : seuls l'organisation et l'aspect changent, aucun champ, contrôle ni état. **La vue liste (§ 5.5) a été ajoutée le 28/11** à la demande de l'utilisateur. **Les champs de la date de la bande (§§ 4.3 et 4.4 : liste des années, sélecteur de jour, cohérence de la fin) ont été refaits le 28/11** à la demande de l'utilisateur. Ce document se lit seul.

## 1. Idée

Un agenda classique est mal fait pour les événements qu'on situe d'abord par leur mois : le salon professionnel de février, le renouvellement des noms de domaine du site en février dans trois ans, l'audit ISO de janvier. Posés sur un jour précis, on les oublie si l'on rate ce jour ; posés sur plusieurs jours, ils encombrent l'agenda. Et l'agenda ne donne pas de vue d'ensemble : quels salons cette année (budget à prévoir, pas de congés sur ces dates), où en sont les renouvellements de domaines, l'audit est-il dans deux mois.

L'**agenda 12** est un nouveau type de contenu, à côté de la note, du cahier de recherche, de la carte mentale, du canvas et du CRM : une grille de 12 cases, une par mois, de janvier à décembre, où chaque événement est rangé dans son mois. Le jour et l'année sont facultatifs. Chaque événement est une note, où l'on écrit tout son détail.

## 2. Vocabulaire

- **Agenda 12** : le contenu, une note de type `agenda-12` montrée en grille de 12 mois. Un espace de travail en a autant qu'on veut (un pour les salons, un pour les domaines…), indépendants.
- **Événement** : une note rangée dans le dossier d'un agenda 12 ; elle a au moins un titre et un mois.
- **Case** : la place d'un mois dans la grille ; elle liste les événements de ce mois.
- **Clore** : sortir un événement de la grille en le rangeant dans les archives de son agenda 12.
- **Archives** : les événements clos d'un agenda 12.
- **Vue grille**, **vue liste** : les deux façons de montrer les événements d'un agenda 12 : la grille de 12 cases, ou une liste groupée par mois (§ 5.5).

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

Un clic sur un événement dans la grille ouvre sa note dans la colonne active, comme une note. Au-dessus du texte, la bande de l'événement (refonte du design du 28/11, à la demande de l'utilisateur) a une vraie hiérarchie, de haut en bas :

1. **Une ligne d'en-tête** : le lien « ← nom de l'agenda 12 » à gauche, le **résumé** de l'événement (« 5 – 11 octobre 2026 · Lisbonne, Portugal », calculé à l'écran, jamais écrit), l'état « Clos le 27/11/2026 » en pastille quand l'événement est clos, et à droite les actions, en boutons : « Clore » (bouton plein **orange**, la couleur d'avertissement du thème, en clair et en sombre, texte du thème sur l'orange avec un contraste d'au moins 4,5 ; au survol l'orange s'assombrit ou s'éclaircit, au focus un contour orange l'entoure ; ce n'est pas l'action principale de l'application, mais une action secondaire qui range l'événement hors de la grille ; « Rouvrir » s'il est clos : bouton à bordure neutre, sans couleur) et « Placer dans la corbeille » (action discrète et destructrice, icône seule dont le nom est dit au survol et aux lecteurs d'écran ; grise au repos, rouge de danger du thème au survol et au focus). En colonne étroite, le résumé passe sur sa propre ligne sous le retour et les actions.
2. **Le titre**, en grand : un champ sans cadre qui se lit comme un titre ; son cadre paraît au survol et au focus.
3. **Quand** : le jour (sélecteur de jour), le mois et l'année (liste des années) du début, puis « au », le jour (sélecteur de jour) et le mois de la fin (grisé sans jour de fin). Les champs se lisent comme une date, dans l'ordre où on la dit ; leur détail est aux §§ 4.3 et 4.4.
4. **Où** : le pays (champ où l'on tape pour filtrer la liste, drapeau et nom, « × » pour le retirer) et la ville, côte à côte ; en colonne étroite, l'un sous l'autre à pleine largeur, jamais un champ seul sur sa ligne.

Chaque champ a son nom, petit et discret au-dessus de lui ; « Quand » et « Où » sont à gauche des champs quand la colonne est large, au-dessus quand elle est étroite (une colonne d'au moins 420 points tient sans débordement). Les étiquettes se règlent dans le champ d'étiquettes de la colonne, sous les onglets.

Maquette (colonne large) :

```
← Salons             5 – 11 octobre 2026 · Lisbonne, Portugal     [ Clore ]  🗑
WebSubmit                                                   (titre en grand)

Quand   Jour  Mois        Année        Jour  Mois
        [ 5 ▾] [Octobre ▾] [2026 ▾]  au [11 ▾] [Octobre ▾]
Où      Pays                    Ville
        [🇵🇹 Portugal       × ] [Lisbonne            ]
───────────────────────────────────────────────────────────────
[▸ Propriétés]                                   (texte de la note)
# WebSubmit
```

Maquette (colonne étroite, 420 points) :

```
← Salons                        [ Clore ]  🗑
5 – 11 octobre 2026 · Lisbonne, Portugal
WebSubmit
Quand
  Jour  Mois         Année
  [ 5 ▾] [Octobre ▾] [2026 ▾]
  au  Jour  Mois
      [11 ▾] [Octobre ▾]
Où
  Pays                     Ville
  [🇵🇹 Portugal     × ]    [Lisbonne      ]
```

**L'en-tête technique de la note** (`type`, `mois`, `jour`, `annee`, `jour-fin`, `pays`, `ville`…), que la bande édite déjà, n'occupe plus la tête de la page : dans l'éditeur, il est **replié sur une ligne « Propriétés »** (« ▸ Propriétés ») qu'un clic déplie (« ▾ Propriétés ») ; déplié, il se modifie comme du texte. Le fichier ne change jamais, seul l'affichage est replié. Replié, il est protégé : une frappe ou un remplacement qui l'atteindrait est refusé (le curseur ne s'y arrête pas) ; la bande, elle, le réécrit. Ne vaut que pour les événements d'un agenda 12 ; les autres notes montrent leur en-tête comme avant. Une note qu'on rouvre s'ouvre repliée.

### 4.3 Les champs de la date (refonte du 28/11)

**Liste des années.** Le champ « Année » est une liste déroulante, pas un champ où l'on écrit : un choix vide « — » (l'année est facultative), puis l'année en cours et les 10 suivantes, soit 11 années (en 2026 : 2026 à 2036). L'année en cours est celle de l'horloge du Mac. Un événement dont l'année écrite est hors de cette plage (une année passée, ou plus lointaine que dix ans) la garde : elle est ajoutée à la liste, à sa place dans l'ordre, et reste choisie ; l'écran ne la remplace pas et ne la réécrit pas.

**Sélecteur de jour.** Les champs « Jour » (début) et « Fin : jour » sont un **sélecteur de jour**, le même composant pour les deux : un bouton-champ qui montre le jour choisi (« — » sans jour) et ouvre, ancrée sous lui, une petite fenêtre flottante avec une grille de boutons, au lieu d'une liste de 31 lignes. Maquette de la fenêtre (le jour 13 est choisi ; le 31 et « Aucun jour » sont sur la 4e ligne) :

```
┌──────────────────────────────────────────┐
│   1   2   3   4   5   6   7   8   9  10  │
│  11  12 [13] 14  15  16  17  18  19  20  │
│  21  22  23  24  25  26  27  28  29  30  │
│  31 [ Aucun jour                       ] │
└──────────────────────────────────────────┘
```

- **Grille** : 4 lignes, 3 de 10 jours (1 à 10, 11 à 20, 21 à 30) puis le 31 et le bouton « Aucun jour » (le jour est facultatif : il l'efface). Cases carrées, toutes de même taille et alignées en colonnes ; rayons, ombre et couleurs du thème (clair et sombre). Le jour choisi est plein, à la couleur d'accent du thème.
- **Jours impossibles** : grisés, sans effet au clic comme au clavier. Un jour n'existe pas au-delà du nombre de jours de son mois (pas de 31 avril ni de 31 février) ; le 29 février n'existe pas dans une année non bissextile **quand l'année est connue**, et existe sans année (§ 4.1). Pour la fin, le jour tombe dans l'année du début, ou la suivante quand la fin passe l'année (§ 4.4).
- **Ouverture** : un clic sur le champ, ou Entrée, Espace ou la flèche du bas quand il a le curseur. Le curseur va sur le jour choisi (ou sur le premier jour possible).
- **Clavier** : flèches gauche et droite d'un jour possible à l'autre, haut et bas d'une ligne (10 jours) ; Début et Fin vont au premier et au dernier jour possible ; Entrée ou Espace choisit ; Échap ferme et rend le curseur au champ ; Tab ferme et passe au champ suivant. Un clic à côté ferme aussi la fenêtre.
- **Place** : la fenêtre s'ouvre sous le champ, ou au-dessus s'il n'y a pas la place ; elle ne déborde ni de la fenêtre de l'application ni de la colonne, y compris étroite (420 points), où elle se replace et se rétrécit.
- **Nom pour les lecteurs d'écran** : le champ garde son nom (« Jour », « Fin : jour ») et dit sa valeur ; la fenêtre s'appelle « Choisir le jour » (« Choisir le jour de fin »), chaque jour porte son nombre.

### 4.4 La cohérence de la fin avec le début

Le moteur refuse une fin avant le début (§ 4.1) ; l'écran empêche d'y arriver, sans corriger en silence ce qu'il reçoit.

- **Une fin dans un mois antérieur au mois du début tombe l'année suivante** (du 30 décembre au 2 janvier, `doc/format/agenda-12.md` § 6.2) : c'est valide, pas une erreur. L'écran ne grise donc pas les mois de fin antérieurs au mois du début ; il dit en petit sous le champ de fin « Fin l'année suivante. » quand c'est le cas, pour qu'une fin choisie par erreur se voie. Avec une année, le résumé donne les deux années (« 13 septembre 2026 – 23 juin 2027 »). Il n'y a pas d'année de fin : la fin partage l'année du début, ou la suivante dans ce cas.
- **Jours de fin grisés** : quand le mois de fin est le mois du début, les jours de fin antérieurs au jour de début sont grisés dans le sélecteur ; le jour de début lui-même reste permis (l'événement tient alors sur un jour et la fin est effacée, § 4.1). Un début sans jour n'a rien à comparer : le moteur refuse alors toute fin (« La fin exige un jour de début. »).
- **Changer le début au-delà de la fin** : quand l'utilisateur change le jour, le mois ou l'année du début de façon que la fin déjà saisie passe avant lui (même mois et jour de fin plus petit ; fin dans un mois antérieur alors qu'elle ne l'était pas avant le geste ; jour de fin qui n'existe plus), la fin est ramenée au début, c'est-à-dire effacée (l'événement tient sur le jour du début), avant que le début change, et un message bref le dit : « La fin a été ramenée au début. ». Une fin qui tombait déjà l'année suivante n'est pas touchée quand le changement la laisse valide.
- **Valeur incohérente reçue** : si l'écran reçoit une fin avant le début (fichier modifié à la main, à condition que le moteur la rende), il ne la corrige pas : il la montre avec un état d'erreur discret sur le champ de fin (bordure d'erreur du thème, texte d'aide « La fin est avant le début. »), sans réécrire le fichier. Aujourd'hui le moteur ignore à la lecture une fin incohérente (`doc/format/agenda-12.md` § 6.2) : l'événement se montre alors sans fin, et cet état ne sert que si le moteur rend un jour une telle fin.
- **Cas limites** : même jour, même mois : permis (fin effacée) ; même mois et jour de fin plus petit : grisé ; début sans jour : seuls les mois se comparent, et le moteur refuse la fin ; fin sans mois écrit : elle tombe le mois du début et le suit quand on change ce mois ; mois de début changé après la fin : la fin est ramenée au début si elle passe avant.

## 5. La grille

### 5.1 Disposition

- 12 cases, de janvier à décembre, le nom du mois en tête de chaque case.
- **Bandeau du haut** : le titre de l'agenda 12 en grand, puis les outils groupés comme les pilules de la barre d'outils de l'application : le choix de la vue (grille ou liste, § 5.5) en pilule, le choix du nombre de colonnes (3, 4 ou 6 : 4 lignes de 3, 3 lignes de 4 ou 2 lignes de 6) en pilule, le filtre par étiquette (§ 5.4) et le bouton « Archives » (§ 8). En colonne étroite, les outils passent sous le titre.
- Le nombre de colonnes est gardé par agenda 12, d'un lancement à l'autre (4 à la création) ; il ne vaut que pour la vue grille, et son choix n'est montré que dans cette vue.
- Le mois en cours n'est pas mis en évidence.
- Une case trop pleine défile ; les cases d'une même ligne gardent la même hauteur minimale, et le nom du mois est à la même place dans toutes. Une case a son « + » à droite du nom du mois ; **une case vide** montre à la place, dans tout son corps, un grand « + » discret entouré d'un pointillé (le même bouton « Ajouter un événement en … »).

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

Le rendu exact (pastille, tailles, séparateurs) se règle à la réalisation, dans le thème. À l'écran (refonte du 28/11), la ligne se lit en deux rangs alignés à gauche : en légende (petite, discrète) la date, sa pastille d'année et le lieu (drapeau et ville), puis dessous le titre, plus lisible ; l'espace entre les parties remplace le « – », qui reste dans le texte de la ligne (copie, lecture d'écran, info-bulle). Une ligne sans date ni lieu est son titre seul. Rien ne dépasse d'une case étroite : les parties passent à la ligne.

### 5.4 Filtre par étiquette

- Dans le bandeau : la liste des étiquettes portées par les événements de l'agenda 12 ; en choisir une ne montre que les événements qui la portent. « Toutes » retire le filtre.
- Le filtre n'est pas gardé : l'agenda 12 s'ouvre toujours sans filtre.

### 5.5 La vue liste

L'agenda 12 se montre au choix en **vue grille** (§§ 5.1 à 5.4) ou en **vue liste**. Un bouton du bandeau, une pilule à deux positions du même style que le choix des colonnes, passe de l'une à l'autre : « Grille » et « Liste », celle qui est montrée est enfoncée ; bulle d'aide « Vue grille » et « Vue liste ». Le choix est gardé par agenda 12, d'un lancement à l'autre, comme le nombre de colonnes (grille à la création). Le filtre par étiquette (§ 5.4) et le bouton « Archives » (§ 8) valent dans les deux vues ; le choix des colonnes n'a de sens que pour la grille et disparaît en vue liste. Dans les archives, le choix de la vue est caché, et le bouton qui ramène (« Archives » devient « Grille » ou « Liste ») porte le nom de la vue gardée.

Contenu :

- **Un titre de mois** par mois, de janvier à décembre (toujours dans cet ordre), en hiérarchie nette : le nom du mois en titre, un filet sous lui, puis ses événements.
- **Une ligne par événement**, sans puce, dans l'ordre d'une case (§ 5.2 : année, jour, titre). C'est la même ligne que celle de la grille (§ 5.3), construite par la même fonction : `date année – drapeau (ville) – titre`, par exemple `05–11/10 2026 – 🇵🇹 (Lisbonne) – WebSubmit` ; chaque partie absente disparaît avec son séparateur.
- **Un clic sur une ligne** ouvre l'événement, comme dans la grille.
- **Un mois sans événement** garde son titre, discret, avec le même « + » que l'en-tête d'une case de la grille (« Ajouter un événement en février », mêmes effet et curseur sur le titre, § 6) : c'est le plus cohérent avec la grille, où chaque mois a son « + », et chaque action garde ainsi un contrôle visible. Un mois qui a des événements a son « + » à droite de son titre, comme une case pleine.

Aspect (valeurs du thème seulement) : la page défile ; les lignes sont **alignées en colonnes d'un mois à l'autre** : la date et sa pastille d'année dans une colonne de largeur commune à toute la liste, puis le lieu (drapeau et ville), puis le titre, qui prend le reste ; une partie absente laisse sa colonne vide, jamais le titre ne glisse. La date, la pastille d'année et le lieu sont discrets (petit corps, couleur atténuée), le titre est lisible. Au survol et au focus clavier, la ligne se teinte. En colonne étroite (moins de 36 rem), une ligne passe sur deux rangs, alignés à gauche, comme dans la grille : la date, sa pastille et le lieu en légende, le titre dessous ; rien ne dépasse. Le texte de la ligne (avec ses « – ») reste celui de la bulle et de la lecture d'écran.

Maquette (colonne large) :

```
Salons                                   [Grille|Liste]  [Toutes ▾]  [Archives]

Janvier                                                                      +
────────────────────────────────────────────────────────────────────────────
15/01 [2027]                                 Audit ISO

Février                                                                      +
────────────────────────────────────────────────────────────────────────────
10–13/02 [2027]    🇩🇪 (Nuremberg)           Salon Embedded World
[2029]                                       Renouveler malorean.fr

Mars                                                                         +
Avril                                                                        +
```

Maquette (colonne étroite) :

```
Octobre                       +
─────────────────────────────
05–11/10 [2026]  🇵🇹 (Lisbonne)
WebSubmit
```

## 6. Créer

- **Un agenda 12** : « Agenda 12 » dans le menu de création (le chevron du « + » de la liste des notes) et dans la palette. Demande un titre, crée l'agenda 12 vide dans le dossier affiché et l'ouvre.
- **Un événement** : un « + » dans chaque case. Il crée l'événement « Sans titre » de ce mois et ouvre sa note, le curseur sur le titre.
- Pas de glisser-déposer d'un événement d'une case à l'autre : on change le mois dans la bande de l'événement.

## 7. Clore un événement

- Le bouton « Clore » est dans la note de l'événement.
- Une fenêtre (mêmes règles de design que les autres fenêtres de l'application : coins, boutons de 36 points, espacements du thème) demande : « Clore « titre » ? Il passe dans les archives. » avec trois choix, l'un sous l'autre à la largeur de la fenêtre, les deux façons de clore en haut, du même orange que le bouton « Clore » de la bande (un seul style pour l'action de clore, partout) et « Annuler » neutre, à bordure :
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
- Glisser-déposer d'un événement entre deux cases (ni entre deux mois de la vue liste).
- Événements répétés automatiquement : la copie à la clôture en tient lieu.

## 13. Contrat du moteur

Ce que le moteur offre à l'interface (fiche 0104). Les commandes agissent sur l'espace de travail ouvert ; les arguments sont en camelCase ; une erreur est un objet `{ message }` dont le message est en français, prêt à afficher. Les types sont générés dans `ui/src/bridge/generated/` (`Agenda12Item`, `Agenda12CellItem`, `Agenda12EventItem`, `Agenda12LineItem`, `Agenda12EndItem`, `Agenda12EventDetailItem`, `Agenda12ClosedItem`, `Agenda12EventChangeItem`, `Agenda12ClosingItem`, `Agenda12LayoutItem`, `CountryItem`, `YearToneItem`). Les chemins sont ceux de l'espace de travail (`pro/salons.md`) ; un événement se désigne par le chemin de sa note.

### Types

- `Agenda12Item` : `{ title, columns, layout, tags, cells, archives, unreadable }` : l'agenda 12 lu.
  - `title` : son titre (« Sans titre » s'il n'en a pas) ; `columns` : 3, 4 ou 6 (4 par défaut) ; `layout` : `Agenda12LayoutItem`, `"grid"` (par défaut) ou `"list"`, la vue gardée (§ 5.5) ; la vue liste se dessine avec les mêmes `cells` ;
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
- `change_agenda_12_layout({ path, layout })` → rien : garde la vue dans l'agenda 12 (clé `vue`, § 5.5) ; `layout` : `"grid"` ou `"list"` ; rien n'est écrit si c'est déjà la vue gardée. Une autre valeur est refusée par la désérialisation de l'argument. Erreur : « cette note n'est pas un agenda 12 ».
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

## 14. Interface réalisée

- **Création** : « Agenda 12 » dans le menu de création (le chevron du « + »), « Nouvel agenda 12 » dans le clic droit sur un dossier (et sur la racine), dans le menu Fichier (« Nouvel agenda 12… ») et dans la palette. Un titre vide est redemandé, Échap annule ; l'agenda 12 s'ouvre dans la colonne active.
- **Grille** : elle prend la place de l'éditeur dans la colonne. Bandeau : titre en grand, puis les outils groupés : pilule « 3 », « 4 », « 6 » (le nombre gardé est enfoncé), liste « Toutes » / étiquettes en pilule, bouton « Archives » (qui devient « Grille »). 12 cases dont les lignes sont celles du moteur, dans son ordre ; une case trop pleine défile, les cases d'une ligne gardent la même hauteur. La ligne est un bouton : `date année – drapeau (ville) – titre`, la pastille de l'année prend ses couleurs dans la palette du thème (vert, orange, marron, neutre). Un événement illisible est signalé au-dessus de la grille (un clic ouvre sa note). La grille se relit après chacun de ses gestes et à chaque changement du disque qui touche l'agenda 12 ou son dossier des événements.
- **Vue liste** : une pilule « Grille » / « Liste » du bandeau (bulle d'aide « Vue grille », « Vue liste », celle qui est montrée est enfoncée) ; en vue liste, le choix des colonnes est caché. La liste reprend les 12 cases du moteur : titre de mois (le « + » à sa droite, même pour un mois vide), lignes alignées en trois colonnes (date et année, lieu, titre) par une grille CSS commune à toute la liste, deux rangs en colonne étroite (§ 5.5). Le choix est gardé dans la note (`change_agenda_12_layout`).
- **Créer un événement** : le « + » de la case (« Ajouter un événement en février ») crée l'événement « Sans titre » du mois et l'ouvre, le curseur sur son titre, sélectionné.
- **Écran d'un événement** : la bande au-dessus de la note, organisée comme au § 4.2 (en-tête avec retour, résumé, état et actions ; titre en grand ; groupes « Quand » et « Où »). Champs : Titre, Jour (sélecteur de jour), Mois (liste), Année (liste des années), puis « au » Fin : jour (sélecteur de jour) et Fin : mois (grisé sans jour de fin), Pays (champ où l'on tape pour filtrer les 249 pays, drapeau et nom ; « × » pour le retirer), Ville. L'en-tête technique de la note est replié sur « Propriétés » dans l'éditeur. Le jour se choisit dans le sélecteur de jour, l'année dans la liste des années, la cohérence de la fin est gardée par l'écran (§§ 4.3 et 4.4) ; un champ de texte se valide en le quittant ou par Entrée ; le texte tapé dans la note est enregistré avant chaque geste, la note relue après. Un refus du moteur (« Ce jour n'existe pas dans ce mois. »…) est dit tel quel dans la bande et le champ reprend ce qui est écrit . Les étiquettes se règlent dans le champ d'étiquettes de la colonne, sous les onglets, comme pour toute note. Pas de sélecteur de date (calendrier) : jour, mois et année sont des champs séparés (§§ 4.1 et 4.3).
- **Clore** : la fenêtre « Clore « titre » ? Il passe dans les archives. » avec « Clore et préparer le suivant » (bouton plein orange, en haut), « Clore » (même orange) et « Annuler » (neutre), l'un sous l'autre ; ensuite la grille s'ouvre. **Rouvrir** : dans la bande d'un événement clos (état « Clos le 27/11/2026 » en pastille, sa note reste modifiable) et dans les archives ; depuis la bande la note rouverte s'ouvre sous son nouveau chemin, depuis les archives la liste est relue.
- **Corbeille** : « Placer dans la corbeille » de la bande (icône seule) demande confirmation (« Placer « titre » dans la corbeille ? », « Annuler » refuse), puis l'agenda 12 s'ouvre ; le message de retour et la restauration sont ceux des autres notes (écran Corbeille).
- **Étoile** : sur l'agenda 12 comme sur toute note ; cachée sur un événement (seul l'agenda 12 entier se met en favori).
- Chaque action a un bouton visible ; rien ne dépend d'un raccourci ni d'un glisser. Pas de glisser-déposer entre cases (§ 12).
