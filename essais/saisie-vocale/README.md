# Essai isolé du pont de la saisie vocale

Prouve, hors de l'application, que SpeechAnalyzer d'Apple écoute le micro du Mac et rend du texte
(`doc/specs/saisie-vocale.md` § 10). Lancer : `./lancer.sh fr-FR 40`, puis parler.

## Résultat du 27/11 (macOS 26.6, SDK 27.2, Swift 6.4)

- Le micro, accordé par macOS à la première écoute, donne le son ; le niveau sonore (RMS) monte à
  0,07 environ quand on parle : de quoi animer le témoin du micro.
- Le modèle français s'installe à la demande (`AssetInventory.assetInstallationRequest`), puis tout
  marche hors connexion.
- Le texte **provisoire** arrive presque aussitôt, mot après mot, **en entier à chaque mise à jour**
  (il remplace le précédent, il ne s'y ajoute pas) ; la ponctuation et les majuscules sont ajoutées
  par le moteur.
- Le texte **fixé** arrive quand le moteur est sûr (ici une phrase d'une traite, fixée à la fin).
- Réglage utilisé : `SpeechTranscriber(locale:, preset: .progressiveTranscription)`.
- Le programme d'essai est lancé depuis un terminal ; l'application aura ses propres textes
  d'autorisation (`NSMicrophoneUsageDescription`).

## Mesure du démarrage (28/11)

`python3 -I mesure.py <malorean-voice> [langue ou -] [répétitions] [--resume]` lance `listen` avec
`MALOREAN_VOICE_TRACE=1` et donne le temps de chaque étape ; résultats et décision dans
`doc/decisions/0108-saisie-vocale-demarrage.md`.
