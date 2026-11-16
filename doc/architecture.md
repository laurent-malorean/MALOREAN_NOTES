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
- La surveillance des fichiers détecte les modifications extérieures ; l'application recharge la note, ou signale un conflit sans rien perdre.
- L'application n'impose aucun format : un fichier `.md` écrit par un autre outil est une note valide.

## Technologie d'interface

**Tauri 2 + CodeMirror 6**, interface en TypeScript (Vite). Choix fait pour la qualité de l'éditeur Markdown, cœur du produit ; l'apparence « native Mac » n'est pas un objectif.

## Décisions ouvertes

- Cibles de performance (taille de bibliothèque, temps d'ouverture, temps de recherche, mémoire).
