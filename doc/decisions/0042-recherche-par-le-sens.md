# 0042 — Recherche par le sens : un petit modèle exécuté dans l'application, des vecteurs dans l'index, deux listes fusionnées

- **Date** : 2026-11-23
- **Statut** : acceptée
- **Complète** la fiche 0028 : même fichier d'index par espace de travail, la recherche par mots ne change pas.

## Contexte

L'utilisateur veut retrouver une note par ce qu'elle dit, pas par ses mots (« dessert aux fruits » trouve la tarte aux pommes), et que Claude puisse le faire par un outil. Contraintes : sur le Mac seulement, aucune installation pour l'utilisateur (ni Python, ni service extérieur), notes privées (rien ne part sur le réseau), l'application reste légère.

## Essai mesuré (23/11/2026, M4, 28 notes, 411 segments, 20 questions écrites par l'utilisateur sur ses propres notes)

| Modèle | Poids | Dimensions | Bonne note en tête | Dans les 3 premières | Calcul des 411 segments | Par question |
|---|---|---|---|---|---|---|
| E5 petit | 470 Mo | 384 | 13/20 | 17/20 | 6 s (Python, processeur) | 4 ms |
| E5 moyen | 1,0 Go | 768 | 14/20 | 17/20 | 10 s | 6 ms |
| E5 grand | 2,2 Go | 1 024 | 16/20 | 18/20 | 37 s | 28 ms |

En Rust (bibliothèque `candle`, essai jetable) : les vecteurs du E5 petit sont identiques à ceux de Python (cosinus 1,00000 sur 6 segments) ; 411 segments en 30 s sur le processeur, 16 s en les triant par longueur (moins de remplissage), 10,9 s en les triant et en calculant sur le GPU du Mac (Metal).

## Décision

- **Deux modèles proposés**, le moyen n'apportant presque rien : **E5 petit** (`intfloat/multilingual-e5-small`, par défaut) et **E5 grand** (`intfloat/multilingual-e5-large`). L'utilisateur choisit dans les réglages (fiche à venir pour l'écran) ; chaque modèle a son poids, son état (téléchargé ou non) et un bouton pour le supprimer.
- **Exécution dans l'application, en Rust** : `candle` (`candle-core`, `candle-nn`, `candle-transformers`, fonctions `accelerate` et `metal`) et `tokenizers` (sans fonction par défaut). Le petit modèle est un `BertModel` (config `model_type: bert`) avec un tokenizer XLM-R ; le grand est un `XLMRobertaModel` (`model_type: xlm-roberta`, les positions commencent après le remplissage) : l'adaptateur choisit selon `model_type`. Poids lus par `VarBuilder::from_buffered_safetensors` (pas de `unsafe`). Calcul sur Metal, repli sur le processeur si Metal manque. Segments triés par longueur et traités par lots de 16, texte tronqué à 512 jetons, moyenne des jetons (avec le masque) puis normalisation. E5 demande les préfixes `query: ` (question) et `passage: ` (segment) : ils sont l'affaire de l'adaptateur.
- **Téléchargement une fois, au premier usage** de la recherche par le sens (ou depuis les réglages), avec une barre de progression : `https://huggingface.co/<dépôt>/resolve/<révision>/<fichier>` pour `config.json`, `tokenizer.json` et `model.safetensors`, en HTTPS, révision figée, taille et SHA-256 de chaque fichier écrits dans le domaine ; un fichier dont la somme ne correspond pas est refusé et effacé. Rangé dans `~/Library/Application Support/<app>/models/<modèle>/` (jamais iCloud), écrit dans un fichier temporaire puis renommé. Tant que le modèle n'est pas là : la recherche par mots marche seule, le mode « par le sens » est grisé avec une explication. Seule fois où l'application parle au réseau, à la demande de l'utilisateur.
- **Stockage : des vecteurs dans des colonnes BLOB de l'index SQLite existant, comparés en Rust** (produit scalaire des vecteurs normalisés), et non l'extension `sqlite-vec` : elle exige un chargement natif par `unsafe` (interdit par le projet, fiche de qualité), et l'écart ne se voit pas à cette taille (7 000 segments × 384 dimensions = 2,7 millions de multiplications, quelques millisecondes). Un vecteur est gardé par segment **et par modèle** : changer de modèle ne perd rien et l'ancien reste utilisé tant que le nouveau n'a pas fini son calcul. La table des segments retient le titre de la note, celui de la section, le texte et un hachage de ce texte.
- **Mise à jour par différence** : à chaque écriture, l'index recalcule les segments de la note, garde les vecteurs des segments dont le hachage n'a pas changé, efface ceux qui ont disparu et ne calcule que les nouveaux. Premier calcul (et changement de modèle) en arrière-plan, par lots, sans bloquer l'interface ; l'avancement (segments faits sur segments à faire) est annoncé à l'interface.
- **Recherche mixte** : la liste de la recherche par mots (index actuel) et celle des segments les plus proches (une note compte par son meilleur segment) sont fusionnées par rang réciproque (RRF, constante 60) en un classement de notes. Une fonction pure du domaine.
- **Usages** : outil de l'application pour Claude « chercher par le sens » (segments et leur note, comme l'outil de recherche actuel) ; pour l'utilisateur, un mode « par le sens » dans la recherche et la liste « notes proches » de la note ouverte (les notes dont les segments sont les plus proches des siens, elle-même exclue).
- **Réindexation** : « Reconstruire l'index » repart de zéro pour les mots ; l'index de sens se reconstruit à la demande depuis l'écran des réglages (état : segments indexés, modèle utilisé, avancement), et seulement là.
- **Vocabulaire** (à inscrire dans l'ontologie avant le code) : segment (déjà fait), modèle de sens, vecteur de sens (et non « empreinte », mot déjà pris par la détection des changements), index de sens, recherche par le sens, notes proches.

## Conséquences

- L'application grossit de quelques dizaines de Mo (candle, tokenizers) et sa compilation s'allonge ; les modèles ne sont pas dans l'application.
- Le premier calcul d'un espace de 2 000 notes (environ 7 000 segments) prend de l'ordre de la minute à plusieurs minutes avec le petit modèle, en arrière-plan : la recherche par mots reste disponible, le mode « par le sens » s'enrichit au fil du calcul.
- La base grossit de 1,5 Ko par segment avec le petit modèle (384 dimensions en 32 bits), 4 Ko avec le grand.
- Le projet n'a plus de dépendance « zéro réseau » stricte : un téléchargement, explicite et vérifié par somme de contrôle.
