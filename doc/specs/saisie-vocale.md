# Saisie vocale

Spécification fonctionnelle rédigée et **validée par l'utilisateur le 27/11**. Ce document se lit seul.

## 1. Idée

Un petit micro dans la bande du haut. L'utilisateur clique, parle, et son texte s'écrit tout seul à l'endroit du curseur : d'abord provisoire, en grisé, puis fixé phrase par phrase quand le moteur est sûr de lui. Rien ne sort du Mac : le moteur de transcription est celui d'Apple (SpeechAnalyzer), sans connexion ni coût.

## 2. Vocabulaire

- **Saisie vocale** : la fonction, et l'état « le Mac écoute et écrit ».
- **Micro** : le bouton de la bande du haut qui démarre et arrête la saisie vocale.
- **Texte provisoire** : le texte que le moteur propose encore de corriger ; grisé, il n'est pas dans la note.
- **Texte fixé** : le texte que le moteur ne corrigera plus ; il entre dans la note, comme si l'utilisateur l'avait tapé.

Ces mots entrent dans `doc/ontology.md` avant le code.

## 3. Décisions déjà prises

- Moteur : SpeechAnalyzer d'Apple, sur le Mac. Pas la dictée intégrée de macOS (trop lente).
- macOS 26 minimum. Sur un macOS plus ancien, le micro est grisé et son info-bulle dit « Saisie vocale : macOS 26 minimum ». Pas de moteur de repli.
- Plus tard, en option : relecture par Whisper en fin de dictée pour les termes techniques (hors de cette spécification, § 11).

## 4. Le micro

- Dans la bande du haut, avec les boutons de mise en forme, avant le sélecteur de date. Même taille et même survol que les boutons voisins.
- Visible quand le contenu ouvert a un éditeur de texte ou la zone de saisie d'un cahier de recherche (§ 6) ; grisé sinon, avec l'info-bulle « Saisie vocale : ouvrez une note ».
- Trois états :
  - **repos** : icône de micro ; info-bulle « Saisie vocale » et le raccourci ;
  - **écoute** : icône pleine, rouge, avec un petit témoin de niveau sonore qui bouge avec la voix ; info-bulle « Arrêter la saisie vocale » ; `aria-pressed` vrai ;
  - **indisponible** : grisé (macOS trop ancien, accès refusé, § 8), avec l'info-bulle qui dit pourquoi.
- Raccourci : **Ctrl + Maj + D** par défaut, choisissable dans les réglages (§ 14) : une combinaison, une touche de fonction seule (F1 à F12) ou une **touche de modificateur seule** (⌘, ⌥, ⌃ ou ⇧, à gauche ou à droite, déclenchée au tapotement). Même effet que le clic. Il est vérifié contre les raccourcis existants avant d'être posé.

## 5. Ce qui se passe quand on parle

1. Un clic sur le micro (ou le raccourci) démarre l'écoute au curseur de l'éditeur actif. Le curseur reste visible et l'éditeur garde le focus.
2. Le texte reconnu apparaît **en grisé** à la suite du curseur, et se corrige au fil de la voix.
3. Quand le moteur fixe une phrase, elle devient du texte normal, entre dans la note, et le curseur passe à sa suite. Le texte provisoire reprend après.
4. La ponctuation et les majuscules sont celles que le moteur propose. Aucune commande vocale (« point », « à la ligne ») dans cette version.
5. Un blanc est ajouté entre deux phrases fixées ; aucun blanc en trop au début si le curseur suit déjà un blanc ou un début de ligne.

### 5.1 Arrêt

La saisie vocale s'arrête :
- au clic sur le micro, ou au raccourci ;
- sur **Échap** ;
- quand l'utilisateur change de contenu (autre onglet, autre colonne) ou ferme l'éditeur ;
- quand l'application passe à l'arrière-plan ;
- après **30 secondes de silence** ; un message bref le dit : « Saisie vocale arrêtée : silence ».

À l'arrêt, le texte provisoire en cours est **fixé tel quel** (jamais perdu), puis le micro revient au repos.

### 5.2 L'utilisateur tape ou déplace le curseur pendant l'écoute

Le texte provisoire est fixé tel quel, et l'écoute continue **à la nouvelle place du curseur**. La saisie au clavier et la voix peuvent donc alterner sans arrêter le micro.

### 5.3 Annuler

Une saisie vocale, du clic de départ à l'arrêt, forme **une seule étape d'annulation** : Cmd + Z retire tout ce que cette écoute a écrit. Le texte provisoire n'est pas dans l'historique d'annulation.

## 6. Où elle marche

- **Dans l'éditeur de texte d'une note** : partout où l'utilisateur écrit du Markdown avec l'éditeur habituel.
- **Dans la zone de saisie d'un cahier de recherche** (28/11, fiche 0111) : la zone de saisie en bas de la page d'un cahier (`doc/specs/entree-de-cahier.md`) est un champ de texte simple, pas l'éditeur ; la dictée y marche aussi. Le micro est actif dès qu'un cahier est ouvert dans la colonne active avec sa zone de saisie (le reste du cahier reste en lecture seule). La première version de cette spécification (27/11) l'écartait ; l'utilisateur l'a demandée en essayant (« j'ouvre une note : l'icône est grisée »).
- **Pas dans** : les autres champs de formulaire (CRM, étiquettes, recherche, renommer), les nœuds de canvas et de carte mentale, la note en lecture seule (corbeille), un cahier sans zone de saisie. Le micro est alors grisé (§ 4). Une extension à d'autres champs viendrait plus tard.

### 6.1 Dans la zone de saisie d'un cahier

Maquette (le micro est actif, le cahier est ouvert, l'utilisateur parle) :

```
 [ B  I  lien  H1 H2 H3  liste  liste  [ micro rouge ]  date ]

   Levures
   Lundi 23 novembre
   0001 | - 09:42 - Pâte mise à lever, 24 degrés.
   0002 | - 14:10 - Volume doublé après quatre heures.
  ----------------------------------------------------------------
   Nouvelle entrée - elle sera datée au moment de l'ajout ...
  +--------------------------------------------------------------+   <- liseré rouge
  | Troisième observation : la croûte a bruni. odeur de|         |
  +--------------------------------------------------------------+
   Le reste du cahier est en lecture seule.        [ Ajouter l'entrée ]
```

Ce qui est identique à l'éditeur : le micro (mêmes états, même bulle, même raccourci, y compris une touche seule), les bips, l'arrêt au clic, au raccourci, sur Échap, au changement de contenu, à l'arrière-plan et après 30 secondes de silence, les messages d'erreur et d'accès refusé, le blanc entre deux phrases fixées (ajouté après un caractère qui n'est pas un blanc, jamais au début du champ ni d'une ligne).

Ce qui change, parce que c'est un champ de texte simple et non l'éditeur :

- **Le texte provisoire est écrit dans le champ lui-même**, à la suite du curseur (un champ de texte ne sait pas griser une partie de son texte, et n'a pas de décor) : il est remplacé en entier à chaque mise à jour du moteur, et s'efface s'il devient vide. Pour qu'on voie que le champ écoute, **son liseré prend la couleur du micro à l'écoute** tant que l'écoute dure. Il n'est pas gardé à part : il est dans le champ, comme du texte tapé, jusqu'à l'ajout de l'entrée.
- **Le texte fixé** prend la place du texte provisoire, le curseur à sa suite. Il remplace une sélection, comme dans l'éditeur.
- **À l'arrêt, le texte provisoire en cours est fixé tel quel** (jamais perdu, comme § 5.1) ; le moteur envoie d'ailleurs toujours son dernier texte fixé avant la fin. Un départ qui échoue avant tout texte retire ce qui aurait été écrit.
- **La dictée n'ajoute jamais d'entrée d'elle-même** : à aucun moment, ni à l'arrêt, ni au silence, ni à une erreur. L'utilisateur valide avec « Ajouter l'entrée », comme d'habitude, et peut relire et corriger le champ avant.
- **L'utilisateur écrit pendant l'écoute** (même règle qu'au § 5.2) : une frappe, ou un curseur déplacé (clic, flèches), **fixe le texte provisoire où il est**, et l'écoute continue à la nouvelle place du curseur. Le moteur répète alors le début de sa phrase : seule la suite est écrite (si le moteur a corrigé ce début, son texte est écrit en entier).
- **« Ajouter l'entrée » pendant l'écoute** : l'entrée reçoit ce qui est écrit à cet instant (texte provisoire compris), le champ se vide, et l'écoute continue dans un champ vide, sans répéter ce qui est déjà parti.
- **Le focus peut quitter le champ** (par exemple sur « Ajouter l'entrée ») sans arrêter l'écoute : le texte continue d'arriver dans le champ.
- **Annuler (Cmd + Z)** : le texte dicté s'annule par l'annulation du champ de texte du navigateur. Contrairement à l'éditeur, une écoute n'a pas son étape d'annulation séparée : le navigateur regroupe la dictée et la frappe contiguë en une même étape (mesuré dans WebKit), si bien qu'un Cmd + Z peut retirer aussi ce qui venait d'être tapé juste avant ou après. Faire plus demanderait de refaire toute l'annulation du champ.
- **Quand la zone de saisie disparaît** (autre note ouverte dans la colonne) : l'écoute s'arrête comme à tout changement de contenu.
- Le cahier lui-même n'est jamais écrit par la dictée : le texte du cahier reste en lecture seule, sa version sur le disque ne change qu'à « Ajouter l'entrée ».

## 7. Langue

- La langue de la saisie vocale est celle choisie dans **Réglages > Saisie vocale**, par défaut **la langue du Mac**. La liste propose les langues que macOS sait transcrire.
- Au premier usage d'une langue, macOS peut devoir télécharger son modèle de langue : le micro passe en « préparation » (icône qui tourne, info-bulle « Saisie vocale : préparation de la langue… ») jusqu'à la fin ; si le téléchargement échoue (pas de réseau), un message le dit et propose de réessayer. Ensuite tout fonctionne hors connexion.
- Changer de langue pendant l'écoute n'est pas possible : il faut arrêter d'abord.

## 8. Autorisations et erreurs

- Au **premier clic sur le micro**, macOS demande l'accès au micro puis à la reconnaissance vocale ; les textes de ces demandes sont en français et disent que le son reste sur le Mac.
- Accès refusé : le micro est grisé, et un clic ouvre un message « La saisie vocale a besoin du micro et de la reconnaissance vocale. » avec le bouton « Ouvrir les réglages de macOS » (page Confidentialité).
- Aucun micro branché ou micro occupé : message « Aucun micro disponible. ».
- Le moteur s'arrête de lui-même (erreur interne) : le texte provisoire est fixé, le micro revient au repos, un message dit « La saisie vocale s'est arrêtée. » et l'utilisateur peut relancer.
- Chaque erreur s'affiche comme les autres erreurs de l'application ; aucune n'est silencieuse.

## 9. Vie privée

- Le son est traité sur le Mac, sans connexion, jamais envoyé ni enregistré sur le disque : seul le texte reconnu existe.
- Rien n'est gardé de la saisie vocale hors de la note (pas d'historique d'enregistrements).

## 10. Contraintes techniques

- SpeechAnalyzer est une interface Swift d'Apple : l'application (Rust) passe par un **petit pont Swift**, derrière un port de l'application (« transcripteur ») qui envoie des événements « texte provisoire », « texte fixé », « niveau sonore », « erreur », « fin ». Un transcripteur de remplacement, qui rejoue des événements écrits d'avance, sert aux tests ; le moteur réel ne peut pas être piloté par l'essai de l'application réelle (micro et boîtes de macOS).
- Avant tout développement du reste, un **essai isolé** prouve le pont : un programme minimal qui écoute et écrit ce qu'il entend dans le terminal.
- L'application déclare l'usage du micro et de la reconnaissance vocale dans son paquet (textes des demandes, autorisation d'entrée audio) ; l'application d'essai en est exclue.
- Le texte provisoire est un décor de l'éditeur, pas du contenu : il n'est jamais écrit dans le fichier, ni dans l'historique des versions, ni vu par la synchronisation. (Dans la zone de saisie d'un cahier, il est écrit dans le champ, § 6.1, et n'entre dans le fichier du cahier qu'avec l'entrée ajoutée.)

## 11. Hors périmètre

- Commandes vocales (« point », « à la ligne », « sélectionne ») et dictée de la mise en forme (titres, listes).
- Relecture par Whisper en fin de dictée (plus tard, en option).
- Dictée dans les champs de formulaire (hors la zone de saisie d'un cahier de recherche, § 6.1), les nœuds de canvas, la recherche.
- Transcription d'un fichier audio joint à une note (autre fonction du To Do).
- Un outil pour les IA (MCP) : la saisie vocale est un geste de l'utilisateur.

## 12. Points validés le 27/11

1. Place du micro dans la bande : avec les boutons de mise en forme, avant le sélecteur de date.
2. Raccourci : Ctrl + Maj + D.
3. Arrêt automatique après 30 secondes de silence.
4. Une saisie vocale = une étape d'annulation.
5. Langue par défaut : celle du Mac, réglable dans Réglages > Saisie vocale.
6. Périmètre : éditeurs de texte seulement, pas les champs de formulaire (élargi le 28/11 à la zone de saisie d'un cahier de recherche, § 6.1).

## 13. Contrat du moteur

Ce que le moteur offre à l'interface (fiche 0103). Les arguments sont en camelCase ; une erreur est un objet `{ message }` dont le message est en français, prêt à afficher. Les types sont générés dans `ui/src/bridge/generated/` (`VoiceInputStatusItem`, `VoiceLanguageItem`, `VoiceAccessItem`, `VoiceEventItem`) et le pont est dans `ui/src/bridge/index.ts`. Aucune commande ne dépend de l'espace de travail ouvert.

### Types

- `VoiceInputStatusItem`, un objet à `kind` :
  - `{ kind: "available", access: "allowed" | "denied" | "undecided", language: string | null, languageName: string | null, usingMacLanguage: boolean, languages: VoiceLanguageItem[], listening: boolean }` : le moteur répond. `access` est l'autorisation du micro (`undecided` : le premier clic la demande ; `denied` : micro grisé, § 8). `language` est la langue utilisée (la langue choisie, sinon celle du Mac ; `null` si le Mac n'en propose aucune), `usingMacLanguage` vaut vrai tant qu'aucune langue n'est choisie. `listening` : une saisie vocale est en cours (ou se termine).
  - `{ kind: "unavailable", code: "systemTooOld" | "engineMissing", message: string }` : micro grisé, l'info-bulle dit `message` (« Saisie vocale : macOS 26 minimum » ; « Le moteur de la saisie vocale est introuvable : réinstallez l'application. »).
- `VoiceLanguageItem` : `{ id: string, name: string, ready: boolean }` : une langue que macOS sait transcrire (`fr-FR`, « français (France) », triées par nom) ; `ready` faux : son modèle n'est pas encore sur le Mac, le premier usage le télécharge (« préparation », § 7).
- `VoiceEventItem`, un objet à `kind` (événement `voice-input-event`) :
  - `{ kind: "preparing" }` : le modèle de la langue se télécharge ; le micro tourne (« préparation ») ;
  - `{ kind: "listening" }` : le micro écoute (il a capté un son et le modèle est prêt à servir) ;
  - `{ kind: "provisional", text }` : le texte provisoire, **en entier** : il remplace le précédent ; `text` vide : le décor s'efface ;
  - `{ kind: "fixed", text }` : le texte fixé, à écrire dans la note au curseur ; le texte provisoire repart de zéro. Le texte est celui du moteur, sans blanc ajouté ni retiré : le blanc entre deux phrases fixées (§ 5.5) est à l'interface ;
  - `{ kind: "level", value }` : le niveau sonore de 0 à 1 (environ dix par seconde) pour le témoin ;
  - `{ kind: "silence", message }` : trente secondes sans parole ; `message` est « Saisie vocale arrêtée : silence » ; l'écoute s'arrête, `ended` suit ;
  - `{ kind: "failed", reason, message }` : la saisie vocale s'arrête ; `message` est à montrer tel quel comme les autres erreurs ; `reason` : `accessDenied` (« La saisie vocale a besoin du micro et de la reconnaissance vocale. » : griser le micro, proposer « Ouvrir les réglages de macOS »), `noMicrophone` (« Aucun micro disponible. »), `stopped` (« La saisie vocale s'est arrêtée. »), `languageUnsupported`, `languageDownload` (« Le modèle de la langue n'a pas pu être téléchargé : vérifiez la connexion, puis réessayez. » : proposer de réessayer), `systemTooOld`, `engineMissing`. `ended` suit toujours ;
  - `{ kind: "ended" }` : fin ; plus aucun événement ne suit, le micro revient au repos.
- Ordre garanti : `preparing` (si le modèle manque) puis `listening`, puis des `provisional`, `fixed` et `level` mêlés, puis éventuellement `silence` ou `failed`, puis `ended`, **toujours en dernier**, une seule fois par saisie vocale. À l'arrêt, le texte provisoire en cours est d'abord rendu en `fixed` (jamais perdu), y compris avant un `failed` : le moteur applique § 5.1, l'interface n'a qu'à écrire chaque `fixed`.

### Commandes

- `voice_input_status()` → `VoiceInputStatusItem`. À appeler à l'ouverture de l'application, à l'ouverture des Réglages (onglet « Saisie vocale »), après un choix de langue et après un échec. Chaque appel lance le moteur quelques dizaines de millisecondes : pas en boucle. Erreur : préférences illisibles.
- `choose_voice_language({ language })` → rien : garde la langue (`id` de `languages`) pour toute l'application ; `null` : revient à la langue du Mac. Erreurs : « Cette langue n'est pas prise en charge par la saisie vocale. » ; « Arrêtez la saisie vocale avant de changer de langue. » (§ 7) ; moteur indisponible (message de `unavailable`).
- `prepare_voice_language({ language })` → rien : prépare le modèle de la langue (le télécharge s'il manque) et ne rend la main qu'une fois prêt (long au premier usage : l'onglet des Réglages montre « préparation » pendant l'attente). Sans effet si le modèle est déjà sur le Mac. Erreurs : langue non prise en charge ; « Le modèle de la langue n'a pas pu être téléchargé : vérifiez la connexion, puis réessayez. » ; moteur indisponible.
- `start_voice_input()` → rien : démarre l'écoute dans la langue utilisée et **rend la main aussitôt** ; la suite (accès au micro demandé par macOS, préparation du modèle, texte) arrive par `voice-input-event`, y compris les échecs d'accès, de micro et de langue (un Mac qui n'a aucune langue à proposer envoie `failed` avec `languageUnsupported`, fiche 0108). Erreurs immédiates : « La saisie vocale est déjà en cours. » (une seule écoute à la fois, la précédente doit avoir fini : attendre `ended` avant de relancer) ; moteur indisponible. Le démarrage ne fait aucun appel au catalogue (fiche 0108) : le micro s'ouvre en même temps que le modèle se prépare, et le son dit entre-temps n'est pas perdu.
- `stop_voice_input()` → rien : demande l'arrêt (clic, raccourci, Échap, changement de contenu, arrière-plan : § 5.1). Rend la main aussitôt ; la fin arrive par `ended`, précédée du dernier `fixed`. Sans effet s'il n'y a pas d'écoute. Quitter l'application arrête aussi l'écoute.
- `open_voice_privacy_settings()` → rien : ouvre la page Confidentialité des réglages de macOS, sur le micro (bouton « Ouvrir les réglages de macOS » du message d'accès refusé). Erreur : « les réglages de macOS ne se sont pas ouverts : … ».

### Événement

- `voice-input-event`, porte un `VoiceEventItem` (`onVoiceInputEvent` dans le pont). Un seul abonné suffit : il pilote le micro (états, témoin de niveau), le décor du texte provisoire, l'écriture du texte fixé et les messages.

### Règles que l'interface n'a pas à connaître

- Le silence de trente secondes (compté depuis que le micro écoute, pas pendant le téléchargement d'un modèle ; le niveau sonore et les textes vides ne comptent pas comme parole), l'ordre des événements, le texte provisoire fixé à l'arrêt ou avant un échec, l'unicité de l'écoute.
- La langue du Mac (la première des langues préférées que macOS sait transcrire) et la langue choisie, gardée dans les préférences de l'application ; l'interface ne lit jamais ces préférences.
- Rien n'est écrit par le moteur : ni la note, ni un fichier audio, ni un historique. Ce qui n'est pas passé par `fixed` n'existe pas.

### À faire par l'interface

Le micro (états, info-bulles, raccourci), le décor du texte provisoire, l'écriture du texte fixé au curseur et le blanc entre phrases (§ 5.5), l'étape d'annulation unique (§ 5.3), l'arrêt aux changements de contenu, à Échap et à l'arrière-plan, l'onglet « Saisie vocale » des Réglages (langue, état du modèle, « préparation »), les messages.

## 14. Interface réalisée

- **Le micro** : un bouton de la barre de mise en forme, dans la première pilule, juste avant le bouton de la date ; même taille et même survol que ses voisins, couleurs et tailles prises dans le thème. Quatre états : repos (icône de micro, bulle « Saisie vocale (Ctrl+Maj+D) », avec le raccourci choisi), préparation (icône qui tourne, « Saisie vocale : préparation de la langue… », un clic arrête), écoute (icône pleine rouge, petit trait de niveau sonore à droite de l'icône qui suit les événements de niveau, `aria-pressed` vrai, « Arrêter la saisie vocale »), indisponible (grisé, la bulle dit pourquoi : « Saisie vocale : macOS 26 minimum » ou le message du moteur, « Saisie vocale : ouvrez une note » quand le contenu ouvert n'a pas d'éditeur de texte). Accès refusé : grisé mais cliquable, bulle « Saisie vocale : accès au micro refusé ». Pendant l'arrêt (entre la demande et la fin), le micro est inactif : on ne relance qu'après la fin de l'écoute. Un clic ou le raccourci sur un micro indisponible dit la raison par un message.
- **Raccourci** : Ctrl+Maj+D par défaut (choisissable, y compris une touche seule : voir « Raccourci et bips »), vérifié contre les raccourcis existants (Cmd+Maj+D reste « Insérer la date du jour ») ; même effet que le clic, où que soit le curseur (l'éditeur reprend le focus). Il est aussi dans la palette (« Saisie vocale ») et dans la barre des menus (Édition, après les trois commandes d'aide à l'écriture).
- **Où elle marche** : l'éditeur de texte d'une note de la colonne active, et la zone de saisie d'un cahier de recherche de la colonne active (§ 6.1, fiche 0111). Le micro est grisé pour une carte mentale, un canvas, un CRM et une fiche, sans note, et pour un cahier sans zone de saisie. Le « brouillon d'entrée de cahier de recherche » de la première version du § 6 n'existe plus depuis la version simple de `doc/specs/entree-de-cahier.md` ; la zone de saisie qui l'a remplacé est un champ de texte simple, dicté par le chemin décrit au § 6.1.
- **Dans l'éditeur** : le texte provisoire est un décor (jamais dans le contenu, le fichier, l'enregistrement ni l'historique d'annulation) grisé à la suite du curseur, remplacé en entier à chaque événement ; le curseur reste devant lui et visible. Le texte fixé est écrit au curseur comme une frappe (il remplace une sélection) et le curseur passe à sa suite ; le blanc de séparation est ajouté après un caractère qui n'est pas un blanc, retiré (même s'il vient du moteur) après un blanc, un début de ligne ou de note. Une écoute est une seule étape d'annulation, séparée de la frappe qui la précède et de celle qui la suit.
- **Taper ou déplacer le curseur pendant l'écoute** (§ 5.2) : le texte provisoire est fixé à sa place, le curseur le suit s'il était contre lui, et l'écoute continue à la nouvelle place. Le moteur ne sait pas que l'interface a fixé ce texte et répète le début de sa phrase : l'interface ne montre et n'écrit alors que la suite de son texte (si le moteur a corrigé ce début, son texte est écrit en entier). Une frappe ouvre une nouvelle étape d'annulation : une écoute coupée par la frappe fait donc plusieurs étapes.
- **Arrêts** : clic, raccourci, Échap (avant la sortie du plein écran et le retrait du filtre par étiquette), arrière-plan de l'application (seulement une fois le micro en écoute, pour ne pas couper la demande d'accès de macOS). Changement d'onglet, de note ou de colonne active : le texte provisoire est fixé dans la note quittée, qui est encore montrée, puis le moteur est arrêté et ses derniers événements ne sont plus écrits. Un renommage de la note par son titre ne l'arrête pas. Colonne fermée : le texte provisoire est fixé avant que la colonne disparaisse.
- **Messages** : `silence` : le message du moteur, en information ; `failed` : son message tel quel, en erreur, avec « Ouvrir les réglages de macOS » pour un accès refusé (le micro est alors grisé) et « Réessayer » (relance l'écoute) pour un modèle de langue non téléchargé ; une erreur d'une commande est dite comme les autres erreurs. Après un échec, l'état du moteur est relu.
- **Réglages, onglet « Saisie vocale »** (entre « Index » et « Favoris ») : « Langue » (« La langue du Mac », avec son nom quand c'est celle utilisée, puis chaque langue avec « prête » ou « à télécharger »), l'état du modèle de la langue utilisée, « Télécharger le modèle de langue » (« Préparation de la langue… » pendant l'attente, le choix est alors bloqué), le message du moteur et « Réessayer » après un échec, et la phrase « Le son reste sur le Mac : il est traité par macOS, jamais envoyé ni enregistré. ». Changer de langue pendant l'écoute : le message du moteur est dit et la liste revient à la langue gardée. L'état est relu à l'ouverture de l'application, à l'ouverture de l'onglet, après un choix et après un échec.
- **Hors de ce que les tests jouent** : le vrai micro, la demande d'accès de macOS et le vrai moteur ne sont jouables ni par les tests ni par l'essai de l'application réelle ; les tests (Vitest, WebKit, parcours `voice-input`) utilisent un faux moteur qui rejoue des événements écrits d'avance.

### Raccourci et bips (réglages, 28/11, fiches 0109 et 0110)

Maquette de l'onglet « Saisie vocale » :

```
Saisie vocale
  Langue            [ La langue du Mac (français (France)) ▾ ]
                    La langue dans laquelle vous parlez ; par défaut, celle du Mac.
  français (France) : prête

  Raccourci         [ ⌘ droite ]   [ Rétablir le raccourci par défaut ]
                    Démarre et arrête la dictée. Cliquez, puis pressez une touche ou une
                    combinaison ; une touche de modificateur (⌘ ⌥ ⌃ ⇧, à gauche ou à
                    droite) se choisit en la pressant puis en la relâchant ; Échap annule.
                    La touche Fn n'est pas lisible par l'application.

  [ ] Bip au début et à la fin de la dictée
      Un court son quand le micro écoute, et un autre quand la dictée s'arrête.

  Le son reste sur le Mac : il est traité par macOS, jamais envoyé ni enregistré.
```

- **Raccourci** : un seul raccourci démarre et arrête la dictée. La touche « ⌃⇧D » (ou « ⌘ droite », « F5 »…) est un contrôle : un clic la met en attente (« Appuyez sur la combinaison… », focus sur la touche), ce qui est pressé est gardé ; **Échap** annule sans rien changer ni fermer les réglages ; un autre clic, ou quitter la touche, abandonne aussi. Le raccourci s'écrit en symboles du Mac (⌃ Contrôle, ⌥ Option, ⇧ Majuscule, ⌘ Commande, dans cet ordre) ; une touche seule s'écrit avec son côté (« ⌘ droite », « ⌥ gauche »). « Rétablir le raccourci par défaut » n'apparaît que lorsque le raccourci n'est pas Ctrl+Maj+D.
- **Ce qui est permis comme raccourci** (28/11, fiche 0110) :
  - une **touche de modificateur seule** (« touche seule ») : Cmd, Option, Ctrl ou Maj, **à gauche ou à droite** (la touche à droite de la barre d'espace est Cmd droite ou Option droite). Elle est reconnue par sa touche physique (`MetaRight`, `AltLeft`…), ce qui distingue les deux côtés. Dans les réglages, on la choisit en la pressant puis en la relâchant, sans autre touche entre les deux (peu importe la durée) ;
  - une **touche de fonction seule** (F1 à F12), déclenchée à l'appui. Le Mac réserve certaines touches de fonction à son système (luminosité, Mission Control, volume…) tant qu'on ne tient pas Fn : si la touche n'arrive pas à l'application, elle ne peut pas servir ;
  - une **combinaison** : des modificateurs dont **Ctrl ou Cmd**, plus une lettre (lue telle qu'on la tape, par la touche physique avec Option), un chiffre ou une touche de fonction. Avec une touche de fonction, n'importe quels modificateurs conviennent (Option+F5, Maj+F5 : aucun ne tape de texte). Avec une lettre ou un chiffre, Option et Maj seules, ou à deux, sont toujours refusées : elles servent déjà à taper des accents et des majuscules, le raccourci les volerait à la frappe (la règle de départ, inchangée).
- **Ce qui reste refusé**, avec un message en français sous la touche : toute touche qui tape du texte seule (lettre, chiffre, Espace, Entrée, Retour arrière, flèches, Tab, Échap…), par exemple « Cette touche tape du texte : ajoutez Ctrl ou Cmd (avec Option ou Maj si vous voulez). Seules une touche de modificateur (Cmd, Option, Ctrl, Maj) et F1 à F12 servent seules. » ; et une combinaison déjà prise (« Ce raccourci est déjà pris par « Gras ». », nom de la commande de l'application ou de macOS : Annuler, Rétablir, Couper, Copier, Coller, Tout sélectionner, Quitter, Masquer, Masquer les autres, Placer dans le Dock). Rien n'est gardé en cas de refus.
- **Le tapotement** : une touche seule se déclenche **au relâchement**, si elle a été pressée puis relâchée en **500 millisecondes au plus** et si **aucune autre touche (ni aucun clic) n'est venue** pendant qu'elle était enfoncée. Sinon c'est autre chose et rien ne se déclenche : le début d'une combinaison ordinaire (Cmd droite + C copie comme toujours, Option droite + une lettre tape sa lettre accentuée, Cmd + clic garde son effet) ou un maintien. Le côté compte : si le raccourci est Cmd droite, Cmd gauche ne déclenche rien. L'écoute des touches seules se fait au niveau de la fenêtre : elle marche dans l'éditeur, dans un champ de formulaire de l'application et hors éditeur, et aucune touche n'est retenue (une touche de modificateur seule n'a pas d'autre effet). Une fenêtre de l'interface ouverte (réglages, choix) garde le clavier : rien ne se déclenche.
- **La touche Fn n'est pas lisible.** Le contenu web d'une fenêtre ne reçoit, en pratique, aucun événement clavier quand on presse Fn seule : le système la traite avant l'application. Elle ne peut donc pas être un raccourci, et la dire franchement vaut mieux que de la promettre : l'aide sous le contrôle le dit, et si un événement « Fn » arrivait malgré tout pendant la capture, il serait refusé avec « La touche Fn ne peut pas servir de raccourci : l'application ne la voit pas. Choisissez une autre touche. ». (Fn + une touche de fonction arrive, si macOS la passe à l'application, comme cette touche de fonction.)
- **Conflits** : une touche de modificateur seule ne peut pas entrer en conflit avec un raccourci de l'application ou de macOS (ils contiennent tous une touche qui n'est pas un modificateur) ; une touche de fonction seule non plus (aucune commande n'en a). La vérification est quand même faite avant de garder.
- **Gardé** dans les préférences sous la même clé que la combinaison, au même format texte, étendu sans rien casser : `Ctrl+Maj+D` (combinaison), `F5` (touche de fonction), `Cmd droite` (touche seule : modificateur, espace, côté). Un `Ctrl+Maj+D` déjà enregistré se lit comme avant ; une valeur illisible vaut le raccourci de départ.
- **Où il sert** : la bulle du micro, la palette, la barre des menus (reconstruite quand il change) et le clavier suivent le raccourci choisi. Toutes les combinaisons et les touches de fonction seules sont prises par la fenêtre en premier, lues à leur touche physique (avec Option, la lettre tapée change : Option+E tape « ´ ») ; la barre des menus du Mac ne reçoit que la touche que la fenêtre n'a pas prise, et une pression livrée par les deux chemins ne bascule qu'une fois (fiche 0112) ; une touche de modificateur seule n'a pas d'élément de raccourci dans la barre des menus (l'élément « Saisie vocale » n'affiche alors aucun raccourci) : la fenêtre l'écoute au tapotement. C'est un raccourci de l'application : aucune autorisation de macOS de plus.
- **Le raccourci est une bascule** (fiche 0112) : il démarre la dictée si rien n'écoute et l'arrête sinon (y compris pendant la préparation de la langue). Une pression ne bascule qu'une fois, quel que soit le chemin qui la livre : une seconde livraison dans les 100 millisecondes qui suivent (la barre des menus après la fenêtre) et la répétition d'une touche maintenue sont ignorées. Deux pressions au doigt, espacées de plus de 100 millisecondes, basculent chacune.
- **Bips** : case décochée par défaut. Cochée, un bip (deux notes qui montent, 660 puis 880 Hz, 80 ms chacune) joue quand l'écoute commence réellement (événement `listening`) et un autre (deux notes qui descendent) quand la saisie vocale finit après avoir écouté (`ended`), y compris l'arrêt de lui-même après 30 secondes de silence et une erreur après l'écoute ; aucun bip pour un échec avant l'écoute (accès refusé). Sons fabriqués par Web Audio, volume modéré, aucune ressource livrée. Le navigateur n'autorise un son que s'il a été préparé par un geste : le clic, le raccourci qui démarre la dictée ou la case cochée le préparent.
- **Gardés** dans les préférences de l'application (`voice_shortcut`, `voice_beeps`), comme la langue. Commandes : `voice_input_settings()`, `choose_voice_shortcut({ shortcut })` (écrit comme les menus ; `null` : Ctrl+Maj+D ; refuse une combinaison invalide avec son message), `choose_voice_beeps({ beeps })` ; elles rendent `VoiceSettingsItem { shortcut, defaultShortcut, beeps }` (type généré). Permis pendant une écoute.
- **Hors de ce que les tests jouent** : le son réel et le micro ; les tests (Vitest, parcours `voice-input`) vérifient les notes demandées à Web Audio, pas ce qu'on entend.
