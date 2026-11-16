# 0007 — Images des notes : chargées par le protocole `asset` de Tauri

- **Date** : 2026-11-16
- **Statut** : acceptée

## Contexte

L'aperçu en direct affiche les images citées dans une note (`![texte](voyage.assets/mer.png)`). Ces fichiers sont sur le disque, dans la bibliothèque ; la fenêtre, elle, ne peut charger que des adresses. Deux voies : une commande qui lit l'image et la renvoie encodée dans le message (lent et lourd pour les grandes images), ou le protocole `asset` de Tauri, qui sert un fichier du disque directement à la fenêtre.

## Décision

- Protocole `asset` de Tauri, **sans aucun dossier autorisé au départ**. À l'ouverture d'une bibliothèque, son dossier (et ses sous-dossiers) devient lisible par la fenêtre ; rien d'autre sur le disque.
- Une adresse relative est cherchée dans le dossier de la bibliothèque ; une adresse web (`https:`) ou intégrée (`data:image/…`) est gardée telle quelle ; tout autre protocole (`file:`, `javascript:`) n'est pas chargé.
- La politique de sécurité de la fenêtre n'autorise les images que depuis l'application, `data:`, `asset:` et `https:`.

## Conséquences

- Images affichées sans copie ni encodage, quelle que soit leur taille.
- Une bibliothèque ouverte auparavant reste lisible jusqu'à la fermeture de l'application : Tauri ne sait pas retirer une autorisation sans l'interdire pour toujours.
- Une image distante charge le site qui l'héberge : c'est le comportement attendu d'une note Markdown.
