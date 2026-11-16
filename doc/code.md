# Qualité du code — bonnes pratiques (Rust, application macOS)

Le guide pour garder le code propre. Vocabulaire : `doc/ontology.md`. Architecture : `doc/architecture.md`. Chaque règle dit **comment on la vérifie** ; une règle sans vérification est un vœu.

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
- **Une erreur d'adaptateur ne traverse pas** : l'infrastructure traduit `std::io::Error` ou une erreur de bibliothèque en erreur du port. Aucune couche au-dessus ne voit un type d'erreur technique.

## 3. Découpage par intention des données gardées

Une donnée gardée (mémoire, index, cache, fichier) sert un besoin et ne contient que ce qu'il lit. Pas de structure « à tout faire » partagée.

## 4. Code propre

- **Nommer avec l'ontologie** : les mots de `doc/ontology.md`, partout. Pas de synonyme, pas de mot pour deux choses.
- **Fonctions courtes** : 60 lignes au plus ; complexité 10 au plus ; 6 paramètres au plus (sans `self`). Au-delà : regrouper les paramètres dans un type, ou découper. *Vérifié par : Clippy (`too_many_lines`, `cognitive_complexity`, `too_many_arguments`, seuils dans `clippy.toml`).*
- **Fichiers** : 400 lignes visées, 600 au plus ; au-delà, découper en modules par sujet. *Vérifié par : `scripts/ci.sh`.*
- **Immutabilité** : les types du domaine n'exposent pas de méthode `&mut self` ; on fabrique une nouvelle valeur.
- **Types plutôt que conventions** : un identifiant, une unité, un statut a son propre type (`NoteId`, `enum Status`), pas un `String` ou un `u64` nu. Un état impossible ne doit pas pouvoir s'écrire.
- **Convertir à la frontière, une fois** : ce qui arrive du dehors (commande Tauri, fichier lu, préférence) est converti en type du domaine dès l'entrée (`TryFrom`, `FromStr`, constructeur qui rend un `Result`). Ensuite, plus aucune revalidation : si on a le type, la donnée est valide. Une fonction qui vérifie sans rien rendre (`fn is_valid(&str) -> bool`) est un signal d'alarme.
- **Pas de paramètre booléen qui change le comportement** : `save(note, true)` ne se lit pas. On écrit deux fonctions ou on passe un `enum` nommé. *Vérifié par : Clippy (`fn_params_excessive_bools`, à activer).*
- **Modules profonds** : un module offre une interface petite et cache beaucoup de travail. Il cache une décision (format du fichier, ordre de tri) que le reste du code n'a pas à connaître. Visibilité la plus étroite possible : privé par défaut, `pub(crate)` ensuite, `pub` seulement pour ce qu'une autre crate appelle. *Vérifié par : lint `unreachable_pub` (à activer).*
- **Pas de passe-plat** : une fonction ou un type qui ne fait que transmettre à un autre, sans rien ajouter, est supprimé. On découpe une fonction quand la partie extraite a un nom de l'ontologie et un sens seul, pas seulement pour passer sous un seuil.
 : une constante nommée pour chaque seuil, statut ou chaîne qui porte un sens.
- **Pas de code mort** : fonction, import, variable non utilisés sont supprimés. *Vérifié par : lints `unused` en erreur.*
- **Commentaires** : disent **pourquoi** et **l'intention**, pas ce que fait la ligne. Le `///` d'un élément public décrit ce qu'on obtient, dans le vocabulaire de l'ontologie, et une section `# Errors` dit dans quels cas il échoue. On écrit ce commentaire **avant** le code : s'il est difficile à écrire, l'interface est mal pensée. *Vérifié par : lints `missing_docs` et Clippy `missing_errors_doc` (à activer).*
- **Pas de duplication de règle** : la même règle écrite deux fois sera un jour écrite différemment. Mais on factorise une **règle**, pas une **ressemblance** : deux codes semblables qui répondent à deux besoins différents restent séparés. Une abstraction qui demande un nouveau paramètre ou un nouveau cas à chaque usage est mauvaise : on la défait (on recopie le code chez chaque appelant) puis on cherche la bonne.
- **Conventions Rust** : celles des *Rust API Guidelines*. Noms de conversion `as_` (gratuite), `to_` (coûteuse), `into_` (consomme) ; conversions par `From` / `TryFrom` plutôt que par des fonctions maison ; tout type public implémente `Debug`, et `Clone`, `PartialEq`, `Eq`, `Hash`, `Default` quand ils ont un sens. *Vérifié par : Clippy (`wrong_self_convention`) et lint `missing_debug_implementations` (à activer).*
- **Exception à un lint** : `#[expect(lint, reason = "…")]`, jamais `#[allow]` sans raison. *Vérifié par : Clippy (`allow_attributes`, `allow_attributes_without_reason`).*
- **Code `unsafe`** : interdit. Seule exception : une frontière FFI avec macOS, isolée dans `infrastructure`, avec `// SAFETY:` qui justifie chaque bloc. *Vérifié par : lint `unsafe_code` en erreur, levé localement avec raison.*

## 5. Erreurs

- **Erreurs métier typées** : un `enum` d'erreurs par crate (`thiserror`), une variante par cas (`AlreadyExists`, `VersionConflict`, `NoteNotFound`…), traduit en message pour l'utilisateur **à un seul endroit** de l'interface. `anyhow` n'est permis que dans `app`.
- **Pas de plantage caché** : pas d'`unwrap`, `expect`, `panic!`, `todo!` hors des tests. *Vérifié par : Clippy (`unwrap_used`, `expect_used`, `panic`, `todo`).*
- **Pas d'erreur avalée en silence** : un `Result` n'est jamais jeté (`let _ = …`). Il est propagé (`?`), journalisé, ou ignoré avec sa raison écrite. *Vérifié par : Clippy (`let_underscore_must_use`) et `#[must_use]`.*
- **Nettoyer en cas d'échec** : une écriture ratée ne laisse pas de demi-état (fichier temporaire puis renommage atomique).
- **Message lisible** : l'erreur dit ce qui s'est passé et ce qu'on peut faire.

## 6. Temps, aléa, environnement

- **L'horloge est injectée** : un cas d'usage la reçoit via le port `Clock` et ne lit jamais l'heure ailleurs. La seule horloge réelle vit dans `infrastructure`. Un test passe une horloge arrêtée (`FixedClock`). Même règle pour l'aléa et les identifiants. *Vérifié par : Clippy `disallowed_methods` (`SystemTime::now`, `Instant::now`, `chrono::Local::now`, `rand::thread_rng`…), levé une seule fois dans l'horloge réelle avec `#[expect(…, reason = …)]`.*
- **Configuration** : lue une fois, dans `app`, puis passée aux objets.
- **Journal** : `tracing`, jamais `println!` ni `dbg!`. *Vérifié par : Clippy (`print_stdout`, `print_stderr`, `dbg_macro`).*

## 7. Tests

- **TDD** : voir `CLAUDE.md`. Rouge, vert, nettoyer, par très petits pas. On tient une liste des cas à tester et on n'en écrit qu'un à la fois.
- **Un test par comportement**, nommé par ce qu'il garantit, dans le vocabulaire de l'ontologie.
- **Tester ce qui se voit, pas comment c'est fait** : un test passe par l'interface publique d'une couche (cas d'usage, type du domaine, port). Il ne teste pas une fonction privée et ne vérifie pas l'ordre des appels internes. Un remaniement qui ne change pas le comportement ne casse aucun test ; s'il en casse, le test est trop lié au code.
- **Préférer le résultat à l'interaction** : on vérifie d'abord la valeur rendue (domaine), puis l'état obtenu (le faux en mémoire contient la note). On ne vérifie un appel (« le port a été appelé ») que pour un effet vers l'extérieur qu'on ne peut pas observer autrement : un événement publié, un message envoyé.
- **Vocabulaire des doublures** : un **faux** (*fake*) est une implémentation simple et réelle d'un port (stockage en mémoire) ; un **bouchon** (*stub*) rend une réponse fixée ; un **espion** (*spy*) enregistre les appels. On utilise des faux par défaut ; pas de bibliothèque de *mocks*.
- **Forme d'un test** : trois blocs, préparer, agir, vérifier, une seule action. Aucune logique dans un test (`if`, boucle, calcul du résultat attendu) : le résultat attendu est écrit en clair.
- **Répartition** : beaucoup de tests du domaine (rapides, sans doublure), des tests de cas d'usage sur les faux, des tests de contrat sur les vrais adaptateurs, très peu de tests de bout en bout.
- **Couche par couche** : domaine sans rien ; application avec les faux en mémoire (`application/src/testing/` ou crate `test-support`) ; infrastructure avec de vrais fichiers dans un dossier temporaire ; interface sur sa logique hors écran.
- **Le faux et le vrai se ressemblent** : une même fonction de test de contrat, générique sur le port, est jouée sur le faux et sur l'implémentation réelle.
- **Logique de l'interface hors de l'écran** : l'état d'un écran et ses transitions sont du code testable sans fenêtre.
- **Pas de test qui dépend de l'heure, de l'ordre ou du réseau.**
- **Un test doit pouvoir échouer** : s'il passerait même avec le défaut, il est réécrit. Un défaut trouvé se corrige en écrivant d'abord le test qui le montre.
- **Exceptions à « aucune logique dans un test »** : les tests de propriétés (une condition sur des données générées) et les tests de cohérence entre deux fichiers (toutes les commandes appelées par la page existent).

| Niveau | Où | Outil |
|---|---|---|
| Règles du domaine | `crates/domain` (unitaires) | `cargo test` |
| Propriétés sur des notes générées au hasard | `crates/domain/tests/properties.rs` | `proptest` |
| Cas d'usage, avec le faux stockage en mémoire | `crates/application` | `cargo test` |
| Contrat : mêmes tests sur le faux et le vrai stockage | `application::testing::contract`, joué par `crates/infrastructure/tests` | `cargo test` |
| Disque réel : erreurs, droits, fichiers illisibles | `crates/infrastructure/tests` (dossiers temporaires) | `tempfile` |
| Commandes appelées comme par la page (noms, arguments JSON, origine) | `crates/api/tests/ipc.rs` | simulateur Tauri |
| Logique de l'interface, sans écran | `ui/src/**/*.test.ts` | Vitest |
| Écran et éditeur dans WebKit (le moteur de la fenêtre) | `ui/src/**/*.browser.test.ts` | Vitest, mode navigateur |
| Parcours utilisateur complets, partie Rust remplacée par un faux | `ui/e2e/` | Playwright, WebKit |
| Solidité des tests : erreurs introduites volontairement | tout le Rust | `cargo mutants` |
| Solidité des tests de l'interface | `ui/src` (tous les tests joués dans WebKit, `ui/vitest.stryker.config.ts`) | Stryker |

- **Seuils de couverture** (lignes exécutées par les tests) : Rust ≥ 95 % ; interface ≥ 98 % des lignes, instructions et fonctions, ≥ 94 % des branches. L'assemblage (`crates/app/src/main.rs`, `ui/src/main.ts`) est couvert par les tests des commandes et les parcours complets. **Un seuil ne baisse jamais** : quand la couverture monte, on le relève.
- **Test de mutation** : aucune erreur introduite ne doit passer inaperçue. À chaque push, il porte sur le code Rust qui part ; avant de livrer, sur tout le code. Une mutation « équivalente » (qui ne change rien) se supprime en simplifiant le code. Une mutation qui fait tourner un test jusqu'au délai maximal compte comme remarquée. Côté interface, Stryker tourne à chaque push avec un seuil de 100 % ; une mutation réellement équivalente (optimisation, garde exigée par TypeScript) est écartée par un commentaire `// Stryker disable … : raison`.

## 8. Interface (ui/, TypeScript + CodeMirror 6)

- **Ne jamais bloquer l'écran** : les commandes Tauri sont asynchrones ; tout travail long (disque, index, recherche) tourne côté Rust en arrière-plan. Aucun calcul lourd dans la page.
- **Un seul point de passage vers Rust** : seul `ui/src/bridge/` appelle `invoke` et écoute les événements. Les écrans n'appellent que ce module.
- **Types partagés générés** : les types échangés sont générés depuis Rust (`ts-rs`), jamais réécrits à la main. *Vérifié par : la mini CI régénère et refuse toute différence.*
- **TypeScript strict** : `strict`, `noUncheckedIndexedAccess` ; pas de `any` ; un `@ts-expect-error` ou un `eslint-disable` porte sa raison. *Vérifié par : `tsc --noEmit` et ESLint.*
- **Mêmes limites qu'en Rust** : 60 lignes par fonction, complexité 10, 6 paramètres, 600 lignes par fichier. *Vérifié par : ESLint (`max-lines-per-function`, `complexity`, `max-params`, `max-lines`).*
- **Les états d'écran sont des unions discriminées** : `{ kind: "loading" } | { kind: "ready"; notes: … } | { kind: "error"; message: … }`, jamais plusieurs booléens (`isLoading`, `hasError`) qui peuvent se contredire. Un `switch` sur `kind` traite tous les cas. *Vérifié par : ESLint (`@typescript-eslint/switch-exhaustiveness-check`, à activer).*
- **`unknown` plutôt que `any`** pour une valeur venue du dehors ; on la convertit vers un type précis avant de s'en servir. Les données d'état sont `readonly`. *Vérifié par : ESLint (`@typescript-eslint/prefer-readonly`, à activer).*
- **CodeMirror : l'état d'abord** : le document et la sélection ne changent que par des transactions ; une extension calcule l'affichage (décorations) à partir de l'état et ne touche jamais le DOM de l'éditeur directement.
- **Un module = un écran ou un sujet.** Éditeur : une extension CodeMirror par fonctionnalité (mise en forme en direct, mode focus, collage d'images) dans `ui/src/editor/`.
- **Logique hors du navigateur** : état d'écran, transitions et calculs dans des modules sans DOM, testés avec Vitest.
- **Aucune règle métier** dans l'interface : elle appelle les commandes.
- **Mise en forme** : Prettier. *Vérifié par : `prettier --check`.*

## 9. Changer le code

- **Ranger ou changer, jamais les deux** : un commit range le code (renommer, extraire, déplacer : `refactor`, `style`) **ou** change le comportement (`feat`, `fix`), pas les deux à la fois. Si un changement est difficile, on range d'abord pour le rendre facile, dans un commit à part. *Vérifié par : revue de chaque commit ; un `refactor` qui modifie un test de comportement est un défaut.*
- **Remanier sous tests verts** : on ne remanie que lorsque tous les tests passent, par petits pas, en relançant les tests à chaque pas. On nomme le remaniement avec le catalogue de Fowler (« extraire une fonction », « remplacer un paramètre booléen par deux fonctions »…).
- **Mauvaises odeurs à chercher en revue** : fonction longue, liste de paramètres longue, données qui voyagent toujours ensemble sans type commun, même `match` répété à plusieurs endroits, type qui change pour des raisons sans rapport entre elles, petit changement qui oblige à toucher beaucoup de fichiers.
- **Règle du scout** : on laisse le code qu'on touche un peu plus propre qu'on ne l'a trouvé, dans un commit de rangement séparé.

## 10. Documentation vivante

- **Ontologie d'abord** (`doc/ontology.md`), puis le test, puis le code.
- Spécification technique et fonctionnelle à jour dans le même commit que l'évolution.
- `doc/migration.md` à chaque changement de format des données gardées : l'application doit relire les données des versions précédentes.
- Un rapport d'audit est daté ; quand le code change, on le refait au lieu de le croire.
- Une décision d'architecture s'écrit dans `doc/decisions/` (voir `doc/architecture.md`).

## 11. Performance

- Cibles : *à définir* (volume de données, temps d'ouverture, temps de réponse d'une action, mémoire).
- Rien ne parcourt toutes les données à chaque action : un index, un cache, ou une lecture d'un niveau à la fois.
- Une évolution qui touche une lecture de masse passe par un benchmark (`criterion`). On mesure, on n'estime pas.
- On mesure en profil `release`, jamais en `debug`.

## 12. Sécurité

- Tout ce qui vient du dehors est validé à la frontière : chaque commande Tauri vérifie ce que l'interface envoie (chemin, nom de fichier, taille), comme une requête venue d'Internet.
- **Tauri au plus juste** : permissions (capabilities) limitées aux commandes de l'application ; aucun accès direct au disque ni au shell depuis la page ; politique de contenu (CSP) stricte, aucun script distant.
- Aucun secret dans le code ni dans l'historique ; les secrets de développement vivent dans `_SECRET/`. Les secrets de l'utilisateur de l'application sont rangés dans le trousseau macOS, via un adaptateur d'`infrastructure`.
- Dépendances surveillées : licences acceptées et failles connues. *Vérifié par : `cargo deny check` avant de livrer.*

## 13. Livraison macOS

- Binaire universel (Apple Silicon et Intel), sauf décision contraire.
- Application signée, durcie (hardened runtime) et notarisée par Apple avant toute distribution.
- Numéro de version unique, tiré du `Cargo.toml` de `app`.

## 14. Réglages des contrôles

`Cargo.toml` du workspace :

```toml
[workspace.lints.rust]
unsafe_code = "deny"
unused = { level = "deny", priority = -1 }

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
```

Chaque crate reprend ces règles avec `[lints] workspace = true`.

**À activer** (le code actuel ne les respecte pas encore ; écarts suivis dans `TODO.md`) :

```toml
[workspace.lints.rust]
unreachable_pub = "deny"
missing_docs = "deny"
missing_debug_implementations = "deny"

[workspace.lints.clippy]
missing_errors_doc = "deny"
fn_params_excessive_bools = "deny"
```

Côté interface : `@typescript-eslint/switch-exhaustiveness-check` et `@typescript-eslint/prefer-readonly` (ces deux règles demandent l'analyse typée d'ESLint).

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
  { path = "chrono::Local::now", reason = "utiliser le port Clock" },
  { path = "chrono::Utc::now", reason = "utiliser le port Clock" },
  { path = "rand::thread_rng", reason = "utiliser le port d'aléa" },
]
```

## 15. Contrôles automatiques

| Quand | Quoi |
|---|---|
| Avant chaque push : mini CI lancée automatiquement par `.githooks/pre-push` | fichiers privés exclus ; longueur des fichiers ; Rust : mise en forme, Clippy sans avertissement, tous les tests avec couverture ≥ 95 %, dépendances, test de mutation du code Rust qui part (`scripts/ci.sh --mutations-depuis <dernier envoi>` ; tout le code au premier envoi) ; interface : types générés à jour, mise en forme, types, lints, tests de logique et d'écran avec les seuils de couverture, parcours complets, test de mutation (score 100 %) |
| Avant de livrer : `scripts/ci.sh --complet` | tout ce qui précède, plus le test de mutation ; benchmarks si la lecture a changé ; build `release` signé et notarisé |

Outils à installer une fois : `rustup component add llvm-tools-preview`, `cargo install cargo-llvm-cov cargo-deny cargo-mutants --locked`, puis dans `ui/` : `npm install` et `npx playwright install webkit`. Le garde-fou s'active avec `git config --local core.hooksPath .githooks`.

Un push n'a lieu que si la mini CI réussit ; jamais de contournement (`--no-verify`). Un nouveau dépassement qui passerait les contrôles est un défaut des contrôles : on les complète.

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
