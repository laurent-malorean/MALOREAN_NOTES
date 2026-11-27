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

- **Dans l'éditeur de texte d'une note** et dans celui d'un brouillon d'entrée de cahier de recherche : partout où l'utilisateur écrit du Markdown avec l'éditeur habituel.
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
