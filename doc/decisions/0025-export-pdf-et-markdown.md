# 0025 — Export PDF et Markdown : le Markdown écrit par Rust, le PDF imprimé par WebKit

- **Date** : 2026-11-18
- **Statut** : acceptée

## Contexte

On veut écrire une note hors de l'espace de travail, en PDF (mise en forme : titres, emphase, listes, citations, code coloré, tableaux, images, liens, sans la syntaxe Markdown, dans le thème clair et la police de lecture) ou en Markdown, à l'endroit choisi dans la fenêtre d'enregistrement du Mac. Sans service payant ni dépendance lourde. Le rendu HTML de la note servira aussi à « Imprimer » et à « Copier en texte mis en forme ».

Pistes regardées pour le PDF :

- **Un moteur PDF en Rust** (Markdown → HTML par `pulldown-cmark`, puis mise en page par `printpdf`, `genpdf` ou Typst) : il faudrait refaire la mise en page du texte, la coupure en pages, les polices, les images et la coloration du code ; Typst est lourd. Rejeté.
- **`window.print()` ou `Webview::print()` de Tauri** : la fenêtre d'impression du Mac s'ouvre ; on ne choisit pas le fichier dans une fenêtre d'enregistrement préremplie. Gardé pour « Imprimer ».
- **`WKWebView.createPDF`** : une seule page aussi haute que le texte, sans coupure en pages. Rejeté.
- **`WKWebView.printOperation` avec une impression « enregistrer » (`NSPrintSaveJob`) vers un fichier, sans fenêtre** : le moteur de la fenêtre (WebKit) met la page en pages A4 (ou au format du Mac), applique la feuille de style d'impression, garde le texte sélectionnable et les liens ; aucune dépendance nouvelle (`objc2-*`, déjà tirés par Tauri). Essayé hors de l'application : huit pages correctes pour deux cents paragraphes, l'interface cachée par `@media print`. L'impression synchrone (`runOperation`) donne des pages blanches, WebKit dessinant dans un autre processus : seule l'impression modale (asynchrone) convient. Retenu.

## Décision

- **Action « Exporter… »** sur la note de la colonne active (palette, Cmd+E, libre dans l'application et dans l'éditeur) ou sur la note cliquée (menu d'une note dans la liste). Le format (PDF ou Markdown) se choisit au clavier, puis Rust ouvre la fenêtre d'enregistrement du Mac (`tauri-plugin-dialog`), le nom tiré du titre (`/` et `:` remplacés, règle du domaine `export`), dans le dossier du dernier export (gardé par la page, pour toute l'application) ou à défaut dans Documents. Ce qui est tapé est enregistré d'abord.
- **Markdown** : le fichier de la note **tel quel, en-tête compris** (aucune information perdue). Si la note a des pièces jointes, elles sont **copiées** dans `<nom du fichier exporté>.assets/` à côté du fichier exporté, et les liens vers son dossier de pièces jointes sont réécrits vers ce dossier (règle pure `exported_markdown`). Cas d'usage `ExportMarkdown` ; nouveau port `ExportStore` (adaptateur `FsExportStore`, contrat joué sur le faux et le vrai disque) ; le port `NoteStore` gagne `read_attachment`.
- **Rendu HTML** : un module de l'interface, `ui/src/rendering/note-html.ts` (`noteHtml(markdown, {resolveImage})`), lit la note avec **le même analyseur que l'éditeur** (Lezer, Markdown GitHub) et colore le code avec les mêmes langues (`@codemirror/language-data`) et les mêmes classes que l'éditeur (`syntax-*`, couleurs du thème). Il est fait côté interface plutôt qu'en Rust : il faut l'analyseur et les langues de l'éditeur pour que le rendu ressemble à l'aperçu en direct, et les images se chargent par le protocole `asset` de la page (fiche 0007). Le HTML écrit dans la note n'est pas interprété (il reste du texte) ; l'en-tête est retiré ; un lien entre notes devient son texte.
- **PDF** : la page pose le rendu sur la **feuille d'impression** (élément caché à l'écran), attend ses images, puis appelle `export_pdf(destination)`. Rust lance l'impression de la fenêtre principale en PDF (`printOperationWithPrintInfo`, `NSPrintSaveJob`, `NSPrintJobSavingURL`, marges de 2 cm, ni fenêtre d'impression ni barre de progression). La feuille de style d'impression ne montre que la feuille d'impression, dans les couleurs claires du thème (redéfinies sur elle) et la police de lecture.
- **Code `unsafe`** : l'appel à WebKit et AppKit passe par `objc2`, donc par du code `unsafe`. Il agit sur la fenêtre que tient Tauri, qu'`infrastructure` ne connaît pas : il vit dans **un seul module d'`api`** (`pdf.rs`, macOS seulement), avec `#![expect(unsafe_code, reason = …)]` et un `// SAFETY:` par bloc (exception ajoutée à `doc/developpement/code.md`).

## Conséquences

- Le PDF ressemble à la note telle qu'on la lit dans l'application, sans moteur à maintenir ; il dépend de WebKit, déjà là.
- WebKit écrit le fichier un instant après la réponse de la commande : une erreur d'écriture du PDF (disque plein, droits) n'est pas rapportée à la page.
- Le code d'impression n'est vérifié que par l'essai réel : ni les tests de Rust (simulateur Tauri) ni les parcours ne l'exécutent. Les tests couvrent tout ce qui l'entoure (fichier choisi, rendu, feuille d'impression, emplacement refusé).
- « Imprimer » réutilise la feuille d'impression et le rendu, avec la fenêtre d'impression du Mac ouverte par le même module natif (fiche 0026) ; « Copier en texte mis en forme » réutilisera `noteHtml`.
- Les pièces jointes sont toutes copiées, même celles qu'aucun lien ne vise plus ; un fichier exporté remplace celui du même nom (la fenêtre d'enregistrement l'a fait confirmer), comme les pièces jointes du même nom dans le dossier copié.
- L'export n'est pas encore dans le menu d'un onglet.
