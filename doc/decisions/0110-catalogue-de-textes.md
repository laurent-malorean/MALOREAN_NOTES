# 0110 — Un catalogue de textes unique, au format Fluent, rangé par module

Date : 28/11/2026. Spécification : `doc/specs/multilingue.md`.

## Contexte

Tous les textes que voit l'utilisateur sont écrits en français, en dur, dans le code. Mesure faite le 28/11 (comptage des chaînes qui contiennent une lettre accentuée ou deux mots, hors tests ; c'est un minimum, l'inventaire exact est la première tâche) :

- interface TypeScript : au moins 845 chaînes dans 142 fichiers (les plus chargés : colonne Claude, commandes, menus, canvas, mise en page, réglages de branchement) ;
- Rust : 79 messages d'erreur (`#[error("…")]`) dans le domaine et l'application, traduits en message pour l'interface à un seul endroit (`crates/api/src/error.rs`, `ApiError { message }`) ;
- le domaine porte des textes qui entrent dans les fichiers de l'utilisateur ou y sont reconnus : « Sans titre » et `sans-titre` (`title.rs`, `file_name.rs`, `export.rs`) et 192 noms de pays français (`agenda_12/country_names.rs`) ;
- la barre des menus est celle de l'interface : l'interface envoie ses textes à Rust (`install_menu`).

## Décision

- **Un seul catalogue pour tout le produit**, à la racine : `locales/<langue>/<module>.ftl`, langues `fr`, `en`, `pt-BR`. Il n'appartient ni à `ui/` ni à un crate.
- **Format Fluent (`.ftl`)** : ses implémentations officielles existent en Rust (`fluent-bundle`) et en JavaScript (`@fluent/bundle`), avec la même syntaxe et les mêmes règles de pluriel. Choisi plutôt que du JSON : en JSON, les pluriels et les paramètres se réécrivent des deux côtés et doivent être testés pour donner le même résultat. Défaut accepté : outillage de traduction moins répandu.
- **Découpage par module**, sur le modèle de `ui/src/app/` ; plus `commun.ftl` (mots partagés), `erreurs.ftl` et `outils-mcp.ftl` (résumés des outils). Un module de plus ne touche qu'un fichier par langue.
- **Clés en ASCII**, en français, sans accent (Fluent n'accepte pas les accents dans un identifiant) : `reglages-titre`, `note-supprimee`. Forme `module-élément-nature`. La langue de référence est `fr` ; tout texte manquant retombe sur `fr`.
- **L'interface affiche tout.** Le catalogue est chargé à la construction (import Vite) : aucun accès au disque au lancement. Un module `ui/src/i18n/` offre une seule fonction de traduction (clé, paramètres).
- **Rust ne lit le catalogue que pour ce qu'il écrit dans les fichiers de l'utilisateur** (nom par défaut d'une note, d'un événement, d'un export), embarqué à la compilation. Tout autre texte que Rust doit « dire » est envoyé à l'interface sous forme de clé et de paramètres.
- **Erreurs** : les cas d'usage rendent déjà une erreur typée. `ApiError` porte désormais une clé et des paramètres, au lieu d'un message ; l'interface traduit. Les `#[error("…")]` restent, en anglais technique, pour les journaux et les tests Rust.
- **Langue choisie** : gardée dans `preferences.json` (Rust), `auto` par défaut. Changer de langue recharge la fenêtre (pas de bascule à chaud : les textes sont lus à la construction des écrans).
- **Dates, nombres, noms de pays** : par `Intl` du WebView, selon la langue ; les 192 noms de pays français du domaine sont à reprendre (tâche dédiée : voir à quoi ils servent avant de les retirer).
- **Reconnaissance des noms par défaut** : une seule liste, tirée du catalogue, de tous les « sans titre » de toutes les langues (`sans-titre`, `untitled`, `sem-titulo`).
- **Outils MCP** : descriptions pour l'IA en anglais, dans le code de l'outil ; résumé humain d'une phrase par outil dans le catalogue ; un contrôle de CI refuse un outil sans résumé dans chaque langue.
- **Contrôles de CI** : mêmes clés dans toutes les langues, clés utilisées présentes et clés présentes utilisées, mêmes paramètres, aucun texte en dur dans `ui/src` (compte qui ne peut que baisser puis zéro, comme un seuil de couverture).

## Conséquences

- Les tests existants vérifient des textes français : ils restent valides à l'étape « français à l'identique » et deviennent la preuve d'absence de changement. Les parcours en anglais et en portugais sont rejoués avec leur langue.
- Aucune mutation spécifique : les chaînes déplacées dans le catalogue sortent du champ des mutants de littéraux ; les tests de langue et les contrôles de CI les remplacent.
- Le format des fichiers de l'utilisateur ne change pas (`doc/format/`).
