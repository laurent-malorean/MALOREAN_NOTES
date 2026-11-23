# 0049 — Zone de saisie du cahier : une entrée s'écrit en bas de la page du cahier, sans fenêtre ni correction

- **Date** : 2026-11-23
- **Statut** : acceptée
- **Modifie** la fiche 0041 (interface d'ajout) et son outil `add_entry` (fiche 0040) ; spécification : `doc/specs/entree-de-cahier.md`.

## Contexte

La fiche 0041 ajoutait une entrée par une fenêtre (« Ajouter au cahier ») ouverte depuis un « + » en haut du cahier ou par une commande, avec choix du cahier et correction d'une entrée. L'utilisateur a demandé le 23/11 une version simple : saisir directement en bas de la page du cahier, en voyant le cahier au-dessus.

## Décision

- **Une zone de saisie dans la page du cahier** (`editor/research-notebook.ts`) : un panneau du bas de l'éditeur, présent seulement sur un cahier montré par une colonne. Message (« elle sera datée au moment de l'ajout et rangée sous « Lundi 23 novembre » », jour pris sur l'horloge de l'interface, affiché à chaque prise de focus), texte libre de 8 lignes visibles, bouton « Ajouter l'entrée ». Le texte du cahier reste en lecture seule.
- **Ajout** : la colonne appelle `addEntry(path, text)` ; Rust date l'entrée et la range comme avant (`domain::research_notebook::with_entry`). Réussi : les colonnes qui montrent le cahier relisent leur version, la colonne active montre l'entrée et la zone se vide. Refusé (entrée vide, par exemple) : l'erreur s'affiche et le texte reste.
- **Disparaissent** : la fenêtre de saisie et sa liste de cahiers, le « + », la commande « Ajouter au cahier » (palette et barre des menus), la correction (`with_correction`, `RefusedEntry::CorrectedEntryNotFound`, paramètre `corrected` de la commande `add_entry`, du cas d'usage `AddEntry` et de l'outil de Claude), la commande `list_research_notebooks` et `ListResearchNotebooks` (plus de choix de cahier) ; `ListEntries` garde les entrées, dont les liens `#ancre` ont encore besoin.
- **L'outil `add_entry` de Claude** reste : `path` et `text`. Les corrections déjà écrites dans des cahiers restent des entrées ordinaires et leurs liens fonctionnent.

## Conséquences

- Plus aucun chemin d'ajout hors de la page du cahier ; l'ajout rapide « sans ouvrir le cahier » de la fiche 0041 est abandonné.
- Le jour affiché vient de l'horloge de l'interface ; l'heure d'écriture et le titre du jour restent ceux de Rust (écart possible seulement autour de minuit).

## Tests

Éditeur (zone, 8 lignes, bouton, texte gardé ou vidé, note ordinaire sans zone), colonne, module des cahiers (relecture, message, refus), pont, commandes et menu sans « Ajouter au cahier », domaine, cas d'usage, session, outils de Claude, parcours Playwright.
