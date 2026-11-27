# Qualité du code — bonnes pratiques (Rust, application macOS)

Le guide pour garder le code propre. Vocabulaire : `doc/ontology.md`. Architecture : `doc/developpement/architecture.md`. Chaque règle dit **comment on la vérifie** ; une règle sans vérification est un vœu.

Les seuils ci-dessous sont des **cibles**. Un dépassement existant est suivi dans `TODO.md` (« Qualité du code ») ; on ne l'aggrave pas, et on le réduit quand on touche au code concerné.

---

## 1. Architecture en couches

Application Tauri 2 : un workspace Cargo (une crate par couche) et une interface web en TypeScript.

| Couche | Rôle | Dépend seulement de |
|---|---|---|
| `domain` | Règles pures | rien (hors `thiserror`) |
| `application` | Cas d'usage, ports (traits) | `domain` |
| `infrastructure` | Adaptateurs de sortie (fichiers, système macOS) | `application`, `domain` |
| `api` | Pont Tauri : commandes et événements | `application`, `domain` |
| `app` (binaire Tauri) | Assemblage : seul endroit qui connaît toutes les couches | tout |
| `ui/` (TypeScript) | Interface : écrans, éditeur CodeMirror 6 | les commandes de `api`, rien d'autre |

- **Sens des dépendances** : jamais à l'envers. `api` ne dépend jamais d'`infrastructure` ; `domain` et `application` ne dépendent ni d'`api` ni d'`infrastructure` ; `ui/` ne parle qu'aux commandes de `api`. *Vérifié par : le compilateur — une crate ne peut utiliser que ce que son `Cargo.toml` déclare. Toute nouvelle dépendance entre crates se relit en revue.*
- **Assemblage** : on crée et on relie les objets dans `app/src/main.rs` seulement.
- **Dépendances externes** : déclarées une fois dans `[workspace.dependencies]`, avec leur version. Le domaine n'en ajoute pas sans raison écrite.
- **Ajouter une dépendance, c'est en adopter toutes ses dépendances** : avant de l'ajouter, regarder l'arbre complet qu'elle amène (`cargo tree -p <crate>`, puis `cargo deny check` sur une copie du changement) : licence de chacune, entretien (dernière version, avis « non entretenue »), failles connues, poids ajouté à l'application et à la compilation. Un problème trouvé (dépendance non entretenue, faille, licence hors liste) **se remonte à l'utilisateur** avec ce qu'elle fait, le risque réel et les pistes (autre dépendance, mise à jour, exception) ; personne ne le contourne seul. Une exception dans `deny.toml` (avis ignoré, licence ajoutée) n'est écrite qu'avec l'accord de l'utilisateur, avec en commentaire son motif, sa date et la condition de son retrait. *Vérifié par : `cargo deny` dans `scripts/ci.sh` ; revue pour l'analyse.*

## 2. Séparation des responsabilités

- **Domaine pur** : pas de fichier, de réseau, d'horloge, d'aléa, de journal, de thread, d'`async`. Seulement des types de données et des fonctions qui rendent une nouvelle valeur. Une règle qui change le comportement de l'application vit ici.
- **Application = intentions** : un type par intention, nommé par un verbe (`AddNote`, `RenameNote`). Il lit via les ports, applique les règles du domaine, écrit via les ports. Il ne sait rien de l'interface ni des fichiers.
- **Pont mince** : une commande Tauri fait trois choses : lire la requête, appeler **un** cas d'usage, mettre la réponse en forme. Pas de règle métier, pas de calcul sur les données, pas d'accès direct au stockage.
- **Interface sans règle** : `ui/` affiche et saisit ; toute règle et tout accès disque passent par une commande.
- **Une règle, un endroit** : tous les points d'entrée (écrans, raccourcis, menus, ligne de commande éventuelle) appellent les mêmes cas d'usage.
- **Infrastructure** : implémente les ports, rien d'autre. Elle ne décide d'aucune règle.
- **Ports petits** : un trait par rôle (`NoteStore`, `Trash`, `History`…). Un cas d'usage ne dépend que des rôles qu'il utilise.
- **Ports dans les mots de l'application** : un port de sortie parle de notes, de dossiers, d'étiquettes — jamais de chemins, d'octets ou de JSON. C'est l'adaptateur qui traduit. *Vérifié par : revue ; un type de `std::fs`, `std::path` ou `serde_json` dans la signature d'un port est un défaut.*
- **Cœur pur, coque mince** : un cas d'usage suit toujours le même ordre : **lire** (ports), **décider** (une fonction pure du domaine), **écrire** (ports). La décision ne mêle aucun effet ; elle se teste sans aucun faux. *Vérifié par : revue ; un appel de port au milieu d'une décision est un défaut.*
- **Un invariant, un gardien** : une règle toujours vraie (un titre n'est pas vide, un nom de fichier suit le titre) est garantie par le type qui la porte, à sa construction, et nulle part ailleurs. Les champs de ce type sont privés ; on ne l'obtient que par un constructeur qui rend un `Result`. *Vérifié par : le compilateur (champs privés).*
- **Une erreur d'adaptateur ne traverse pas** : l'infrastructure traduit `std::io::Error` ou l'erreur d'une dépendance en erreur du port. Aucune couche au-dessus ne voit un type d'erreur technique.

## 3. Découpage par intention des données gardées

Une donnée gardée (mémoire, index, cache, fichier) sert un besoin et ne contient que ce qu'il lit. Pas de structure « à tout faire » partagée.

## 4. Code propre

- **Un seul mot par notion, partout (écrans, documents, code, tests) ; pas de synonymes ; le mot vient de `doc/ontology.md`.** Pas de mot pour deux choses non plus. Un mot remplacé reste noté « Autrefois … » dans l'ontologie, et ne s'emploie plus ailleurs (les fiches de décision, datées, gardent les mots de leur époque). *Vérifié par : contrôle « Vocabulaire » de `scripts/ci.sh`, qui refuse les anciens mots qu'il liste dans tout fichier du dépôt hors `doc/decisions/` ; revue pour le reste.*
- **Fonctions courtes** : 60 lignes au plus ; complexité 10 au plus ; 6 paramètres au plus (sans `self`). Au-delà : regrouper les paramètres dans un type, ou découper. *Vérifié par : Clippy (`too_many_lines`, `cognitive_complexity`, `too_many_arguments`, seuils dans `clippy.toml`).*
- **Fichiers** : 400 lignes visées, 600 au plus ; au-delà, découper en modules par sujet. *Vérifié par : `scripts/ci.sh`.*
- **Immutabilité** : les types du domaine n'exposent pas de méthode `&mut self` ; on fabrique une nouvelle valeur.
- **Types plutôt que conventions** : un identifiant, une unité, un statut a son propre type (`NoteId`, `enum Status`), pas un `String` ou un `u64` nu. Un état impossible ne doit pas pouvoir s'écrire.
- **Convertir à la frontière, une fois** : ce qui arrive du dehors (commande Tauri, fichier lu, préférence) est converti en type du domaine dès l'entrée (`TryFrom`, `FromStr`, constructeur qui rend un `Result`). Ensuite, plus aucune revalidation : si on a le type, la donnée est valide. Une fonction qui vérifie sans rien rendre (`fn is_valid(&str) -> bool`) est un signal d'alarme.
- **Pas de paramètre booléen qui change le comportement** : `save(note, true)` ne se lit pas. On écrit deux fonctions ou on passe un `enum` nommé. *Vérifié par : Clippy (`fn_params_excessive_bools`).*
- **Modules profonds** : un module offre une interface petite et cache beaucoup de travail. Il cache une décision (format du fichier, ordre de tri) que le reste du code n'a pas à connaître. Visibilité la plus étroite possible : privé par défaut, `pub(crate)` ensuite, `pub` seulement pour ce qu'une autre crate appelle. *Vérifié par : lint `unreachable_pub`.*
- **Pas de passe-plat** : une fonction ou un type qui ne fait que transmettre à un autre, sans rien ajouter, est supprimé. On découpe une fonction quand la partie extraite a un nom de l'ontologie et un sens seul, pas seulement pour passer sous un seuil.
- **Pas de valeur en dur** : une constante nommée pour chaque seuil, statut ou chaîne qui porte un sens. Une valeur qu'on voudrait régler sans toucher au code (apparence, limites, réglages par défaut) vit dans un fichier de configuration ou de thème, à un seul endroit.
- **Pas de code mort** : fonction, import, variable non utilisés sont supprimés. *Vérifié par : lints `unused` en erreur.*
- **Commentaires** : disent **pourquoi** et **l'intention**, pas ce que fait la ligne. Le `///` d'un élément public décrit ce qu'on obtient, dans le vocabulaire de l'ontologie, et une section `# Errors` dit dans quels cas il échoue. On écrit ce commentaire **avant** le code : s'il est difficile à écrire, l'interface est mal pensée. *Vérifié par : lints `missing_docs` et Clippy `missing_errors_doc`.*
- **Pas de duplication de règle** : la même règle écrite deux fois sera un jour écrite différemment. Mais on factorise une **règle**, pas une **ressemblance** : deux codes semblables qui répondent à deux besoins différents restent séparés. Une abstraction qui demande un nouveau paramètre ou un nouveau cas à chaque usage est mauvaise : on la défait (on recopie le code chez chaque appelant) puis on cherche la bonne.
- **Conventions Rust** : celles des *Rust API Guidelines*. Noms de conversion `as_` (gratuite), `to_` (coûteuse), `into_` (consomme) ; conversions par `From` / `TryFrom` plutôt que par des fonctions maison ; tout type public implémente `Debug`, et `Clone`, `PartialEq`, `Eq`, `Hash`, `Default` quand ils ont un sens. *Vérifié par : Clippy (`wrong_self_convention`) et lint `missing_debug_implementations`.*
- **Exception à un lint** : `#[expect(lint, reason = "…")]`, jamais `#[allow]` sans raison. *Vérifié par : Clippy (`allow_attributes`, `allow_attributes_without_reason`).*
- **Code `unsafe`** : interdit. Seule exception : une frontière FFI avec macOS, isolée dans `infrastructure`, avec `// SAFETY:` qui justifie chaque bloc ; ou, quand elle agit sur la fenêtre que tient Tauri (impression de l'interface, en PDF ou dans la fenêtre d'impression, fiches 0025 et 0026), dans un seul module d'`api` (`pdf.rs`), aux mêmes conditions. *Vérifié par : lint `unsafe_code` en erreur, levé localement avec raison.*

## 5. Erreurs

- **Erreurs métier typées** : un `enum` d'erreurs par crate (`thiserror`), une variante par cas (`AlreadyExists`, `VersionConflict`, `NoteNotFound`…), traduit en message pour l'utilisateur **à un seul endroit** de l'interface. `anyhow` n'est permis que dans `app`.
- **Pas de plantage caché** : pas d'`unwrap`, `expect`, `panic!`, `todo!` hors des tests. *Vérifié par : Clippy (`unwrap_used`, `expect_used`, `panic`, `todo`).*
- **Pas d'erreur avalée en silence** : un `Result` n'est jamais jeté (`let _ = …`). Il est propagé (`?`), journalisé, ou ignoré avec sa raison écrite. *Vérifié par : Clippy (`let_underscore_must_use`) et `#[must_use]`.*
- **Nettoyer en cas d'échec** : une écriture ratée ne laisse pas de demi-état (fichier temporaire puis renommage atomique).
- **Message lisible** : l'erreur dit ce qui s'est passé et ce qu'on peut faire.

## 6. Temps, aléa, environnement

- **L'horloge est injectée** : un cas d'usage la reçoit via le port `Clock` et ne lit jamais l'heure ailleurs. La seule horloge réelle vit dans `infrastructure`. Un test passe une horloge arrêtée (`FixedClock`). Même règle pour l'aléa et les identifiants. *Vérifié par : Clippy `disallowed_methods` (`SystemTime::now`, `Instant::now`, `jiff::ZonedDateTime::now`, `rand::thread_rng`…), levé une seule fois dans l'horloge réelle avec `#[expect(…, reason = …)]`.*
- **Configuration** : lue une fois, dans `app`, puis passée aux objets.
- **Journal** : `tracing`, jamais `println!` ni `dbg!`. *Vérifié par : Clippy (`print_stdout`, `print_stderr`, `dbg_macro`).*

## 7. Tests

- **TDD** : voir `CLAUDE.md`. Rouge, vert, nettoyer, par très petits pas. On tient une liste des cas à tester et on n'en écrit qu'un à la fois.
- **Un test par comportement**, nommé par ce qu'il garantit, dans le vocabulaire de l'ontologie.
- **Tester ce qui se voit, pas comment c'est fait** : un test passe par l'interface publique d'une couche (cas d'usage, type du domaine, port). Il ne teste pas une fonction privée et ne vérifie pas l'ordre des appels internes. Un remaniement qui ne change pas le comportement ne casse aucun test ; s'il en casse, le test est trop lié au code.
- **Préférer le résultat à l'interaction** : on vérifie d'abord la valeur rendue (domaine), puis l'état obtenu (le faux en mémoire contient la note). On ne vérifie un appel (« le port a été appelé ») que pour un effet vers l'extérieur qu'on ne peut pas observer autrement : un événement publié, un message envoyé.
- **Vocabulaire des doublures** : un **faux** (*fake*) est une implémentation simple et réelle d'un port (stockage en mémoire) ; un **bouchon** (*stub*) rend une réponse fixée ; un **espion** (*spy*) enregistre les appels. On utilise des faux par défaut ; pas d'outil de *mocks*.
- **Forme d'un test** : trois blocs, préparer, agir, vérifier, une seule action. Aucune logique dans un test (`if`, boucle, calcul du résultat attendu) : le résultat attendu est écrit en clair.
- **Répartition** : beaucoup de tests du domaine (rapides, sans doublure), des tests de cas d'usage sur les faux, des tests de contrat sur les vrais adaptateurs, très peu de tests de bout en bout.
- **Couche par couche** : domaine sans rien ; application avec les faux en mémoire (`application/src/testing/` ou crate `test-support`, et l'index en mémoire `MemoryIndex`) ; infrastructure avec de vrais fichiers dans un dossier temporaire (base SQLite comprise) ; interface sur sa logique hors écran.
- **Le faux et le vrai se ressemblent** : une même fonction de test de contrat, générique sur le port, est jouée sur le faux et sur l'implémentation réelle.
- **Un test qui dépend du Mac le dit** : le contrat de l'assistant d'écriture ne se joue sur le vrai modèle que si ce Mac a Apple Intelligence ; sinon le test écrit sa raison directement sur la sortie d'erreur (le lanceur de tests capture `eprintln!`, pas une écriture directe) et s'arrête. Le modèle ne répond jamais deux fois pareil : le contrat vérifie la forme des réponses, pas leurs mots.
- **Logique de l'interface hors de l'écran** : l'état d'un écran et ses transitions sont du code testable sans fenêtre.
- **Pas de test qui dépend de l'heure, de l'ordre ou du réseau.**
- **Un test doit pouvoir échouer** : s'il passerait même avec le défaut, il est réécrit. Un défaut trouvé se corrige en écrivant d'abord le test qui le montre.
- **Exceptions à « aucune logique dans un test »** : les tests de propriétés (une condition sur des données générées) et les tests de cohérence entre deux fichiers (toutes les commandes appelées par l'interface existent).

| Niveau | Où | Outil |
|---|---|---|
| Règles du domaine | `crates/domain` (unitaires) | `cargo test` |
| Propriétés sur des notes générées au hasard | `crates/domain/tests/properties.rs` | `proptest` |
| Cas d'usage, avec le faux stockage en mémoire | `crates/application` | `cargo test` |
| Contrat : mêmes tests sur le faux et le vrai stockage | `application::testing::contract`, joué par `crates/infrastructure/tests` | `cargo test` |
| Contrat de l'assistant d'écriture sur le vrai modèle d'Apple, seulement si ce Mac l'a (sinon la raison est écrite, jamais passée sous silence) ; l'échange avec l'assistant Swift, joué avec des scripts | `application::testing::writing_contract`, `crates/infrastructure/tests/apple_writing.rs` | `cargo test` |
| Contrat de Claude Code, joué sur le faux et sur l'adaptateur lancé avec un faux Claude Code (script qui note ses arguments, son dossier, son entrée et la clé d'API qu'il voit, puis rejoue un flux) ; traduction des flux enregistrés avec le vrai `claude` (chemins remplacés, rien de personnel) | `application::testing::claude_contract`, `crates/infrastructure/tests/claude_code_cli.rs`, `crates/infrastructure/src/claude_stream_tests.rs`, `crates/infrastructure/tests/claude_streams/` | `cargo test` |
| Disque réel : erreurs, droits, fichiers illisibles | `crates/infrastructure/tests` (dossiers temporaires) | `tempfile` |
| Commandes appelées comme par l'interface (noms, arguments JSON, origine) | `crates/api/tests/ipc.rs` | simulateur Tauri |
| Logique de l'interface, sans écran | `ui/src/**/*.test.ts` | Vitest |
| Écran et éditeur dans WebKit (le moteur de la fenêtre) | `ui/src/**/*.browser.test.ts` | Vitest, mode navigateur |
| Parcours utilisateur complets, partie Rust remplacée par un faux | `ui/e2e/` | Playwright, WebKit |
| Solidité des tests : erreurs introduites volontairement | tout le Rust | `cargo mutants` |
| Solidité des tests de l'interface | `ui/src` (tous les tests joués dans WebKit, `ui/vitest.stryker.config.ts`) | Stryker |

- **Tests d'écran : chaque fichier vise son propre cadre.** Vitest joue chaque fichier `*.browser.test.ts` dans un cadre (iframe) qu'il retrouve par son nom, le même pour tous les fichiers ; au démarrage d'un fichier, Playwright peut encore voir le cadre du fichier précédent, et une frappe ou un clic partait alors dans un cadre retiré (« Frame was detached »). Avant chaque fichier, `ui/test-support/test-frame-setup.ts` attend que ce nom désigne le cadre du fichier en cours (commande `waitForTestFrame`, `ui/test-support/test-frame.ts`), dans les deux configurations (`vite.config.ts`, `vitest.stryker.config.ts`). Pas de nouvelle tentative automatique. Un test d'écran ne dépend pas non plus de la vitesse de la machine : une annonce de CodeMirror (effacée après 200 ms) s'écoute au moment où elle paraît, et un test sur le regroupement de l'annulation (frappes espacées de plus de 500 ms séparées) arrête l'horloge (`vi.useFakeTimers({ toFake: ["Date"] })`).
- **Parcours : attendre que la note soit montrée avant d'écrire.** Une note s'ouvre après sa lecture par Rust (le faux répond lui aussi de façon asynchrone) : un clic ou une frappe dans l'éditeur juste après le lancement, ou juste après le clic dans la liste, visait parfois encore la note d'avant (ou un éditeur vide), et ce qui était tapé partait ailleurs. Les aides communes de `ui/e2e/journey.ts` attendent la note voulue : `openNote(page, titre)` (clic dans la liste puis attente, dans la première colonne ou une colonne donnée), `waitForNote(portée, première ligne)`, `waitForEmptyNote(portée)` (nouvelle note : une ligne, l'invite affichée) et `waitForLaunchedNote(page, notes)` (la note ouverte au lancement, appelée par les fonctions `launch` des parcours). **Contrôle permanent** : le faux peut ralentir la lecture des notes (`backend.readDelay`, réglé par le paramètre d'adresse `readDelay` ou, pour tous les parcours, la variable `VITE_READ_DELAY`), et la mini CI rejoue tous les parcours avec `VITE_READ_DELAY=100`. Choisi plutôt qu'un script à lancer à la main parce que le surcoût est faible (un passage de Playwright, 35 à 75 s mesurées le 18/11 selon la charge de la machine, sur une CI de 10 à 20 min) et qu'un oubli reviendrait sans bruit. Mesures du 18/11 avec la lecture ralentie à 100 ms : 16 parcours sur 114 échouaient avant les aides, 0 après (0 aussi à 300 ms).
- **Le généré est à part du code** (fiche 0055) : tout ce que les outils fabriquent va dans `build/` à la racine (sous-dossiers par outil : `ui-dist`, `ui-dist-essai`, `coverage`, `reports`, `test-results`, `playwright-report`, `stryker-tmp`, `vitest`), réglé dans `ui/vite.config.ts`, `ui/playwright.config.ts`, `ui/stryker.config.json` et `crates/app/tauri.conf.json`. `.gitignore` n'a qu'une ligne pour cela (`/build/`) ; `ui/` ne montre jamais de dossier généré. Un nouvel outil écrit dans `build/<outil>`, pas à côté du code. *Vérifié par : `scripts/test-ui-mutations.sh` (rien de généré dans `ui/`) et le passage complet de la CI.*
- **Seuils de couverture** (lignes exécutées par les tests) : Rust ≥ 95 % ; interface ≥ 98 % des lignes, instructions et fonctions, ≥ 94 % des branches. L'assemblage (`crates/app/src/main.rs`, `ui/src/main.ts`) est couvert par les tests des commandes et les parcours complets. **Un seuil ne baisse jamais** : quand la couverture monte, on le relève.
- **Test de mutation** : ce n'est plus une barrière de commit (fiche 0049 ; la fiche 0006 qui l'exigeait à chaque envoi est remplacée en partie). Il est ciblé et non bloquant. **Domaine** (`crates/domain`, règles pures) : après un commit qui le touche, en arrière-plan, sur le diff, tous les mutants, coupure des erreurs qui bouclent à 30 s ; un survivant s'écrit dans `.git/ci-mutation/suivi.txt`, jamais de refus. **Reste du Rust** : à la demande (`scripts/ci.sh --echantillon`), un dixième des erreurs du diff depuis le tag `ci-verte`, une erreur par fonction (les erreurs d'opérateurs une à une, de forme « replace X with Y in … », sont écartées), coupure 90 s ; et à la livraison. **Interface** (Stryker, incrémental) : à la demande (`--mutation-interface`). Seuil visé : 100 % des erreurs testées attrapées ; ce qui survit se traite depuis la liste de suivi. Une mutation « équivalente » (qui ne change rien) se supprime en simplifiant le code. Une mutation qui fait tourner un test jusqu'au délai maximal compte comme remarquée.
  - **Rust** : `cargo mutants --in-diff` sur les lignes pas encore commitées. Les copies mutées se construisent lints coupés (`cap_lints = true` dans `.cargo/mutants.toml`) : sans cela, les lints du projet (code inutilisé refusé) rendaient non compilables les deux tiers des erreurs introduites, jamais testées. La construction normale et Clippy restent stricts. Un passage où des erreurs ont été introduites mais aucune n'a pu être testée (toutes non compilables) est refusé : il n'a rien vérifié. Le verdict se lit dans le bilan (`mutants.out/outcomes.json`) et non dans le code de sortie, qui annonce un délai dépassé même quand une erreur est aussi passée inaperçue. Écartés, raison écrite dans `.cargo/mutants.toml` : les tests de contrat (ce sont des tests) et les deux commandes qui ouvrent une fenêtre de choix du Mac, que le simulateur de Tauri n'a pas.
  - **Interface** : Stryker en mode incrémental (`--incremental`). Il reteste les mutations dont le code, ou un test qui les couvre, a changé depuis son dernier passage, et reprend le résultat des autres, gardé dans `build/reports/stryker-incremental.json` (ignoré par git ; sans ce fichier, premier passage complet). Le score porte sur toutes les mutations, reprises comprises : une survivante, nouvelle ou ancienne, fait échouer la CI. Choisi plutôt qu'une liste des fichiers modifiés (`--mutate`) parce qu'il voit aussi un test affaibli ou supprimé qui laissait passer une mutation d'un fichier non modifié. Limite de Stryker : pour une mutation « statique » (code joué au chargement du module, comme une constante), il ne sait pas quels tests la couvrent, donc ne voit pas un test ajouté qui la tue et reprend son ancien résultat « survivante ». Aussi, quand le passage échoue, `scripts/ui-mutations.sh` reteste une fois les seules survivantes du bilan (`--force` limité à leurs lignes par `--mutate`, les autres résultats repris) et c'est ce second passage qui décide : un test ajouté ou modifié est toujours pris en compte, sans `--complet` ni retouche du fichier de résultats (jamais modifié à la main). Un test affaibli fait toujours échouer. Le surcoût ne porte que sur un passage en échec : un démarrage de Stryker et ses tests de départ, plus les survivantes. Scénarios de preuve (une survivante tuée par un test ajouté dans un autre fichier : réussite ; ce test affaibli : échec) : `scripts/test-ui-mutations.sh`, joué par la CI quand l'un de ces deux scripts change. Stryker ne compare pas les outils et réglages de test (`ui/test-support/`, `vitest.stryker.config.ts`, `stryker.config.json`, `package.json`, `package-lock.json`) : s'ils changent, la CI reteste tout. `--complet` reteste tout (`--force`) et refait le fichier.
  - Une mutation réellement équivalente côté interface (optimisation, garde exigée par TypeScript) est écartée par un commentaire `// Stryker disable … : raison`.

## 8. Interface (ui/, TypeScript + CodeMirror 6)

- **Ne jamais bloquer l'écran** : les commandes Tauri sont asynchrones ; tout travail long (disque, index, recherche) tourne côté Rust en arrière-plan. Aucun calcul lourd dans l'interface.
- **Un seul point de passage vers Rust** : seul `ui/src/bridge/` appelle `invoke` et écoute les événements. Les écrans n'appellent que ce module.
- **Types partagés générés** : les types échangés sont générés depuis Rust (`ts-rs`), jamais réécrits à la main. *Vérifié par : la mini CI régénère et refuse toute différence.*
- **TypeScript strict** : `strict`, `noUncheckedIndexedAccess` ; pas de `any` ; un `@ts-expect-error` ou un `eslint-disable` porte sa raison. *Vérifié par : `tsc --noEmit` et ESLint.*
- **Mêmes limites qu'en Rust** : 60 lignes par fonction, complexité 10, 6 paramètres, 600 lignes par fichier. *Vérifié par : ESLint (`max-lines-per-function`, `complexity`, `max-params`, `max-lines`).*
- **Les états d'écran sont des unions discriminées** : `{ kind: "loading" } | { kind: "ready"; notes: … } | { kind: "error"; message: … }`, jamais plusieurs booléens (`isLoading`, `hasError`) qui peuvent se contredire. Un `switch` sur `kind` traite tous les cas. *Vérifié par : ESLint avec analyse typée (`@typescript-eslint/switch-exhaustiveness-check` : un `switch` sur une union qui oublie un cas est refusé, même s'il a un `default`).*
- **`unknown` plutôt que `any`** pour une valeur venue du dehors ; on la convertit vers un type précis avant de s'en servir. Les données d'état sont `readonly`. *Vérifié par : ESLint avec analyse typée (`@typescript-eslint/prefer-readonly` : un membre privé d'une classe jamais réaffecté doit être `readonly`) ; les types de données d'état, eux, relèvent de la relecture.*
- **CodeMirror : l'état d'abord** : le document et la sélection ne changent que par des transactions ; une extension calcule l'affichage (décorations) à partir de l'état et ne touche jamais le DOM de l'éditeur directement.
- **Le fichier d'assemblage ne contient pas de logique.** `ui/src/main.ts` crée chaque partie et les relie entre elles, une ligne de branchement par domaine : ni condition, ni calcul, ni état. Le fonctionnement vit dans un module par domaine sous `ui/src/app/` (colonnes et onglets, espace de travail ouvert, liste des espaces de travail, dossiers, étiquettes, notes récentes, journal, recherche, corbeille, enregistrement, export, modifications extérieures, historique, aide à l'écriture, outils d'écriture, réglages, commandes et raccourcis, barre des menus, boutons de la fenêtre) ; chacun reçoit ce dont il a besoin en paramètre et se teste seul, avec des doublures (`ui/test-support/app-fixture.ts`). Une nouvelle fonction s'ajoute dans le module de son domaine, pas dans l'assemblage : deux évolutions de domaines différents ne touchent pas le même fichier. *Vérifié par : `scripts/ci.sh` (150 lignes au plus pour `ui/src/main.ts`) et revue.*
- **Un module = un écran ou un sujet.** Éditeur : une extension CodeMirror par fonctionnalité (mise en forme en direct, mode focus, collage d'images) dans `ui/src/editor/`.
- **Logique hors du navigateur** : état d'écran, transitions et calculs dans des modules sans DOM, testés avec Vitest.
- **Aucune règle métier** dans l'interface : elle appelle les commandes.
- **Apparence dans le thème** : couleurs (thème clair et sombre), polices et tailles de lecture ne s'écrivent que dans `ui/src/theme.css`, sous forme de variables CSS. Feuilles de style et extensions CodeMirror n'emploient que ces variables (`var(--accent)`), y compris les couleurs de la coloration du code par langage. Les réglages d'affichage ne posent que des attributs sur l'interface (`data-font`, `data-text-size`, `data-text-width`, `data-appearance`) ; le thème les traduit en valeurs. *Vérifié par : `scripts/ci.sh` (aucune couleur ni police écrite ailleurs).*
- **Mise en forme** : Prettier. *Vérifié par : `prettier --check`.*

## 9. Changer le code

- **Ranger ou changer, jamais les deux** : un commit range le code (renommer, extraire, déplacer : `refactor`, `style`) **ou** change le comportement (`feat`, `fix`), pas les deux à la fois. Si un changement est difficile, on range d'abord pour le rendre facile, dans un commit à part. *Vérifié par : revue de chaque commit ; un `refactor` qui modifie un test de comportement est un défaut.*
- **Remanier sous tests verts** : on ne remanie que lorsque tous les tests passent, par petits pas, en relançant les tests à chaque pas. On nomme le remaniement avec le catalogue de Fowler (« extraire une fonction », « remplacer un paramètre booléen par deux fonctions »…).
- **Mauvaises odeurs à chercher en revue** : fonction longue, liste de paramètres longue, données qui voyagent toujours ensemble sans type commun, même `match` répété à plusieurs endroits, type qui change pour des raisons sans rapport entre elles, petit changement qui oblige à toucher beaucoup de fichiers.
- **Règle du scout** : on laisse le code qu'on touche un peu plus propre qu'on ne l'a trouvé, dans un commit de rangement séparé.

## 10. Documentation vivante

- **Ontologie d'abord** (`doc/ontology.md`), puis le test, puis le code. Un seul mot par notion, partout (écrans, documents, code, tests) ; pas de synonymes ; le mot vient de `doc/ontology.md`.
- Spécification technique et fonctionnelle à jour dans le même commit que l'évolution.
- `doc/migration.md` à chaque changement de format des données gardées : l'application doit relire les données des versions précédentes.
- Un rapport d'audit est daté ; quand le code change, on le refait au lieu de le croire.
- Une décision d'architecture s'écrit dans `doc/decisions/` (voir `doc/developpement/architecture.md`).

## 11. Performance

- Cibles : *à définir* (volume de données, temps d'ouverture, temps de réponse d'une action, mémoire).
- Rien ne parcourt toutes les données à chaque action : un index, un cache, ou une lecture d'un niveau à la fois. La liste, le tri, les étiquettes et la recherche lisent l'index de l'espace de travail (port `NoteIndex`, fiche 0028), jamais les fichiers ; une écriture de l'application passe par `IndexedStore`, qui le tient à jour.
- L'index n'a pas de migration : changer son schéma, c'est augmenter `FORMAT_VERSION` (`infrastructure/src/sqlite_index.rs`) ; l'ancien index est alors remplacé et rempli à partir des fichiers.
- Une évolution qui touche une lecture de masse passe par un benchmark (`criterion`). On mesure, on n'estime pas.
- On mesure en profil `release`, jamais en `debug`.

## 12. Sécurité

- Tout ce qui vient du dehors est validé à la frontière : chaque commande Tauri vérifie ce que l'interface envoie (chemin, nom de fichier, taille), comme une requête venue d'Internet.
- **Tauri au plus juste** : permissions (capabilities) limitées aux commandes de l'application ; aucun accès direct au disque ni au shell depuis l'interface ; politique de contenu (CSP) stricte, aucun script distant.
- Aucun secret dans le code ni dans l'historique ; les secrets de développement vivent dans `_SECRET/`. Les secrets de l'utilisateur de l'application sont rangés dans le trousseau macOS, via un adaptateur d'`infrastructure`.
- Dépendances surveillées : licences acceptées et failles connues. *Vérifié par : `cargo deny check` avant de livrer.*

## 13. Livraison macOS

- Binaire universel (Apple Silicon et Intel), sauf décision contraire.
- Application signée, durcie (hardened runtime) et notarisée par Apple avant toute distribution.
- Numéro de version Majeur.mineur.correctif : `Cargo.toml` (`[workspace.package]`) et `ui/package.json` le portent tous deux et restent identiques ; `scripts/version-coherente.sh` le vérifie (barrière de commit et, avant toute compilation, `.github/workflows/application.yml`). *Vérifié par : `scripts/test-version-coherente.sh`.*
- Version livrée : un tag `vX.Y.Z` fabrique l'application sur un Mac de GitHub et joint le `.dmg` à la Release du tag (fiche 0083 ; procédure dans `doc/developpement/architecture.md`, « Fabriquer une version »). Pour l'instant : Apple Silicon seulement, non signée ni notarisée (clic droit puis « Ouvrir »), en attendant la signature.

## 14. Réglages des contrôles

`Cargo.toml` du workspace :

```toml
[workspace.lints.rust]
unsafe_code = "deny"
unused = { level = "deny", priority = -1 }
unreachable_pub = "deny"
missing_docs = "deny"
missing_debug_implementations = "deny"

[workspace.lints.clippy]
all = { level = "deny", priority = -1 }
too_many_lines = "deny"
cognitive_complexity = "deny"
unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
todo = "deny"
dbg_macro = "deny"
print_stdout = "deny"
print_stderr = "deny"
let_underscore_must_use = "deny"
allow_attributes = "deny"
allow_attributes_without_reason = "deny"
disallowed_methods = "deny"
missing_errors_doc = "deny"
fn_params_excessive_bools = "deny"
```

Chaque crate reprend ces règles avec `[lints] workspace = true`.

Côté interface, ESLint lit les types du projet (`parserOptions.projectService`, `ui/eslint.config.js`) pour appliquer `@typescript-eslint/switch-exhaustiveness-check` et `@typescript-eslint/prefer-readonly`. Le lint passe ainsi d'environ 2 s à environ 3 s.

`clippy.toml` à la racine :

```toml
too-many-lines-threshold = 60
cognitive-complexity-threshold = 10
too-many-arguments-threshold = 6
allow-unwrap-in-tests = true
allow-expect-in-tests = true
disallowed-methods = [
  { path = "std::time::SystemTime::now", reason = "utiliser le port Clock" },
  { path = "std::time::Instant::now", reason = "utiliser le port Clock" },
  { path = "jiff::ZonedDateTime::now", reason = "utiliser le port Clock" },
  { path = "jiff::Timestamp::now", reason = "utiliser le port Clock" },
  { path = "rand::thread_rng", reason = "utiliser le port d'aléa" },
]
```

## 15. Contrôles automatiques

| Quand | Quoi |
|---|---|
| Avant chaque commit : `scripts/ci.sh` (barrière) | fichiers privés exclus ; anciens mots de l'ontologie absents ; longueur des fichiers ; Rust (si le code Rust ou ses réglages changent) : mise en forme, Clippy sans avertissement, tous les tests avec couverture ≥ 95 %, dépendances, types partagés à jour ; interface (si `ui/` change) : couleurs et polices seulement dans le thème, mise en forme, types, lints, tests de logique et d'écran avec les seuils de couverture ; documentation Markdown seule (doc/**/*.md, README.md) : seulement les contrôles du texte. Ni parcours complets, ni mutation |
| Après un commit qui touche `crates/domain` : crochet `post-commit` (`scripts/install-hooks.sh`, une fois) | test de mutation du diff du domaine, en arrière-plan, sur une copie figée, coupure 30 s ; un travail à la fois ; non bloquant ; verdict et liste de suivi : `scripts/ci.sh --verdict` (`.git/ci-mutation/`, commun à tous les `git worktree`) *Vérifié par : `scripts/test-ci-gate.sh`.* |
| Fin de fonction : `scripts/ci.sh --fonction` | la barrière en entier (couverture globale), tous les parcours (normaux et lecture ralentie), sans mutation ; `--copie` pour la jouer sur une copie figée *Vérifié par : lui-même.* |
| Sur une copie figée : `scripts/ci.sh --copie [--complet \| --sans-mutation]` | les mêmes contrôles sur une copie du code rangée hors du dépôt (`~/Library/Caches/malorean-notes-ci`) : on peut continuer à modifier le code pendant qu'elle tourne ; elle valide l'état du code à son lancement *Vérifié par : lui-même.* |
| Fin de chaque barrière et de `--complet` (réussie ou non) ; à part : `scripts/ci.sh --menage [--a-blanc]` | ménage du dossier de compilation de Cargo (`scripts/ci-menage.sh`, fiche 0048) : seulement au-delà de 8 Go, seulement le périmé, jamais pendant qu'un autre passage, une mutation ou un `cargo` tourne ; résumé d'une ligne (taille avant, après) ; son échec ne fait jamais échouer la CI ; `--a-blanc` liste sans rien effacer *Vérifié par : `scripts/test-ci-menage.sh`.* |
| `scripts/ci.sh --verifier` | dit si le code est exactement celui de la dernière CI réussie (barrière ou complète ; empreinte gardée dans `.git/ci-validated-tree`) ; à lancer après `--copie` *Vérifié par : lui-même.* |
| Quand `Cargo.toml`, `ui/package.json`, les scripts ou `.github/workflows/` changent (barrière et `--fonction`) | numéro de version identique dans `Cargo.toml` et `ui/package.json`, forme du travail de fabrication GitHub (déclenché par un tag, `contents: write` seulement à la publication) *Vérifié par : `scripts/test-version-coherente.sh`.* |
| Avant de livrer : `scripts/ci.sh --livraison` | la fin de fonction, puis mutation du domaine et échantillon (un dixième, une erreur par fonction) du diff Rust depuis le tag local `ci-verte` ; le tag avance à son succès ; benchmarks si la lecture a changé ; build `release` signé et notarisé. Exceptionnel : `--tout-le-code` (tout muté) |
| À la demande : `scripts/ci.sh --echantillon`, `--mutation-interface` | échantillon de mutation Rust (non bloquant, survivants dans `.git/ci-mutation/suivi.txt`) ; Stryker de l'interface, incrémental |

Outils à installer une fois : `rustup component add llvm-tools-preview`, `cargo install cargo-llvm-cov cargo-deny cargo-mutants --locked`, `jq` (livré avec macOS), puis dans `ui/` : `npm install` et `npx playwright install webkit`.

On ne commite que si la barrière réussit ; l'envoi ne relance rien, puisque ce qui part a déjà passé la barrière. Jamais de contournement (`--no-verify`). Un nouveau dépassement qui passerait les contrôles est un défaut des contrôles : on les complète.

### Essai de l'application réelle (à la demande)

Les tests d'interface tournent dans WebKit de Playwright avec un faux Rust : ils ne voient ni l'IPC de Tauri, ni le protocole des fichiers, ni la vraie fenêtre. `scripts/essai-application.sh` construit le `.app` d'essai (fonctionnalité Cargo `essai`, constante Vite `__ESSAI__`), le lance sur un espace de travail temporaire, et sort 0 si tous les scénarios réussissent, 1 si l'un échoue (le rapport dit lequel et pourquoi), 2 sans rapport. Il dure plusieurs minutes (construction) et ouvre une fenêtre quelques secondes sur l'écran : on le lance avant une livraison, jamais dans la barrière. Ses preuves (`scripts/test-essai-application.sh`, avec une fausse application) passent dans la barrière quand un script change. Fiche 0054.

### Temps de la CI : constats et façon de travailler

Constats (session du 22/11/2026, Mac Apple Silicon ; durées approximatives) :

- **Le test de mutation de l'interface (Stryker) est l'essentiel du temps** : environ 30 minutes au premier passage (Stryker prévient que 22 % des mutants « statiques » en prennent 90 %), puis environ 12 minutes pour toute la CI quand il est incrémental. Les autres contrôles prennent 6 à 8 minutes ; les parcours WebKit sont joués deux fois (normal, puis lecture des notes ralentie).
- **Ce qui a fait échouer la CI, souvent tard, et obligé à la relancer** : une faille connue d'une dépendance (`cargo deny`, réglée par `cargo update -p <crate>`) ; `ui/src/main.ts` à 151 lignes (150 au plus : une ligne de plus suffit) ; les types générés (`ui/src/bridge/generated`) que les tests Rust ne régénèrent plus à l'identique (la CI les régénère dans un dossier à part et les compare à ceux du dépôt ; les refaire avec `cargo test --workspace`, puis les commiter) ; un fichier de test de plus de 600 lignes ; un message de l'interface posé en haut à droite qui recouvrait des boutons et bloquait les clics d'un parcours WebKit ; des mutants survivants dans du code neuf (un paramètre ou une valeur littérale qu'aucun test n'affirme).
- **Un script de CI ne se modifie pas pendant qu'il tourne**, et le code non plus : le verdict ne vaudrait plus pour ce qu'on commite. Pour changer `scripts/ci.sh` pendant un passage, le remplacer d'un coup (écrire un fichier voisin, puis `mv`).
- **Le dossier de compilation de Cargo se range hors d'iCloud** (`CARGO_TARGET_DIR=~/Library/Caches/malorean-notes-target`) : il pèse plusieurs Go et iCloud tenterait de le synchroniser. Les tests de navigateur demandent `npx playwright install webkit` une fois.

Ce qui a coûté plus de 2 heures (23/11) : une CI « complète » lancée en fin de fonction mutait tout le code (2 556 erreurs introduites), dont 34 erreurs qui bouclent, chacune attendant une coupure automatique passée de 20 s à 209 s. Pour une application locale à un développeur, avec des agents et des livraisons de temps en temps, rien en production à chaque push, c'était incohérent : la pratique courante est une mutation rare, ciblée et non bloquante, pas à chaque commit (fiche 0049).

Politique en vigueur (fiches 0047 et 0049) :

1. **Barrière à chaque commit** (`scripts/ci.sh`, moins de 3 minutes) : formatage, lints, dépendances, tests, couverture (Rust ≥ 95 %, interface avec les seuils de Vitest), seulement du côté qui a changé ; documentation Markdown seule : contrôles du texte (`scripts/ci-doc-only.sh`). Elle autorise commit et push.
2. **Mutation du domaine après un commit qui touche `crates/domain`**, en arrière-plan (crochet `post-commit`, `scripts/install-hooks.sh` une fois), sur le diff, coupure 30 s. Non bloquante : un survivant va dans `.git/ci-mutation/suivi.txt` (lu par `scripts/ci.sh --verdict`), ne refuse jamais le commit suivant. Plus de dette qui bloque.
3. **Reste du Rust et interface** : pas de mutation à chaque commit. À la demande : `--echantillon` (un dixième des erreurs du diff depuis `ci-verte`, une erreur par fonction, coupure 90 s, non bloquant, à lancer en arrière-plan) et `--mutation-interface` (Stryker incrémental).
4. **Fin de fonction et fin de tâche d'un agent** : `scripts/ci.sh --fonction` (moins de 10 minutes) : la barrière en entier, couverture globale, tous les parcours (normaux et ralentis), sans mutation. Un agent ne joue plus `--branche` à la fin de sa tâche (décision du 25/11, fiche 0059) : la mutation est confiée à GitHub, par groupes ; `--branche` reste possible à la demande. Vérification lente : sur copie figée (`--copie`), on enchaîne sans l'attendre.
5. **Livraison** : `scripts/ci.sh --livraison` (moins de 25 minutes) : la fin de fonction, puis la mutation du domaine et l'échantillon du diff Rust depuis le tag git local `ci-verte` (jamais poussé ; `scripts/ci-verte.sh poser <commit>` le pose, `avancer` le déplace sur HEAD). Un survivant refuse la livraison (le tag ne bouge pas). Le tag avance à son succès. Diff vide : rien à muter.
6. **Rejeu des dépassements** (fiche 0053) : un dépassement de délai de la mutation n'est pas une preuve (constat du 24/11 : 89 contrôles sur 513 dépassent 60 s sur `infrastructure`, machine chargée). Toute mutation lancée par `scripts/ci.sh` et le travail de nuit rejouent une fois leurs dépassements avec un délai x 4 (borné à 600 s, `scripts/mutation-rejeu.sh`, `cargo mutants --iterate`) : un survivant du rejeu est un survivant, un dépassement qui persiste est un avertissement chiffré, le rapport dit les dépassements avant et après. Le crochet après commit (30 s, non bloquant) ne rejoue rien. Scénarios : `scripts/test-ci-rejeu.sh`.
7. **`--tout-le-code`** : mutation de tout le code, exceptionnelle, jamais lancée par une règle.
8. Règles : rien ne se rejoue sur du code inchangé ; commits par petites briques ; jamais de passage long pour une simple correction ; tests qui tuent les erreurs introduites écrits avec le code (chaque valeur littérale, borne et cas limite a un test qui l'affirme ; éviter le code qui laisse des mutants équivalents : un `?.` ou un `?? []` sur une valeur jamais nulle, un `filter(Boolean)` après un `split`).

**CI de nuit sur GitHub, par groupes** (fiches 0050 puis 0059) : `.github/workflows/mutation.yml` joue chaque nuit (02:17 UTC) et à la demande (onglet Actions, « Run workflow », entrée facultative « groupe ») la mutation de tout le Rust (`domain`, `application`, `infrastructure`, `api`) en **groupes de mutation parallèles**, un par machine (60 minutes au plus, `fail-fast: false`). Les groupes sont décrits une seule fois dans `scripts/mutation-groupes.json` (nom, crate, fichiers par motifs de cargo-mutants ; le groupe « autres » de chaque crate prend tout fichier qu'aucun autre ne nomme) ; une première tâche en tire la matrice, `scripts/mutation-groupe.sh` joue un groupe (`--all-features --jobs 4 --test-workspace=false`, coupure 30 s pour le domaine, 90 s ailleurs, rejeu des dépassements de la fiche 0053), la dernière tâche (étape Summary) résume chaque groupe (erreurs, attrapées, survivantes, dépassements, durée). `domain` et `application` jouent sur Linux, `infrastructure` et `api` sur macOS (Accelerate, Tauri). Un survivant fait échouer son groupe (e-mail de GitHub), un dépassement persistant avertit ; le bilan de chaque groupe est joint en artefact `mutation-<groupe>` (`missed.txt`, `outcomes.json`, `bilan.json`). Un survivant se corrige à la tâche suivante : jamais une barrière. Mesure du 23/11 (ancien travail du domaine seul, 992 erreurs en 47 min) et du 25/11 (1 413 erreurs, coupé à 75 min) : voir la fiche 0059 pour les tailles de groupes (`scripts/mutation-groupes.sh compter`). Scénarios : `scripts/test-ci-mutation-groupes.sh` (matrice, exhaustivité des fichiers, groupe joué avec un faux cargo-mutants, résumé, forme du travail). Le planning n'est actif que depuis la branche `main`.

Dossiers de travail (`git worktree`, `doc/developpement/travail-en-branches.md`) : la CI y fonctionne. L'empreinte de validation (`--verifier`) est propre à chaque dossier (`git rev-parse --git-dir`) ; le tag `ci-verte`, les verdicts de mutation et la liste de suivi sont communs à tous (`git rev-parse --git-common-dir`, dossier `ci-mutation`) ; le crochet `post-commit` marche depuis un worktree. Scénario : `scripts/test-ci-gate.sh`.

Mesures du 23/11 (Mac M4, caches chauds) :

- La barrière prend 3 à 5 secondes pour de la documentation, environ 64 secondes pour un fichier d'interface (tests avec couverture comprise) et environ 80 à 100 secondes pour un fichier de Rust (couverture globale comprise). Avant : 30 à 60 minutes.
- `--fonction` prend environ 2 minutes 40 sur le dépôt actuel (Rust : couverture 98 s, tests de documentation 12 s ; interface : parcours normaux 60 s puis ralentis 60 s ; Rust et interface en parallèle).
- La mutation du domaine tourne environ 70 secondes pour 42 erreurs (deux fichiers du sens) avec la coupure à 30 s, même verdict qu'avec la coupure automatique de 20 s (38 attrapées, 4 non compilables, 0 survivante).
- Un échantillon d'un dixième sur le diff depuis `ci-verte` (f637671, 289 lignes de Rust hors domaine, 5 erreurs) : 81 à 93 secondes, dont 53 s de compilation à froid de la copie.
- Test de mutation des tests de la seule crate de l'erreur (`--test-workspace=false`) : 12,6 s par erreur contre 44 s sur tout l'espace de travail (échantillon de 86 erreurs).
- Où part le temps d'une livraison plus grosse : la compilation à froid de la copie de chaque tâche (53 s) puis les tests de la crate `infrastructure` (environ 43 s par erreur) ; les erreurs qui bouclent coûtent leur coupure (90 s).

Ce qui n'a pas été gardé ou pas mesuré :

- **`cargo-nextest`** (installé, mesuré) : 21 s contre 36 s sur `infrastructure` seule, compilation comprise, mais environ 23 s contre 25 s sur tout l'espace ; pas de gain net, non branché.
- Pas mesurés : nombre de tâches en parallèle (4 gardé), profil de test (`debug`, `opt-level`), `sccache`, mutation Rust incrémentale. cargo-mutants ne copie déjà pas `target/` : le coût est la compilation à froid par tâche.
- La coupure à 90 s de l'échantillon n'a pas été comparée à la coupure automatique sur un échantillon de l'api ou de l'infrastructure (disque plein pendant l'essai) : les tests normaux de ces crates durent jusqu'à 45 s ; à refaire si une erreur est vue « boucle » à tort.
- **Un script de CI ne se modifie pas pendant qu'il tourne**, et le code non plus.
- **Le dossier de compilation de Cargo** : voir le ménage (`scripts/ci.sh --menage`, fiche 0048) ; les copies de cargo-mutants laissées par un passage tué (`$TMPDIR/cargo-mutants-*.tmp`, plusieurs dizaines de Go) se suppriment à la main.

## 16. Sources

Les règles ci-dessus viennent de ces ouvrages. On s'y reporte en cas de doute ; une règle nouvelle cite sa source.

| Sujet | Source | Ce qu'on en retient |
|---|---|---|
| Architecture | Robert C. Martin, *Clean Architecture* (2017) | Sens des dépendances, couches, ce qui change ensemble vit ensemble |
| Architecture | Alistair Cockburn, « Hexagonal Architecture » (2005) | Ports et adaptateurs, ports dans les mots de l'application |
| Architecture | Gary Bernhardt, « Functional Core, Imperative Shell » et « Boundaries » | Lire, décider, écrire ; décision pure |
| Domaine | Eric Evans, *Domain-Driven Design* (2003) ; Vaughn Vernon, *Domain-Driven Design Distilled* (2016) | Ontologie (langage commun), objets valeur, un invariant un gardien |
| Décisions | Michael Nygard, « Documenting Architecture Decisions » (2011) | Fiches de décision dans `doc/decisions/` |
| Conception | John Ousterhout, *A Philosophy of Software Design* (2e éd. 2021) | Modules profonds, pas de passe-plat, commentaire d'interface écrit d'abord |
| Conception | Robert C. Martin, *Clean Code* (2008) | Nommage, fonctions courtes, pas de paramètre booléen |
| Conception | Sandi Metz, « The Wrong Abstraction » (2016) | Factoriser une règle, pas une ressemblance |
| Changement | Kent Beck, *Tidy First?* (2023) | Ranger ou changer, jamais les deux |
| Changement | Martin Fowler, *Refactoring* (2e éd. 2018) | Catalogue des remaniements, mauvaises odeurs |
| Changement | Michael Feathers, *Working Effectively with Legacy Code* (2004) | Remettre sous tests un code qui n'en a pas |
| Types | Alexis King, « Parse, don't validate » (2019) | Convertir à la frontière, une fois |
| Types | Yaron Minsky, « Effective ML » (« make illegal states unrepresentable ») | Un état impossible ne s'écrit pas |
| Types | Scott Wlaschin, *Domain Modeling Made Functional* (2018) | Domaine par les types, erreurs comme valeurs |
| Rust | *Rust API Guidelines* (guide officiel) | Nommage, conversions, traits à implémenter |
| Rust | David Drysdale, *Effective Rust* (2024) | Types, erreurs, dépendances, outils |
| Rust | Luca Palmieri, *Zero To Production in Rust* (2022) | Types de domaine, erreurs par couche, tests d'intégration |
| Rust | *Rust Design Patterns* (livre communautaire) | Idiomes et anti-modèles |
| Tests | Kent Beck, *Test-Driven Development by Example* (2002) | Rouge, vert, nettoyer ; liste de tests |
| Tests | Vladimir Khorikov, *Unit Testing: Principles, Practices, and Patterns* (2020) | Tester ce qui se voit, résultat plutôt qu'interaction |
| Tests | Martin Fowler, « Mocks Aren't Stubs » et « The Practical Test Pyramid » | Vocabulaire des doublures, répartition des tests |
| Interface | Dan Vanderkam, *Effective TypeScript* (2e éd. 2024) | Unions discriminées, `unknown`, `readonly` |
| Interface | CodeMirror 6, « System Guide » | État, transactions, extensions |
