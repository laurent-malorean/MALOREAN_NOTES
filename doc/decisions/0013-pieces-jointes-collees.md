# 0013 — Pièces jointes collées ou glissées : octets envoyés à Rust, nom décidé par le domaine

- **Date** : 2026-11-16
- **Statut** : acceptée

## Contexte

Une capture d'écran collée, une image ou un PDF glissé depuis le Finder doit devenir une pièce jointe de la note : un fichier dans son dossier `<note>.assets/`, et un lien inséré dans le texte. Le glisser-déposer de Tauri est coupé (`dragDropEnabled: false`, voir 0008) pour que la page reçoive ses propres glisser-déposer : la page ne connaît donc pas le chemin du fichier glissé, seulement son nom et son contenu.

## Décision

- **La page lit le fichier** (`File`, API du navigateur) et envoie ses **octets bruts** à la commande `attach_file`, sans passer par JSON. La note, le nom du fichier glissé ou le type du contenu collé voyagent dans des en-têtes encodés comme une adresse (`x-note`, `x-file-name`, `x-media-type`).
- **Le nom est décidé dans le domaine** (`AttachmentName`) : un fichier glissé garde son nom, rendu sûr (séparateurs, `#`, `?`, `%`, crochets et chevrons remplacés, fichier caché refusé, nom raccourci au-delà de 100 caractères) ; un contenu collé est nommé d'après le moment, `image-2026-11-16-1830.png` (`document-…` pour un PDF). Un nom pris reçoit le premier suffixe `-2`, `-3`… libre, sans tenir compte de la casse (le disque du Mac l'ignore).
- **Le moment vient du port `Clock`** : seule l'horloge réelle de l'infrastructure lit l'heure (`chrono`, lecture interdite ailleurs par Clippy) ; les tests passent une horloge arrêtée.
- **Seuls les images (PNG, JPEG, GIF, WebP, HEIC, TIFF, SVG) et les PDF** sont acceptés, **50 Mo au plus** (`MAX_ATTACHMENT_MEGABYTES`). Le reste est refusé avec un message.
- **Le stockage n'écrase jamais** : fichier temporaire puis lien physique sous le vrai nom, qui échoue si le nom est pris.
- **Lien inséré** : `![](note.assets/nom.png)` pour une image (affichée par l'aperçu en direct), `[nom.pdf](note.assets/nom.pdf)` pour un PDF ; espaces et parenthèses encodés.
- **Ouvrir un PDF** : Cmd+clic sur le lien. Rust vérifie que la cible est une pièce jointe de la note (dans son dossier `.assets`, nom sûr), puis l'ouvre avec l'application du Mac (`tauri-plugin-opener`, appelé depuis Rust seulement : la page n'a aucune permission d'ouvrir quoi que ce soit).

## Conséquences

- Une capture collée n'a pas de nom parlant ; on peut la renommer dans le Finder (le lien est alors à corriger à la main).
- Un fichier de plus de 50 Mo ne peut pas être joint ; il reste possible de le copier soi-même dans le dossier `.assets`.
- Le dossier de pièces jointes suit déjà la note quand elle est renommée ou déplacée, et ses liens sont réécrits (0002, 0008) : les liens insérés restent valides.
