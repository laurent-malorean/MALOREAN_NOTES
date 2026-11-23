# 0045 — Cas d'usage de la recherche par le sens : un index de mots décoré, un calcul synchrone qui s'arrête entre deux lots, les mots seuls quand le sens manque

- **Date** : 2026-11-23
- **Statut** : acceptée
- **Complète** les fiches 0042 (la recherche), 0043 (le moteur) et 0044 (l'index de sens).

## Décision

- **Segments toujours à jour par un seul endroit** : `SegmentingIndex` enveloppe l'index de mots (`NoteIndex`) ; `put` range les segments de chaque note, `remove` et `clear` les effacent. `IndexedStore`, `RefreshIndex` (ouverture et surveillance) et `RebuildIndex` ne changent pas : ils parlent à un `NoteIndex`, qui est maintenant celui-ci. Aucun chemin d'écriture ne peut l'oublier. L'assemblage (brique `api`) l'enfile à la place de l'index de mots seul. « Reconstruire l'index » efface donc aussi les vecteurs (comme la base neuve de la fiche 0044) : le calcul repart après.
- **Calcul synchrone, arrêt entre deux lots** : `ComputeMeaning` boucle `without_vector` (16) → `embed_segments` → `put_vectors`, rappelle l'appelant avant le premier lot et après chacun ; `Break` arrête proprement. Un moteur qui rend moins de vecteurs que de segments est une erreur (sinon la boucle ne finirait jamais). Le texte calculé est le titre complet, une ligne vide, le texte (`Segment::embedding_text`).
- **Une question, des notes** : `SearchByMeaning` demande 10 segments par note voulue puis garde le meilleur de chaque note ; une note qui en aurait plus de 10 en tête peut en cacher une autre (choix simple, mesurable plus tard). L'extrait d'un segment est le titre de sa section suivi du début de son texte (`Excerpt::of_segment`), dans le type `Excerpt` de la recherche par mots.
- **Mixte** : la liste des mots est prise « plus récentes d'abord » (la recherche par mots n'a pas de pertinence), fusionnée par `fuse` avec celle du sens. Sens indisponible (modèle absent, aucun vecteur, échec) : les mots répondent seuls et `MeaningUse` dit pourquoi ; ce n'est jamais une erreur.
- **Modèle choisi** : `Preferences::meaning_model` / `save_meaning_model` (un nom inconnu vaut le modèle par défaut) ; l'adaptateur JSON garde le reste du fichier quand on écrit l'un ou l'autre. On peut supprimer n'importe quel modèle, même le choisi.
- **Reconstruire l'index de sens** : nouvelle méthode `MeaningIndex::clear_vectors(modèle)` (faux, SQLite et contrat) ; les segments sont refaits depuis l'index de mots, sans effacer les vecteurs des autres modèles.
- **Nom** : `MeaningStatus` désigne déjà l'état brut de l'index de sens ; le cas d'usage de l'écran des réglages se nomme `ReadMeaningStatus` et rend un `MeaningOverview`.

## Conséquences

- L'assemblage doit construire `SegmentingIndex` et lancer le calcul sur un fil d'arrière-plan (brique suivante).
- Un segment dont la note n'a plus de ligne dans l'index de mots est ignoré par les recherches (le résumé manque) ; `RebuildMeaning` ne purge pas une note disparue de l'index de mots, que `SegmentingIndex` oublie déjà à chaque suppression.
