# 0109 — Saisie vocale : le raccourci se choisit, et un bip facultatif marque le début et la fin

Date : 28/11/2026. Spécification : `doc/specs/saisie-vocale.md`, section « Raccourci et bips ». Fiches voisines : 0103 (le moteur), 0108 (le démarrage).

## Contexte

L'utilisateur a demandé deux réglages dans l'onglet « Saisie vocale » : choisir le raccourci qui démarre et arrête la dictée (jusque-là Ctrl+Maj+D, écrit dans la liste des commandes), et un bip au début et à la fin.

## Décision

- **Le raccourci est une règle du domaine** (`domain::voice_shortcut::VoiceShortcut`, qui se construit par `FromStr` et se montre par `Display`) : des modificateurs dont **Ctrl ou Cmd**, plus une touche (lettre, chiffre, F1 à F12). Option et Maj seules, ou à deux, sont refusées : elles servent déjà à taper des accents et des majuscules, le raccourci les volerait à la frappe (Maj+D ne tapait plus un « D »). L'écriture est celle des menus du Mac et de la palette (`Ctrl+Maj+D`, modificateurs dans l'ordre Ctrl, Alt, Cmd, Maj). Les raisons du refus ont chacune un message en français, dit tel quel dans les réglages.
- **Le conflit se détecte dans l'interface**, qui seule connaît la liste des commandes : la combinaison est comparée, sans tenir compte de l'ordre ni de la casse, au raccourci de chaque commande de la palette (celui de la saisie vocale exclu) et à une courte liste de touches de macOS et de l'édition (Annuler, Rétablir, Couper, Copier, Coller, Tout sélectionner, Quitter, Masquer, Masquer les autres, Placer dans le Dock). Le message nomme la commande qui l'a. La validité (Ctrl ou Cmd, touche permise) n'est écrite qu'à un endroit, le domaine : l'interface envoie la combinaison pressée et dit le refus que la commande renvoie.
- **Gardé dans les préférences** (`voice_shortcut`, écrit seulement s'il n'est pas celui de départ ; un raccourci illisible vaut le raccourci de départ ; `voice_beeps`, écrit seulement s'il est voulu), à côté de la langue ; le contrat de préférences, le faux et le vrai fichier le jouent à l'identique. Trois commandes : `voice_input_settings`, `choose_voice_shortcut`, `choose_voice_beeps` ; la saisie du raccourci et celle des bips sont permises pendant l'écoute.
- **Un seul raccourci, partout** : la liste des commandes (`state/commands.ts`) garde le raccourci de départ ; le raccourci choisi la remplace (`shortcutOf`) pour la table des touches, la palette, la bulle du micro et la barre des menus, qui se reconstruit quand il change (en gardant actives les commandes de l'aide à l'écriture). C'est un raccourci de l'application, pas un raccourci global du système : aucune autorisation de macOS de plus. Les combinaisons avec Option, que la fenêtre ne lit pas (Option change la lettre tapée), passent par la barre des menus, comme « Rechercher et remplacer ».
- **Saisie du raccourci** : un contrôle qui prend le focus au clic (Safari ne le donne pas à un bouton cliqué) et prend la touche pressée ; Échap, un second clic ou la perte du focus abandonnent. Sans changement à dessiner, rien n'est redessiné (un texte changé entre le bouton enfoncé et relâché fait perdre le clic dans WebKit).
- **Les bips sont fabriqués dans l'interface par Web Audio** (`app/voice-beep.ts`) : deux notes qui montent (660 puis 880 Hz, 80 ms chacune, volume 0,12, montée et descente de 10 ms) au début de l'écoute (événement `listening`), les deux mêmes à l'envers à la fin, y compris l'arrêt par le silence de trente secondes et l'erreur après l'écoute ; aucun pour un échec avant l'écoute. Un petit objet (`Beeper`) que les tests remplacent par un faux, aucune ressource binaire. Le navigateur ne laisse partir un son que si un geste l'a préparé : le clic ou le raccourci qui démarre la dictée, et la case cochée, préparent le contexte audio.

## Conséquences

- Le raccourci de départ reste Ctrl+Maj+D, la case des bips est décochée : sans rien toucher, rien ne change.
- Ce qui ne se vérifie qu'à la main : le son réellement entendu (les tests vérifient les notes demandées à Web Audio), et la prise d'une combinaison avec Option par la vraie barre des menus du Mac.
