# 0039 — Fenêtre « À propos » : une fenêtre de l'interface, son site ouvert par Rust

- **Date** : 2026-11-20
- **Statut** : acceptée
- **Remplace**, pour l'élément « À propos de MALOREAN Notes » seulement, l'élément standard du Mac prévu par la fiche 0029.

## Contexte

Demande du 19/11 : « À propos de MALOREAN Notes », dans le menu de l'application, montre l'icône, le nom, la version, « Réalisée par Laurent Deséchalliers » et « Malorean.net », cliquable, qui ouvre https://malorean.net dans le navigateur. La fenêtre « À propos » standard du Mac (celle que Tauri sait remplir) ne rend pas un lien cliquable : son texte de crédits est du texte simple, et son champ « site web » n'existe pas sur Mac.

## Décision

- **Une commande « À propos de MALOREAN Notes »** (`about`) remplace l'élément standard : dans le menu de l'application et la palette, sans raccourci. Elle ouvre une petite fenêtre de l'interface (`openAbout`), dans le style des autres fenêtres de l'interface (jetons du thème, clair et sombre) : icône de l'application, nom, version, auteur, lien « Malorean.net », bouton « OK » (Échap la ferme aussi).
- **La version vient du `package.json` de l'interface**, que la configuration de Tauri désigne comme source de sa propre version (`"version": "../../ui/package.json"`) : une seule version, lue au même endroit par l'application et par la fenêtre.
- **Le site s'ouvre par Rust** : commande `open_web_address`, qui n'accepte qu'une adresse web (même règle que la cible d'un lien Markdown, `WebAddress`) et la passe au navigateur du Mac, comme `open_link_target`. Rien d'autre ne s'ouvre ainsi.
- L'icône de l'application est copiée dans l'interface (`ui/src/assets/app-icon.png`, 128 pixels) : l'interface ne lit pas les fichiers hors de son dossier.

## Conséquences

- Une icône changée se recopie dans l'interface.
- Tests : écran WebKit pour la fenêtre (contenu, lien ouvert dans le navigateur, « OK ») ; parcours Playwright depuis la barre des menus ; test Rust du refus de ce qui n'est pas une adresse web.
