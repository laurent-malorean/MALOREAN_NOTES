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

## 3. Découpage par intention des données gardées

Une donnée gardée (mémoire, index, cache, fichier) sert un besoin et ne contient que ce qu'il lit. Pas de structure « à tout faire » partagée.

## 4. Code propre

- **Nommer avec l'ontologie** : les mots de `doc/ontology.md`, partout. Pas de synonyme, pas de mot pour deux choses.
- **Fonctions courtes** : 60 lignes au plus ; complexité 10 au plus ; 6 paramètres au plus (sans `self`). Au-delà : regrouper les paramètres dans un type, ou découper. *Vérifié par : Clippy (`too_many_lines`, `cognitive_complexity`, `too_many_arguments`, seuils dans `clippy.toml`).*
- **Fichiers** : 400 lignes visées, 600 au plus ; au-delà, découper en modules par sujet. *Vérifié par : `scripts/ci.sh`.*
- **Immutabilité** : les types du domaine n'exposent pas de méthode `&mut self` ; on fabrique une nouvelle valeur.
- **Types plutôt que conventions** : un identifiant, une unité, un statut a son propre type (`NoteId`, `enum Status`), pas un `String` ou un `u64` nu. Un état impossible ne doit pas pouvoir s'écrire.
- **Pas de valeur magique** : une constante nommée pour chaque seuil, statut ou chaîne qui porte un sens.
- **Pas de code mort** : fonction, import, variable non utilisés sont supprimés. *Vérifié par : lints `unused` en erreur.*
- **Commentaires** : disent **pourquoi** et **l'intention**, pas ce que fait la ligne. Le `///` d'un élément public décrit ce qu'on obtient, dans le vocabulaire de l'ontologie.
- **Pas de duplication** : la même règle écrite deux fois sera un jour écrite différemment.
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

- **TDD** : voir `CLAUDE.md`.
- **Un test par comportement**, nommé par ce qu'il garantit, dans le vocabulaire de l'ontologie.
- **Couche par couche** : domaine sans rien ; application avec les faux en mémoire (`application/src/testing/` ou crate `test-support`) ; infrastructure avec de vrais fichiers dans un dossier temporaire ; interface sur sa logique hors écran.
- **Le faux et le vrai se ressemblent** : une même fonction de test de contrat, générique sur le port, est jouée sur le faux et sur l'implémentation réelle.
- **Logique de l'interface hors de l'écran** : l'état d'un écran et ses transitions sont du code testable sans fenêtre.
- **Pas de test qui dépend de l'heure, de l'ordre ou du réseau.**

## 8. Interface (ui/, TypeScript + CodeMirror 6)

- **Ne jamais bloquer l'écran** : les commandes Tauri sont asynchrones ; tout travail long (disque, index, recherche) tourne côté Rust en arrière-plan. Aucun calcul lourd dans la page.
- **Un seul point de passage vers Rust** : seul `ui/src/bridge/` appelle `invoke` et écoute les événements. Les écrans n'appellent que ce module.
- **Types partagés générés** : les types échangés sont générés depuis Rust (`ts-rs`), jamais réécrits à la main. *Vérifié par : la mini CI régénère et refuse toute différence.*
- **TypeScript strict** : `strict`, `noUncheckedIndexedAccess` ; pas de `any` ; un `@ts-expect-error` ou un `eslint-disable` porte sa raison. *Vérifié par : `tsc --noEmit` et ESLint.*
- **Mêmes limites qu'en Rust** : 60 lignes par fonction, complexité 10, 6 paramètres, 600 lignes par fichier. *Vérifié par : ESLint (`max-lines-per-function`, `complexity`, `max-params`, `max-lines`).*
- **Un module = un écran ou un sujet.** Éditeur : une extension CodeMirror par fonctionnalité (mise en forme en direct, mode focus, collage d'images) dans `ui/src/editor/`.
- **Logique hors du navigateur** : état d'écran, transitions et calculs dans des modules sans DOM, testés avec Vitest.
- **Aucune règle métier** dans l'interface : elle appelle les commandes.
- **Mise en forme** : Prettier. *Vérifié par : `prettier --check`.*

## 9. Documentation vivante

- **Ontologie d'abord** (`doc/ontology.md`), puis le test, puis le code.
- Spécification technique et fonctionnelle à jour dans le même commit que l'évolution.
- `doc/migration.md` à chaque changement de format des données gardées : l'application doit relire les données des versions précédentes.
- Un rapport d'audit est daté ; quand le code change, on le refait au lieu de le croire.

## 10. Performance

- Cibles : *à définir* (volume de données, temps d'ouverture, temps de réponse d'une action, mémoire).
- Rien ne parcourt toutes les données à chaque action : un index, un cache, ou une lecture d'un niveau à la fois.
- Une évolution qui touche une lecture de masse passe par un benchmark (`criterion`). On mesure, on n'estime pas.
- On mesure en profil `release`, jamais en `debug`.

## 11. Sécurité

- Tout ce qui vient du dehors est validé à la frontière : chaque commande Tauri vérifie ce que l'interface envoie (chemin, nom de fichier, taille), comme une requête venue d'Internet.
- **Tauri au plus juste** : permissions (capabilities) limitées aux commandes de l'application ; aucun accès direct au disque ni au shell depuis la page ; politique de contenu (CSP) stricte, aucun script distant.
- Aucun secret dans le code ni dans l'historique ; les secrets de développement vivent dans `_SECRET/`. Les secrets de l'utilisateur de l'application sont rangés dans le trousseau macOS, via un adaptateur d'`infrastructure`.
- Dépendances surveillées : licences acceptées et failles connues. *Vérifié par : `cargo deny check` avant de livrer.*

## 12. Livraison macOS

- Binaire universel (Apple Silicon et Intel), sauf décision contraire.
- Application signée, durcie (hardened runtime) et notarisée par Apple avant toute distribution.
- Numéro de version unique, tiré du `Cargo.toml` de `app`.

## 13. Réglages des contrôles

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

## 14. Contrôles automatiques

| Quand | Quoi |
|---|---|
| Avant chaque push : mini CI `scripts/ci.sh` | Rust : secrets exclus du dépôt, longueur des fichiers, `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` (tous les tests), `cargo deny check`. Interface : types générés à jour, `prettier --check`, `tsc --noEmit`, ESLint, Vitest (tous les tests) |
| Avant de livrer | benchmarks si la lecture a changé, build `release` signé et notarisé |

Un push n'a lieu que si la mini CI réussit. Un nouveau dépassement qui passerait les contrôles est un défaut des contrôles : on les complète.
