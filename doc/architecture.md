# Architecture

![Architecture](architecture.svg)

Produit : `doc/produit.md`. Règles de qualité et contrôles : `doc/code.md`. Vocabulaire : `doc/ontology.md`.

## Organisation du projet

```
Cargo.toml            workspace, dépendances et lints communs
clippy.toml           seuils et méthodes interdites
crates/
  domain/             règles pures, types, erreurs métier
  application/        cas d'usage, lectures, événements, ports (traits)
  infrastructure/     stockage Markdown, système macOS, horloge réelle, journal
  api/                pont Tauri : commandes et événements, types exportés en TypeScript
  app/                binaire Tauri : assemblage, configuration, permissions
ui/                   interface TypeScript (Vite)
  src/bridge/         seul module qui appelle Rust ; types générés
  src/editor/         éditeur CodeMirror 6, une extension par fonctionnalité
  src/screens/        écrans : dossiers, liste des notes, éditeur
  src/state/          état d'écran et transitions, testés sans navigateur
scripts/ci.sh         mini CI locale, avant chaque push
```

Sens des dépendances : `api` → `application` → `domain` ; `infrastructure` → `application` → `domain` ; `app` → tout ; `ui/` → commandes de `api` uniquement.

## Principes

- **Les dépendances vont vers le stable** : le domaine change le moins et ne dépend de rien ; ce qui change souvent (interface, stockage, système macOS) dépend de lui, jamais l'inverse.
- **Ports et adaptateurs** : un **port d'entrée** est un cas d'usage, appelé par `api` ; un **port de sortie** est un trait défini par `application` dans ses propres mots, implémenté par `infrastructure`. Changer de format de fichier ou d'interface ne touche ni le domaine ni les cas d'usage.
- **Cœur pur, coque mince** : les décisions sont des fonctions pures du domaine ; les effets (disque, horloge, événements) restent en bordure, dans les cas d'usage et les adaptateurs.
- **Ce qui change ensemble vit ensemble** : un module regroupe le code qui évolue pour une même raison. Une évolution qui oblige à toucher beaucoup de modules signale un mauvais découpage.
- **Convertir à la frontière** : une donnée venue du dehors (page, fichier) devient un type du domaine dès son entrée dans `api` ou `infrastructure`. À l'intérieur, tout est déjà valide.

## Parcours d'une action

1. L'utilisateur agit (frappe, clic, raccourci, menu). L'écran appelle une fonction de `ui/src/bridge/`.
2. Le pont envoie une commande Tauri ; la page reste libre pendant ce temps.
3. La commande valide la requête et appelle un cas d'usage, qui lit via les ports, applique les règles du domaine, écrit via les ports.
4. Le cas d'usage publie un événement « ce qui a changé » ; `api` le relaie à la page.
5. L'écran met à jour son état ; l'affichage suit l'état.

En cas d'erreur : le cas d'usage rend une erreur typée ; `api` la traduit en message à un seul endroit.

## Fils d'exécution

- **Page (WebView)** : affichage et saisie uniquement ; appels à Rust toujours asynchrones.
- **Rust en arrière-plan** : cas d'usage, disque, index, recherche. Communication avec la page par commandes et événements uniquement.

## Données

| Emplacement | Contenu | Perte acceptable ? |
|---|---|---|
| Bibliothèque (dossier choisi par l'utilisateur, iCloud Drive possible) | notes `.md`, dossiers, pièces jointes — **seule source de vérité** | non |
| `~/Library/Application Support/<app>/` | préférences, liste des bibliothèques ouvertes | non |
| `~/Library/Caches/<app>/` | index de recherche, aperçus — reconstructibles | oui |
| `~/Library/Logs/<app>/` | journaux | oui |
| Trousseau macOS | secrets éventuels | non |

- Toute écriture dans la bibliothèque est atomique (fichier temporaire puis renommage) : un fichier n'est jamais à moitié écrit.
- La surveillance des fichiers (port `LibraryWatcher`, adaptateur FSEvents dans `infrastructure`) détecte les modifications extérieures ; `api` les relaie à la page par l'événement `library-changed`. L'application recharge la note, ou garde l'autre version dans une copie de conflit : rien n'est perdu (fiche 0014).
- L'application n'impose aucun format : un fichier `.md` écrit par un autre outil est une note valide.

## Décisions d'architecture

Chaque décision qui engage la structure (technologie, format des données, découpage, dépendance importante) a sa fiche dans `doc/decisions/`, numérotée et datée : `NNNN-titre-en-kebab-case.md`. Une fiche contient quatre parties : **Contexte** (le problème et ses contraintes), **Décision**, **Conséquences** (ce qu'on gagne, ce qu'on perd), **Statut** (proposée, acceptée, remplacée par…). Une décision acceptée ne se modifie pas : on écrit une nouvelle fiche qui la remplace.

| Fiche | Décision |
|---|---|
| `0001-tauri-codemirror.md` | Interface Tauri 2 + CodeMirror 6 |
| `0002-notes-markdown-nom-tire-du-titre.md` | Notes en fichiers Markdown, nom tiré du titre, pièces jointes par note |
| `0003-apercu-en-direct-par-masquage.md` | Aperçu en direct : syntaxe masquée hors de la ligne en cours |
| `0004-strategie-de-tests.md` | Niveaux de tests, seuils, mutation, garde-fou avant envoi |
| `0005-aide-ecriture-modele-apple.md` | Aide à l'écriture par le modèle d'IA du Mac (proposée) |
| `0006-seuils-et-mutation-a-chaque-envoi.md` | Seuils qui ne baissent jamais, test de mutation à chaque envoi |

## Décisions ouvertes

- Cibles de performance (taille de bibliothèque, temps d'ouverture, temps de recherche, mémoire).
