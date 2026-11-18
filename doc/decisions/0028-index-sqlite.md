# 0028 — Index : une base SQLite par espace de travail, hors de lui, que les fichiers peuvent toujours reconstruire

- **Date** : 2026-11-18
- **Statut** : acceptée
- **Remplace** en partie la fiche 0009 : la règle de recherche ne change pas, mais la recherche ne relit plus les fichiers.

## Contexte

La liste des notes, le tri, le filtre par étiquette, la liste des étiquettes et la recherche relisaient tous les fichiers à chaque rafraîchissement (fiches 0009, 0020, 0021). Le temps grandit avec l'espace de travail, et un espace rangé dans iCloud Drive se relit plus lentement encore. Mesure sur un espace de travail généré de 2 000 notes (9,3 Mo, 11 dossiers), fichiers déjà en mémoire du Mac, en version optimisée :

| Action | Avant (relecture des fichiers) | Après (index) |
|---|---|---|
| Ouvrir l'espace de travail (dossiers, notes de la racine, étiquettes, toutes les notes) | 83 ms | 10 ms (index à jour) ; 608 ms la toute première fois, le temps de le remplir |
| Lister un dossier de 727 notes | 14 ms | 0,8 ms |
| Chercher un mot présent presque partout (« jardin », 100 résultats montrés) | 163 ms | 12 ms |
| Chercher un mot rare (« zéphyr », 21 résultats) | 104 ms | 1,5 ms |
| Filtrer par étiquette | 43 ms | 3 ms |

Pistes regardées :

- **Un index en mémoire, refait à chaque lancement** : simple, mais chaque ouverture relit tout l'espace de travail. Rejeté.
- **Un fichier d'index dans l'espace de travail** (comme `.obsidian/`) : il voyagerait avec iCloud Drive, entrerait en conflit entre deux Mac et salirait le dossier de l'utilisateur. Rejeté.
- **Une base SQLite par espace de travail, dans le dossier de support de l'application**, avec la recherche plein texte intégrée de SQLite (FTS5). Retenu.

## Décision

- **Port `NoteIndex`** dans `application` (relevés, garder, oublier, tout oublier, notes d'un dossier, toutes les notes, notes d'une étiquette, recherche) et **port `IndexOpener`** (l'index d'un espace de travail). Tests de contrat joués sur l'index en mémoire (`MemoryIndex`, aussi celui d'une session sans index gardé) et sur l'adaptateur `SqliteIndex` d'`infrastructure`.
- **Ce que l'index garde de chaque note** : chemin, dossier, titre affiché, épinglage, étiquettes (dans l'ordre de l'en-tête, et une table pour le filtre), date de modification, taille du fichier, contenu, et son texte sans majuscule ni accent, découpé en trigrammes par FTS5 (`tokenize = 'trigram case_sensitive 1'`).
- **La recherche ne change pas de règle** : le texte est ramené par la même fonction du domaine (`folded`) que les mots cherchés ; un mot d'au moins trois caractères passe par les trigrammes (une phrase FTS5, donc un morceau de texte, même au milieu d'un mot), un mot plus court par `instr` sur le même texte. L'index rend les notes qui ont tous les mots ; le cas d'usage les trie, garde les 100 premières et n'en tire l'extrait qu'ensuite.
- **Le tri reste en Rust** (`domain::note::sorted`) sur les résumés lus dans l'index : majuscules et accents ignorés exactement comme avant, sans dépendre d'une collation SQLite.
- **Où** : `~/Library/Application Support/<identifiant de l'application>/index-<empreinte>.sqlite`, un fichier par espace de travail. L'empreinte est un FNV-1a 64 bits du dossier : stable d'une version de Rust à l'autre, contrairement au hachage de la bibliothèque standard. Ce dossier n'est jamais synchronisé par iCloud. Renommer un espace de travail garde son index ; le retirer de la liste laisse son fichier (inoffensif, reconstructible).
- **Les fichiers Markdown restent la seule vérité** :
  - à l'ouverture d'un espace de travail, l'index relit seulement les notes dont la date ou la taille a changé (relevé pris sans ouvrir le fichier, port `NoteStore::stamps`), lit les nouvelles et oublie les disparues ;
  - chaque écriture, déplacement, renommage, mise à la corbeille et restauration faits par l'application passe par `IndexedStore`, qui met l'index à jour aussitôt ; un dossier déplacé, mis à la corbeille ou restauré relance la mise à jour par relevés ;
  - un changement fait hors de l'application (surveillance) met l'index à jour avant d'être annoncé à la page ;
  - la commande « Reconstruire l'index » de la palette repart d'une base neuve et relit chaque note ;
  - une base qui ne s'ouvre pas, n'a pas ses tables ou porte un autre numéro de format (`user_version`, constante `FORMAT_VERSION`) est remplacée par une base vide, aussitôt remplie ; une base qui se révèle abîmée en cours d'usage perd son fichier, et la reconstruction (demandée, ou au prochain lancement) repart de zéro.
- **Contrôle à l'ouverture volontairement léger** (en-tête, format, tables) : `PRAGMA quick_check` relisait toute la base et coûtait 100 ms à chaque ouverture, plus que l'ouverture elle-même.
- **Dépendance** : `rusqlite` avec SQLite compilé dans l'application (`bundled`), FTS5 compris. Licences MIT (SQLite lui-même est dans le domaine public) : déjà acceptées par `deny.toml`, qui n'a pas changé.

## Conséquences

- La liste, le tri, les étiquettes et la recherche ne lisent plus les fichiers : leur temps ne dépend presque plus de la taille de l'espace de travail.
- Le premier lancement après cette version (ou une reconstruction) relit tout l'espace de travail une fois, plus lentement qu'avant (le texte est ramené et découpé en trigrammes).
- La base occupe environ 2,7 fois le texte des notes (25 Mo pour 9,3 Mo) : contenu, texte ramené et trigrammes.
- Les liens entre notes et les liens entrants relisent encore les fichiers (fiche 0016) ; ils pourront passer par le contenu gardé dans l'index.
- Un fichier réécrit hors de l'application à la même taille et dans la même milliseconde garderait le même relevé : seule la reconstruction rattraperait ce cas.
