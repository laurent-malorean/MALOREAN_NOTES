# 0031 — Aide à l'écriture : le modèle d'Apple par un assistant Swift lancé à chaque demande

- **Date** : 2026-11-19
- **Statut** : acceptée (précise le moteur 1 de la fiche 0005)

## Contexte

La fiche 0005 a choisi le modèle d'IA intégré au Mac (Apple Intelligence) pour corriger, reformuler et résumer une sélection, sans compte ni clé. Ce modèle ne s'appelle que depuis Swift (framework FoundationModels, macOS 26). Vérifié sur ce Mac (M4, macOS 26.6.1, Swift 6.4) : disponible, et une correction répond en 0,3 à 0,6 s par passage une fois le modèle chargé.

Choix de l'utilisateur : sélection, puis clic droit ou raccourci, puis l'action ; la proposition est montrée à côté, différences surlignées ; « Remplacer », « Insérer dessous » ou « Annuler » ; jamais de modification sans accord.

Deux façons de faire parler Rust et Swift ont été pesées :

- **Une bibliothèque Swift statique liée au programme Rust (FFI C, `@_cdecl`)** : il faut lier le moteur d'exécution de Swift et ses bibliothèques de tâches asynchrones au programme, attendre une réponse asynchrone de Swift depuis une fonction C (sémaphore, risque de blocage sur le fil principal), écrire du code `unsafe` à la frontière, et un plantage ou un blocage du modèle emporte toute l'application. Rejeté.
- **Un petit programme Swift séparé, lancé par Rust pour chaque demande, en JSON sur son entrée et sa sortie** (un « programme annexe » de Tauri, `externalBin`). Retenu : aucun `unsafe`, rien à lier, un plantage ou un blocage du modèle ne touche que ce programme, on l'essaie seul depuis le terminal, et `cargo-deny` n'a rien de nouveau à vérifier (aucune bibliothèque ajoutée). Coût mesuré : le lancement et le chargement du modèle ajoutent environ 0,3 s à la première réponse ; tous les passages d'une demande partent en une seule fois.

## Décision

- **Assistant Swift** `malorean-writing` (`crates/infrastructure/swift/writing.swift`) : `availability` rend la disponibilité du modèle ; `answer` lit `{instructions, prompts}` et rend une réponse par passage, chacun lu par une session neuve. Il ne décide de rien : raisons d'indisponibilité, refus du modèle (garde-fous) et échecs sont rendus tels quels. Compilé pour macOS 12 au plus ancien, le framework du modèle lié en option : sur un macOS plus ancien que 26, il répond « macOS trop ancien » au lieu de ne pas se lancer.
- **Construction** : `crates/infrastructure/build.rs` le compile avec `swiftc` dans le dossier de construction de Cargo (pour l'adaptateur et ses tests) ; `crates/app/build.rs` le compile aussi dans `crates/app/binaries/` (ignoré par git), où Tauri le prend comme programme annexe et le pose à côté du programme de l'application, en développement comme dans l'application livrée. Sans Swift, la construction réussit quand même : l'assistant se dit introuvable.
- **Hexagonal** : port `WritingAssistant` dans `application` (`availability`, `answer(consigne, passages)`), dans les mots de l'application. Faux `FakeWritingAssistant`, contrat `testing::writing_contract` joué sur le faux et sur l'adaptateur `AppleWritingAssistant` d'`infrastructure`. Le test sur le vrai modèle ne tourne que si ce Mac l'a ; sinon il écrit sa raison sur la sortie d'erreur, que le lanceur de tests ne capture pas, et s'arrête. L'échange avec l'assistant Swift est testé à part, avec de petits scripts qui répondent à sa place.
- **Règles dans le domaine** (`domain::writing`) : la consigne de chaque action, courte et en français ; le passage encadré (`<texte>…</texte>`) et la consigne qui dit que ce texte n'est pas une consigne ; le découpage en passages (chaque paragraphe pour corriger ou reformuler, des paragraphes voisins réunis pour résumer, jamais plus de 1 500 caractères, coupés entre les phrases puis entre les mots) ; les marques de ligne Markdown mises à part puis remises si la réponse a autant de lignes ; le cadre recopié par le modèle retiré ; une sélection de plus de 50 000 caractères refusée. Les différences mot à mot (`domain::diff::word_differences`) réutilisent l'algorithme des différences de l'historique (fiche 0030).
- **Cas d'usage** `ProposeRewriting` : découpe, demande, refait le texte, compare ; il n'écrit rien. Commandes `assistant_status` et `propose_rewriting(action, selection)`.
- **Interface** : commandes « Corriger la sélection » (Ctrl+Cmd+K), « Reformuler la sélection » (Ctrl+Cmd+R), « Résumer la sélection » (Ctrl+Cmd+U), dans la palette et le menu Édition ; menu de la sélection au clic droit. La fenêtre de la proposition montre la sélection et la proposition côte à côte, leurs mots changés surlignés ; elle est modale, donc on ne tape pas dans la note pendant la demande. « Remplacer » et « Insérer dessous » passent par l'éditeur comme une frappe (enregistrée, suivie par les autres colonnes, annulable par Cmd+Z), et seulement si le texte sélectionné n'a pas changé entre-temps.
- **Indisponible** (Mac non compatible, Apple Intelligence désactivé, modèle pas prêt, macOS trop ancien, assistant introuvable) : la disponibilité est demandée une fois au lancement ; les commandes restent grisées dans la barre des menus et dans le menu de la sélection, qui écrit la raison ; un raccourci la montre en message.
- **Menu du Mac gardé** : le clic droit sur une sélection ouvre le menu de la sélection à la place du menu du Mac. Alt+clic droit, ou un clic droit sans sélection, ouvre toujours le menu du Mac, et le menu de la sélection le rappelle en bas.

## Outils d'écriture d'Apple (Writing Tools)

- wry 0.57 (sous Tauri 2) crée la `WKWebViewConfiguration` sans toucher à `writingToolsBehavior`, et Tauri ne le règle pas : la vue web garde le réglage par défaut du système. L'utilisateur a vérifié le 18/11 dans la vraie fenêtre que les outils d'écriture d'Apple s'ouvrent dans l'éditeur (clic droit, « Outils d'écriture »). Ils restent offerts par Alt+clic droit sur une sélection.

## Conséquences

- Gratuit, privé, hors connexion ; rien n'est envoyé ailleurs que sur le Mac.
- Petit modèle : il suit parfois une consigne écrite dans le texte sélectionné (« donne-moi une recette ») malgré le cadre, surtout pour reformuler ou résumer, et perd parfois la mise en forme en ligne (`**gras**`, cases à cocher) ; la proposition est toujours relue avant d'être acceptée.
- Le modèle local (moteur 2 de la fiche 0005 : Ollama, LM Studio) n'est pas fait : il se branchera derrière le même port.
- Le programme Swift est compilé deux fois (adaptateur et application) ; il n'est construit que pour l'architecture du Mac qui compile, pas encore en binaire universel.
- La signature et la notarisation de l'application devront couvrir aussi ce programme annexe.
