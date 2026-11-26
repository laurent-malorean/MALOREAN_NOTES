# 0054 — Essai de l'application réelle : l'application joue elle-même ses scénarios

- **Date** : 2026-11-24
- **Statut** : acceptée, demande de l'utilisateur
- **Complète** les fiches 0004 (stratégie de tests), 0049 (CI) ; naît de cinq défauts de la semaine passés sous des tests verts.

## Contexte

Les tests d'interface (Vitest dans WebKit, Playwright) parlent à un faux Rust. Ils ne passent jamais par la vraie application : fenêtre de recherche écrasée à hauteur zéro dans WKWebView, export PNG refusé (le corps brut de l'IPC de Tauri devenait du JSON à la bascule sur `postMessage`), image exportée aux nœuds décalés (`foreignObject`), ajout d'une image dans un canvas qui n'ajoute rien, et plus généralement le chemin réel IPC, fichiers, protocole des fichiers. Aucun test vert ne les voyait.

## Décision

Un **mode d'essai** : l'application construite pour l'essai (le vrai `.app`, le vrai WKWebView, la vraie IPC, le vrai Rust, de vrais fichiers) joue elle-même des scénarios au démarrage, mesure ce qu'elle montre, écrit un rapport JSON lisible et quitte. Aucun clic humain.

- **Activation** : deux variables d'environnement au lancement, `MALOREAN_ESSAI` (fichier du rapport) et `MALOREAN_ESSAI_ESPACE` (dossier de l'espace de travail temporaire). Sans elles, même l'application d'essai se comporte normalement.
- **Le code d'essai n'est pas dans l'application livrée** : côté Rust, la fonctionnalité Cargo `essai` de la crate `app` (module `essai.rs`, ses commandes et le branchement dans `main.rs`) ; côté interface, la constante de compilation `__ESSAI__` (Vite, tirée de `MALOREAN_ESSAI_BUILD=1`) qui garde un `import()` dynamique : faux, la branche et le dossier `ui/src/essai/` disparaissent du paquet. `scripts/test-essai-application.sh` le prouve (aucune commande d'essai dans l'interface normale). Un chargement dynamique « inerte » n'aurait pas suffi : le code serait resté dans l'application.
- **Isolation de l'utilisateur** : le script construit avec un autre identifiant (`com.malorean.notes.essai`) et un autre nom de produit. Préférences, dossier de données, index et stockage web de l'essai sont donc séparés de ceux de l'utilisateur, et refaits à neuf à chaque essai. Les espaces de travail sont dans un dossier temporaire ; rien ne vient de `data_fake`. Seul le modèle de sens de l'utilisateur est cloné (lecture seule chez lui) pour que la colonne « idées » puisse répondre.
- **Commandes de l'essai (Rust, fonctionnalité `essai`)** : `essai_settings` (les deux emplacements, ou rien), `essai_write_report` (écriture d'un coup : fichier voisin puis renommage), `essai_read_file` (lit un fichier du disque, en base64, pour mesurer ce que Rust a écrit), `essai_set_destination` et un remplacement de `choose_export_file`, `essai_quit`. Les boîtes de dialogue natives de macOS ne se pilotent pas : la fenêtre d'enregistrement est remplacée (si l'environnement demande un essai) par la réponse donnée avant le geste ; le choix de fichier du canvas est un point de remplacement de l'interface (`fileChoice` dans `app/canvas-host.ts`), inerte par défaut. Le rapport le répète : **ces boîtes ne sont pas couvertes**.
- **Scénarios** (`ui/src/essai/scenarios/`) : ils appellent le vrai pont (`ui/src/bridge`) et les vraies commandes, agissent comme l'utilisateur (boutons de la barre du canvas, événements du pointeur sur les ronds de liaison, bouton « Exporter en image »), et mesurent le DOM réel (rectangles, styles calculés, `naturalWidth`, `elementFromPoint`) et les fichiers. Une vérification ratée n'arrête pas le scénario, une erreur oui ; un scénario bloqué échoue au délai de 90 s. Pas d'adaptation d'un scénario pour le faire passer : un défaut de l'application se lit dans le rapport.
- **Rapport** : `version`, durée, fenêtre réelle (taille, moteur), ce qui n'est pas couvert, et par scénario : statut, vérifications (nom, réussie ou non, mesure), mesures, notes, erreur. `scripts/essai-rapport.mjs` le rend lisible et rend le code de sortie : 0 tout réussi, 1 un échec, 2 rapport illisible.
- **Script** : `scripts/essai-application.sh` construit l'interface d'essai (`build/ui-dist-essai`) puis le `.app` (`tauri build --features essai`, mêmes commandes que `doc/developpement/architecture.md`), prépare les espaces de travail, lance le programme avec les variables, attend le rapport (délai de 300 s par défaut, puis arrêt du processus), l'affiche. Code de sortie : 0, 1, ou 2 sans rapport. **Une fenêtre de l'application s'ouvre quelques secondes sur l'écran de l'utilisateur.**
- **Hors de la barrière et de `--fonction`** : la construction du `.app` est longue. C'est un contrôle à lancer à la demande avant une livraison. Seules ses preuves (`scripts/test-essai-application.sh`, avec une fausse application) passent dans la barrière quand un script change.

## Ce que l'essai ne couvre pas

- Les boîtes de dialogue natives (choix de fichier, enregistrement), l'impression, le presse-papiers du Mac.
- Les gestes réels du clavier et de la souris : ils sont simulés par des événements du pointeur, pas par le système.
- Le thème clair ; la fenêtre en plein écran ; les autres tailles d'écran (la fenêtre a la taille de `tauri.conf.json`).
- Le téléchargement d'un modèle de sens, Claude Code, l'aide à l'écriture.

## Conséquences

- `ui/src/main.ts` gagne une ligne (le chargement conditionnel) ; sa limite de 150 lignes est tenue en fusionnant les deux lignes de commentaire du haut.
- La logique de l'essai (`runner`, `png`, `conduct`, `wait`, `report`) est testée par Vitest ; `index.ts` et `scenarios/` sont exclus de la couverture et de la mutation : leurs scénarios sont eux-mêmes le test.

## Premiers constats (24/11/2026)

- Sur le code d'avant la correction des pièces jointes (`394d7da`), l'essai voyait : `attach_file` refusé (« le fichier à joindre n'a pas été reçu en entier »), donc aucune carte image ajoutée au canvas, ni flèche, ni réouverture complète.
- Sur `main` après cette correction : ajout d'une image, flèche, réouverture, export de la carte mentale, pièce jointe d'une note et fenêtre de recherche (sombre, 400 notes) réussissent.
- Reste un défaut que seule la vraie application montre : l'export PNG du canvas dessine **sans ses images**. `fetch` d'une image du protocole des fichiers est refusé dans la vraie fenêtre (« Load failed » ; la politique de sécurité du contenu n'ouvre que `img-src` aux adresses `asset:`), et `canvas-image.ts` avale l'erreur et laisse l'image vide.
- Corrigé le 24/11 par la branche `canvas-export-images` : la politique de sécurité du contenu ouvre `connect-src` aux adresses `asset:` et l'export refuse une image illisible (fiche 0052). Essai réel : 7 scénarios réussis, la carte image du canvas exporté est dessinée (36 502 points, au moins 19 200 attendus).
