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
- Visible quand le contenu ouvert a un éditeur de texte (§ 6) ; grisé sinon, avec l'info-bulle « Saisie vocale : ouvrez une note ».
- Trois états :
  - **repos** : icône de micro ; info-bulle « Saisie vocale » et le raccourci ;
  - **écoute** : icône pleine, rouge, avec un petit témoin de niveau sonore qui bouge avec la voix ; info-bulle « Arrêter la saisie vocale » ; `aria-pressed` vrai ;
  - **indisponible** : grisé (macOS trop ancien, accès refusé, § 8), avec l'info-bulle qui dit pourquoi.
- Raccourci : **Ctrl + Maj + D**, même effet que le clic. Il est vérifié contre les raccourcis existants avant d'être posé.

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

- **Dans l'éditeur de texte d'une note** : partout où l'utilisateur écrit du Markdown avec l'éditeur habituel. La zone de saisie d'une entrée de cahier de recherche est un champ de texte simple (version du 23/11), pas cet éditeur : elle est hors périmètre, le micro y est grisé (correction du 27/11).
- **Pas dans** : les champs de formulaire (CRM, étiquettes, recherche, renommer), les nœuds de canvas et de carte mentale, la note en lecture seule (cahier de recherche, corbeille). Le micro est alors grisé (§ 4). Une extension à d'autres champs viendrait plus tard.

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
- Le texte provisoire est un décor de l'éditeur, pas du contenu : il n'est jamais écrit dans le fichier, ni dans l'historique des versions, ni vu par la synchronisation.

## 11. Hors périmètre

- Commandes vocales (« point », « à la ligne », « sélectionne ») et dictée de la mise en forme (titres, listes).
- Relecture par Whisper en fin de dictée (plus tard, en option).
- Dictée dans les champs de formulaire, les nœuds de canvas, la recherche.
- Transcription d'un fichier audio joint à une note (autre fonction du To Do).
- Un outil pour les IA (MCP) : la saisie vocale est un geste de l'utilisateur.

## 12. Points validés le 27/11

1. Place du micro dans la bande : avec les boutons de mise en forme, avant le sélecteur de date.
2. Raccourci : Ctrl + Maj + D.
3. Arrêt automatique après 30 secondes de silence.
4. Une saisie vocale = une étape d'annulation.
5. Langue par défaut : celle du Mac, réglable dans Réglages > Saisie vocale.
6. Périmètre : éditeurs de texte seulement, pas les champs de formulaire.

## 13. Contrat du moteur

Ce que le moteur offre à l'interface (fiche 0103). Les arguments sont en camelCase ; une erreur est un objet `{ message }` dont le message est en français, prêt à afficher. Les types sont générés dans `ui/src/bridge/generated/` (`VoiceInputStatusItem`, `VoiceLanguageItem`, `VoiceAccessItem`, `VoiceEventItem`) et le pont est dans `ui/src/bridge/index.ts`. Aucune commande ne dépend de l'espace de travail ouvert.

### Types

- `VoiceInputStatusItem`, un objet à `kind` :
  - `{ kind: "available", access: "allowed" | "denied" | "undecided", language: string | null, languageName: string | null, usingMacLanguage: boolean, languages: VoiceLanguageItem[], listening: boolean }` : le moteur répond. `access` est l'autorisation du micro (`undecided` : le premier clic la demande ; `denied` : micro grisé, § 8). `language` est la langue utilisée (la langue choisie, sinon celle du Mac ; `null` si le Mac n'en propose aucune), `usingMacLanguage` vaut vrai tant qu'aucune langue n'est choisie. `listening` : une saisie vocale est en cours (ou se termine).
  - `{ kind: "unavailable", code: "systemTooOld" | "engineMissing", message: string }` : micro grisé, l'info-bulle dit `message` (« Saisie vocale : macOS 26 minimum » ; « Le moteur de la saisie vocale est introuvable : réinstallez l'application. »).
- `VoiceLanguageItem` : `{ id: string, name: string, ready: boolean }` : une langue que macOS sait transcrire (`fr-FR`, « français (France) », triées par nom) ; `ready` faux : son modèle n'est pas encore sur le Mac, le premier usage le télécharge (« préparation », § 7).
- `VoiceEventItem`, un objet à `kind` (événement `voice-input-event`) :
  - `{ kind: "preparing" }` : le modèle de la langue se télécharge ; le micro tourne (« préparation ») ;
  - `{ kind: "listening" }` : le micro écoute ;
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
- `start_voice_input()` → rien : démarre l'écoute dans la langue utilisée et **rend la main aussitôt** ; la suite (accès au micro demandé par macOS, préparation du modèle, texte) arrive par `voice-input-event`, y compris les échecs d'accès, de micro et de langue. Erreurs immédiates : « La saisie vocale est déjà en cours. » (une seule écoute à la fois, la précédente doit avoir fini : attendre `ended` avant de relancer) ; « Cette langue n'est pas prise en charge par la saisie vocale. » (le Mac n'a aucune langue à proposer) ; moteur indisponible.
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

- **Le micro** : un bouton de la barre de mise en forme, dans la première pilule, juste avant le bouton de la date ; même taille et même survol que ses voisins, couleurs et tailles prises dans le thème. Quatre états : repos (icône de micro, bulle « Saisie vocale (Ctrl+Maj+D) »), préparation (icône qui tourne, « Saisie vocale : préparation de la langue… », un clic arrête), écoute (icône pleine rouge, petit trait de niveau sonore à droite de l'icône qui suit les événements de niveau, `aria-pressed` vrai, « Arrêter la saisie vocale »), indisponible (grisé, la bulle dit pourquoi : « Saisie vocale : macOS 26 minimum » ou le message du moteur, « Saisie vocale : ouvrez une note » quand le contenu ouvert n'a pas d'éditeur de texte). Accès refusé : grisé mais cliquable, bulle « Saisie vocale : accès au micro refusé ». Pendant l'arrêt (entre la demande et la fin), le micro est inactif : on ne relance qu'après la fin de l'écoute. Un clic ou le raccourci sur un micro indisponible dit la raison par un message.
- **Raccourci** : Ctrl+Maj+D, vérifié contre les raccourcis existants (Cmd+Maj+D reste « Insérer la date du jour ») ; même effet que le clic, où que soit le curseur (l'éditeur reprend le focus). Il est aussi dans la palette (« Saisie vocale ») et dans la barre des menus (Édition, après les trois commandes d'aide à l'écriture).
- **Où elle marche** : l'éditeur de texte d'une note de la colonne active. Le micro est grisé pour un cahier de recherche (lecture seule ; sa zone de saisie en bas est un champ de formulaire, hors périmètre, § 6), une carte mentale, un canvas, un CRM et une fiche, et sans note. Le « brouillon d'entrée de cahier de recherche » du § 6 n'existe plus depuis la version simple de `doc/specs/entree-de-cahier.md` : il n'y a pas d'autre éditeur.
- **Dans l'éditeur** : le texte provisoire est un décor (jamais dans le contenu, le fichier, l'enregistrement ni l'historique d'annulation) grisé à la suite du curseur, remplacé en entier à chaque événement ; le curseur reste devant lui et visible. Le texte fixé est écrit au curseur comme une frappe (il remplace une sélection) et le curseur passe à sa suite ; le blanc de séparation est ajouté après un caractère qui n'est pas un blanc, retiré (même s'il vient du moteur) après un blanc, un début de ligne ou de note. Une écoute est une seule étape d'annulation, séparée de la frappe qui la précède et de celle qui la suit.
- **Taper ou déplacer le curseur pendant l'écoute** (§ 5.2) : le texte provisoire est fixé à sa place, le curseur le suit s'il était contre lui, et l'écoute continue à la nouvelle place. Le moteur ne sait pas que l'interface a fixé ce texte et répète le début de sa phrase : l'interface ne montre et n'écrit alors que la suite de son texte (si le moteur a corrigé ce début, son texte est écrit en entier). Une frappe ouvre une nouvelle étape d'annulation : une écoute coupée par la frappe fait donc plusieurs étapes.
- **Arrêts** : clic, raccourci, Échap (avant la sortie du plein écran et le retrait du filtre par étiquette), arrière-plan de l'application (seulement une fois le micro en écoute, pour ne pas couper la demande d'accès de macOS). Changement d'onglet, de note ou de colonne active : le texte provisoire est fixé dans la note quittée, qui est encore montrée, puis le moteur est arrêté et ses derniers événements ne sont plus écrits. Un renommage de la note par son titre ne l'arrête pas. Colonne fermée : le texte provisoire est fixé avant que la colonne disparaisse.
- **Messages** : `silence` : le message du moteur, en information ; `failed` : son message tel quel, en erreur, avec « Ouvrir les réglages de macOS » pour un accès refusé (le micro est alors grisé) et « Réessayer » (relance l'écoute) pour un modèle de langue non téléchargé ; une erreur d'une commande est dite comme les autres erreurs. Après un échec, l'état du moteur est relu.
- **Réglages, onglet « Saisie vocale »** (entre « Index » et « Favoris ») : « Langue » (« La langue du Mac », avec son nom quand c'est celle utilisée, puis chaque langue avec « prête » ou « à télécharger »), l'état du modèle de la langue utilisée, « Télécharger le modèle de langue » (« Préparation de la langue… » pendant l'attente, le choix est alors bloqué), le message du moteur et « Réessayer » après un échec, et la phrase « Le son reste sur le Mac : il est traité par macOS, jamais envoyé ni enregistré. ». Changer de langue pendant l'écoute : le message du moteur est dit et la liste revient à la langue gardée. L'état est relu à l'ouverture de l'application, à l'ouverture de l'onglet, après un choix et après un échec.
- **Hors de ce que les tests jouent** : le vrai micro, la demande d'accès de macOS et le vrai moteur ne sont jouables ni par les tests ni par l'essai de l'application réelle ; les tests (Vitest, WebKit, parcours `voice-input`) utilisent un faux moteur qui rejoue des événements écrits d'avance.
