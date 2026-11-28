# 0108 — Saisie vocale : un seul démarrage, et le micro s'ouvre pendant que le modèle se prépare

Date : 28/11/2026. Spécification : `doc/specs/saisie-vocale.md`. Fiche précédente : 0103 (le moteur).

## Contexte

L'utilisateur constate 1 à 2 secondes entre le clic sur le micro (ou Ctrl+Maj+D) et le début effectif de l'écoute. Mesure faite d'abord, sur ce Mac (macOS 26.6, programme `malorean-voice` compilé comme `crates/app/build.rs`, micro lu depuis le terminal), avec `essais/saisie-vocale/mesure.py` et les horodatages que le programme écrit sur sa sortie d'erreur quand `MALOREAN_VOICE_TRACE` est définie. Le Mac était très chargé pendant les mesures (autres agents, charge moyenne de 60 à 140) : les durées absolues sont plutôt hautes ; avant et après ont été mesurés dans les mêmes conditions, en alternance.

Avant, au clic, sans langue choisie (le cas par défaut), dans l'ordre :

- appel du catalogue (`malorean-voice status`, un programme entier qui énumère les langues et lit les modèles installés) : médiane 231 ms (de 195 à 545) sur une série, 526 ms (de 228 à 822) sur l'autre ;
- puis `malorean-voice listen`, chaque étape l'une après l'autre : accès au micro (dont la recherche du micro par défaut, 180 à 275 ms à elle seule) médiane 262 ms ; recherche de la langue et création du transcripteur, médiane 418 ms depuis le lancement ; vérification du modèle et analyseur démarré, 447 ms ; ouverture du moteur audio (`inputNode`, pose du tap, préparation, démarrage), « micro ouvert » à 871 ms ; événement « listening » à 884 ms ; premier son capté à 971 ms.
- Total du clic à « listening » : 231 + 884 = 1115 ms (série calme), 526 + 1373 = 1899 ms (série chargée). Tout ce que l'utilisateur disait pendant ce temps était perdu.

## Décision

On ne garde pas le programme ni le modèle chargés en permanence (mémoire ; macOS décharge le modèle de lui-même). Deux changements seulement :

- **Plus d'appel au catalogue au démarrage de l'écoute.** Le port `Transcriber::listen` reçoit une langue facultative : sans langue choisie dans les réglages, `None`, et le programme Swift cherche lui-même la langue du Mac (la première des langues préférées que macOS sait transcrire, le même code que `status`). Un Mac sans langue à proposer le dit par l'événement `failed` (`languageUnsupported`) puis `ended`, comme les autres échecs, et non plus par une erreur de la commande `start_voice_input`.
- **Le micro s'ouvre tout de suite, pendant que le modèle se prépare.** Dans le programme Swift, l'ouverture du micro (accès, moteur audio) et la préparation de la reconnaissance (langue, modèle, analyseur) se font en même temps. Le son capté avant que l'analyseur soit prêt attend dans un tampon (`Feed`), puis lui est envoyé dans l'ordre dès qu'il est prêt : le début de la phrase n'est plus perdu quand le modèle est plus lent que le micro. Pendant un téléchargement de modèle, le son n'est pas gardé (l'utilisateur voit « préparation »).
- **L'événement « listening »** sort quand le micro a réellement capté un son et que le modèle est prêt à servir ; il n'est plus précédé d'un faux « preparing » (le programme annonçait « preparing » à chaque écoute, même avec un modèle déjà sur le Mac ; il ne l'annonce plus que lorsque la langue n'est pas installée). L'ordre garanti est inchangé : `preparing` (si le modèle manque), puis `listening`, puis les textes, `ended` toujours en dernier.
- **Le micro par défaut n'est plus cherché à part** (180 à 275 ms) : sans micro, le format de l'entrée est vide ou le moteur audio refuse de démarrer, et le programme répond `noMicrophone`.

## Mesures après

Mêmes conditions, en alternance avec les mesures d'avant :

- plus de catalogue : 0 ms au lieu de 231 ms (médiane) ;
- langue trouvée à 175 ms (au lieu de 418), modèle prêt et analyseur démarré à 245 ms, en parallèle de l'ouverture du micro et non plus avant elle ;
- moteur audio démarré à 648 ms (au lieu de 871 pour « micro ouvert ») ;
- événement « listening » (premier son réellement capté) à 799 ms depuis le lancement du programme (au lieu de 884) ;
- total du clic à « listening » : 799 ms (au lieu de 1115 ms) sur la série calme ; 1032 ms (au lieu de 1899 ms) sur la série chargée.

Ce qui reste incompressible dans un programme lancé à froid : l'initialisation du système audio de macOS (`engine.inputNode`, 350 à 480 ms mesurés seule, sans aucun modèle, par un petit programme d'essai ; `AVCaptureSession` donne le même ordre : 550 à 640 ms jusqu'au premier tampon) et le premier tampon du micro (100 ms après le démarrage du moteur audio : la taille demandée au tap est ignorée). Les réduire demanderait de garder le programme lancé, ce qui est écarté.

## Ce qui se vérifie comment

- Testé : pas d'appel du catalogue au démarrage de l'écoute (application) ; ordre des événements jusqu'à l'interface ; Mac sans langue (événement) ; commande `listen` sans langue (infrastructure) ; **le tampon du son** (`Feed`), par un programme Swift de vérification (`crates/infrastructure/swift/tests/feed/main.swift`, joué par `crates/infrastructure/tests/swift_feed.rs`) : le son capté pendant la préparation part dans l'ordre sans perte, il n'est pas gardé pendant un téléchargement, c'est une copie, « listening » sort une seule fois et pas avant que le modèle soit prêt.
- **À la main seulement** (le micro réel) : dire une phrase tout de suite après le clic et voir qu'elle apparaît entière ; micro débranché ou inactif (réponse « Aucun micro disponible. »), puisque la recherche du micro par défaut a disparu.
- La mesure se refait avec `python3 -I essais/saisie-vocale/mesure.py <malorean-voice> - 10 --resume` (la langue `-` : celle du Mac).
