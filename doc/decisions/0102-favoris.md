# 0102 — Favoris

Date : 27/11/2026. Spécification : `doc/specs/favoris.md`.

## Contexte

Les favoris de Notion forment une liste qui s'allonge sans ordre. Ici, ils doivent rester des notes : lisibles, rangeables et modifiables à la main, comme tout le reste.

## Décision

- **Une note ordinaire.** Les favoris tiennent dans une seule note Markdown, la note des favoris, que l'utilisateur range comme il veut. Aucun format nouveau : un contenu est en favori quand la note a une ligne faite uniquement d'un lien entre notes qui le désigne (`- [[lien]]`, avec ou sans marque de liste). Un lien au milieu d'une phrase ne compte pas et n'est jamais retiré. La règle est pure, dans `domain::favorites`.
- **Le choix est gardé par espace de travail dans les préférences de l'application**, jamais dans le dossier de l'espace (comme le dossier des modèles, fiche 0077) : champ `favorites` de chaque espace dans `preferences.json`, le chemin de la note. Un espace n'a pas de note des favoris tant qu'on n'en choisit pas ; ne plus en utiliser retire le choix sans toucher à la note.
- **La note est repérée par son chemin et le suit** : `FavoritesStore`, une couche de l'espace ouvert (entre l'historique et l'index), met le choix à jour quand la note ou son dossier est renommé ou déplacé, et l'oublie à la mise à la corbeille, pour tous les gestes (écran, IA, CRM qui emporte ses fiches). Une note disparue du disque n'est plus la note des favoris ; le choix reste gardé, la note retrouvée à son chemin le redevient.
- **L'étoile ajoute ou retire des lignes.** Ajout : une ligne `- [[lien]]` à la fin de la note, avec le lien du menu des liens (`[[titre]]`, `[[Dossier/titre]]` en cas d'homonyme, `[[nom.canvas]]` pour un canvas) ; déjà en favori, rien ne change. Retrait : toutes les lignes qui désignent le contenu (doublons compris), **sans confirmation**, et le retrait rend ces lignes avec leur place : le bouton « Annuler » les remet à l'identique (fins de ligne, absence de fin de ligne finale, en-tête intact).
- **Écriture sûre** : l'ajout, le retrait et l'annulation gardent d'abord le texte d'avant en version et écrivent par le stockage de l'espace (l'index suit). L'écran qui montre la note voit le changement par la surveillance du dossier, comme pour tout changement fait par une IA.
- **Pas d'étoile pour une fiche du CRM** (seul le CRM entier), ni pour la note des favoris, ni pour une entrée de cahier ou un nœud de carte mentale. Refusé avec un message clair.
- **Outils pour les IA** : `add_favorite`, `remove_favorite` (retenus par le garde-fou du web) et `list_favorites`, avec le paramètre `workspace` ; l'IA désigne le contenu par son chemin et ne choisit jamais la note des favoris.

## Conséquences

- Le contrat des commandes pour l'interface est dans `doc/specs/favoris.md`, section 10.
- Une note des favoris qui change de nom dans l'interface garde son rang sans autre geste ; une note renommée ou déplacée hors de l'application (Finder) n'est plus trouvée : l'entrée « Favoris » ouvre alors de nouveau les réglages.
- Un contenu mis à la corbeille laisse sa ligne dans la note (lien sans cible) : ni listée ni retirée par l'étoile, l'utilisateur la retire à la main.
