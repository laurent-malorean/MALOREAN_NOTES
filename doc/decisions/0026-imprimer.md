# 0026 — Imprimer : la feuille d'impression de l'export, dans la fenêtre d'impression du Mac

- **Date** : 2026-11-18
- **Statut** : acceptée

## Contexte

On veut imprimer une note, mise en forme exactement comme l'export PDF (fiche 0025) : titres, emphase, listes, code coloré, tableaux, images, sans la syntaxe Markdown ni l'interface de l'application, dans le thème clair et la police de lecture. L'utilisateur choisit l'imprimante, ou garde un PDF par le bouton « PDF » de la fenêtre d'impression du Mac.

Pistes regardées :

- **`window.print()` ou `Webview::print()` de Tauri** : la fenêtre d'impression s'ouvre, sans code natif à nous. Mais Tauri ne passe aucune option : WebKit imprime avec des marges nulles (le texte collé au bord du papier), pas les 2 cm de l'export PDF ; et `window.print()` demande en plus d'ouvrir la permission `core:webview:allow-print` à la page. Rejeté : l'impression ne ressemblerait pas au PDF exporté.
- **Le module natif de l'export PDF (`pdf.rs`)** : la même opération d'impression de WebKit (`printOperationWithPrintInfo`, impression modale attachée à la fenêtre), avec les mêmes marges, mais la fenêtre d'impression et la barre de progression montrées, et sans fichier imposé. Quelques lignes de plus, aucun bloc `unsafe` nouveau : le réglage de la page et le lancement sont mis en commun. Retenu.

## Décision

- **Action « Imprimer… »** sur la note de la colonne active (palette, **Cmd+P**, libre dans l'application, dans l'éditeur et dans le menu par défaut de Tauri ; la palette reste sur Cmd+Maj+P) ou sur la note cliquée (menu d'une note dans la liste, après « Exporter… » ; menu d'un onglet, en dernier). Ce qui est tapé est enregistré d'abord.
- **Même rendu que l'export** : le module d'export de l'interface (`app/export.ts`) pose le rendu HTML de la note (`noteHtml`) sur la feuille d'impression et attend ses images (`prepareSheet`, partagé), puis appelle `print_page`. Aucune copie du rendu ni de la feuille de style d'impression.
- **Rust** : commande `print_page` ; `pdf.rs` gagne `print_with_panel`, qui partage avec `print_to_pdf` le format de page (marges de 2 cm) et le lancement de l'impression modale. La commande répond dès la fenêtre d'impression ouverte. L'exception `unsafe` de `doc/developpement/code.md` couvre ce module, sans changer de forme.

## Conséquences

- L'impression, et le PDF gardé depuis la fenêtre d'impression, ressemblent à l'export PDF.
- Le code d'impression n'est vérifié que par l'essai réel : ni les tests de Rust (le simulateur de Tauri n'a pas de WebKit) ni les parcours ne l'exécutent. Les tests couvrent ce qui l'entoure : note enregistrée, rendu posé sur la feuille avant l'appel, images attendues, commande appelée.
- La feuille d'impression garde la dernière note imprimée ou exportée jusqu'au prochain usage ; elle reste cachée à l'écran.
