# 0044 — Index de sens : les segments et leurs vecteurs dans le fichier de l'index de mots, comparés en Rust

- **Date** : 2026-11-23
- **Statut** : acceptée
- **Complète** les fiches 0028 (un fichier d'index par espace de travail) et 0042 (vecteurs en BLOB, comparés en Rust).

## Décision

- **Deux ports dans `application`** (`meaning_index.rs`) : `MeaningIndex` (écrire) et `MeaningSearch` (lire), pour qu'un cas d'usage ne dépende que de ce dont il a besoin. Faux en mémoire `MemoryMeaningIndex` ; un seul contrat (`meaning_index_contract`) joué sur le faux et sur l'adaptateur SQLite.
- **Clé d'un segment** : FNV-1a 64 bits du titre complet, d'un octet nul, puis du texte (le même hachage que la fiche 0028, fonction pure du domaine). Mise à jour par différence : `domain::segments::reuse` apparie les nouveaux segments aux anciens par clé, un ancien servant une fois ; les autres sont effacés avec leurs vecteurs.
- **Même fichier, même connexion** : `SqliteMeaningIndex` emprunte la connexion de `SqliteIndex` (`SqliteIndexes::open_with_meaning`). Le format de l'index passe à 6 : une base de l'ancien format est remplacée comme d'habitude (les vecteurs se recalculent).
- **Segments rangés par chemin de note, sans clé étrangère vers la note** : l'index de mots remplace une note à chaque mise à jour (la ligne est effacée puis recréée) ; une clé étrangère effacerait les segments, donc les vecteurs, à chaque frappe enregistrée. `NoteIndex::remove` efface donc les segments à la main, dans la même transaction, et « Reconstruire l'index » repart d'une base neuve : les deux index ne se contredisent jamais sur ce qui est oublié. Entre la mise à jour d'une note et le rangement de ses nouveaux segments, l'index de sens garde les anciens, qu'il remplace ensuite. Un vecteur est lié à son segment par clé étrangère (effacement en cascade, `PRAGMA foreign_keys = ON` à chaque ouverture, testé sur base rouverte).
- **Vecteurs** : BLOB de décimaux 32 bits en petit-boutiste, une ligne par segment et par modèle, dans une table ordinaire (une table sans identifiant de ligne mettait chaque vecteur dans une page de débordement : 40 Mo au lieu de 22 Mo pour 7 000 segments). Comparaison en Rust, ligne par ligne, avec un seul tampon de lecture : seuls l'identifiant, la note, la place et le score de chaque segment restent en mémoire, le texte n'est lu que pour les segments gardés. Un vecteur dont la taille n'est pas celle du modèle, ou une valeur qui n'est pas un BLOB, rend l'index indisponible sans effacer la base (comme les autres valeurs abîmées).
- **Ordre** : score décroissant ; à égalité, chemin de la note puis place du segment dans la note (notes proches : chemin).

## Mesures (23/11/2026, M4, build `release`, 700 notes de 10 segments de 800 caractères, vecteurs de 384 dimensions tirés au hasard)

| Opération | Durée |
|---|---|
| Ranger les 7 000 segments et leurs vecteurs | 0,25 s |
| `nearest` (10 segments les plus proches sur 7 000) | 6 à 9 ms |
| `related_notes` (une note de 10 segments contre 6 990 autres) | 15 à 21 ms |
| Taille du fichier d'index (7 000 segments, textes compris, index de mots vide) | 21,9 Mo |
