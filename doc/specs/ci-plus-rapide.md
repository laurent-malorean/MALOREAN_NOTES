# CI plus rapide

Spécification de la tâche, demandée par l'utilisateur le 23/11. Ce document se lit seul.

## 1. Pourquoi

Un passage complet de `scripts/ci.sh` (mutation comprise) prend plus d'une heure sur une livraison importante, pour une application de prise de notes. L'utilisateur attend de la CI qu'elle soit exigeante **et** rapide. Cette tâche réduit la durée sans affaiblir un seul contrôle.

## 2. Mesures de départ (23/11/2026, Mac M4 à 10 cœurs, 32 Go, livraison de la recherche par le sens : environ 6 000 lignes de Rust neuves)

| Étape | Durée mesurée |
|---|---|
| Test de mutation Rust (`cargo mutants --workspace … --jobs 4` lancé par `ci.sh`) | 39 min pour 271 erreurs introduites : 167 attrapées, 85 non compilables, 15 par dépassement du délai (20 s chacune), 4 survivantes |
| Une erreur introduite dans la crate `api` | 41 s de compilation et 26 s de tests |
| Une erreur introduite dans `application` (valeur triviale) | 0 à 5 s de compilation, 0 s de tests |
| Reste de la CI (formatage, lints, tests avec couverture, dépendances, parcours de l'interface, mutation de l'interface incrémentale) | environ 15 à 20 min, en parallèle du test de mutation Rust |

Déjà en vigueur (ne pas refaire) : Rust et interface en parallèle, mutation de l'interface incrémentale, parcours ralentis seulement si `ui/` a changé, copie figée (`--copie`), test de mutation limité au code modifié (`--in-diff`).

## 3. Objectif

Un passage complet d'une livraison comparable à celle-ci, **en moins de 25 minutes**, et d'un petit commit (quelques fichiers) en moins de 10 minutes, avec **exactement le même niveau d'exigence** : mêmes contrôles, mutation à 100 % sur le code modifié, aucun test affaibli, aucun mutant écarté sans raison écrite.

## 4. Pistes à mesurer une par une

Pour chacune : mesurer la durée du test de mutation Rust sur le même lot de code (les fichiers de la recherche par le sens, par exemple), avant et après ; ne garder que ce qui fait gagner du temps sans changer le verdict (même ensemble d'erreurs attrapées). Écrire les durées dans la fiche de décision.

1. **Tests joués par erreur introduite** : aujourd'hui `--workspace` rejoue les tests de tout l'espace pour chaque erreur. Ne rejouer que ceux de la crate de l'erreur (et de celles qui en dépendent si leurs tests la couvrent seuls). Piège : une erreur dans `domain` ou `application` n'est parfois attrapée que par un test d'une autre crate (contrats joués par `infrastructure`) ; comparer l'ensemble des erreurs attrapées avant et après.
2. **Nombre de tâches en parallèle** : `--jobs 4` pour 10 cœurs. Essayer 6 et 8 ; surveiller la mémoire, le disque et la durée réelle (la compilation de `candle` est lourde).
3. **Copies du dossier de compilation** : cargo-mutants copie l'arbre de travail pour chaque tâche, `target/` compris (avait rempli le disque le 23/11). Ne pas copier `target/` (option de copie de cargo-mutants) et partager un dossier de compilation par tâche plutôt que d'en recompiler un à froid ; mesurer.
4. **Réglages de compilation du profil de test** : moins d'informations de débogage (`debug = "line-tables-only"` ou `0`), dépendances lourdes (`candle`, `tokenizers`) optimisées (`[profile.dev.package."*"] opt-level`) pour que les tests qui calculent soient plus rapides ; mesurer la compilation à froid et à chaud, et la vitesse des tests.
5. **Délai des erreurs qui bouclent** : 15 erreurs coûtent chacune 20 s d'attente (environ 5 min en tout). Voir si l'écart se réduit (multiplicateur de délai de cargo-mutants, plancher plus bas) sans couper un test normal lent ; sinon, laisser.
6. **Lanceur de tests** : essayer `cargo nextest` (processus par test, parallélisme) pour les tests et pour la mutation ; mesurer.
7. **Cache de compilation** : essayer `sccache` pour les dépendances recompilées après un ménage du dossier ; mesurer.
8. **Ordre et chevauchement** : lancer le test de mutation Rust dès que ses propres prérequis sont prêts, sans attendre les parcours de l'interface (et inversement) ; vérifier que `ci.sh` n'attend rien d'inutile.
9. **Éviter de rejouer ce qui est déjà validé** : si `--verifier` montre que le code est celui d'une CI complète déjà passée, ne rien relancer (déjà prévu) ; voir si le résultat de la mutation Rust peut aussi être incrémental, comme Stryker (ne retester que les erreurs dont le code ou un test qui le couvre a changé depuis le dernier passage réussi). Piège : un test affaibli ou supprimé doit toujours refaire échouer.

## 5. Règles de la tâche

- Un changement à la fois, mesuré, gardé seulement s'il fait gagner du temps ; chaque essai raté est noté (pas de piste perdue deux fois).
- Aucun contrôle retiré, aucun seuil baissé, aucun mutant écarté pour aller plus vite ; en cas de doute, la CI reste la plus exigeante.
- `scripts/ci.sh` ne se modifie pas pendant qu'un passage tourne (voir `doc/code.md`, « Temps de la CI ») : le remplacer d'un coup.
- Vérifier à la fin, sur un passage complet réel, que les durées visées sont tenues et qu'une erreur volontairement introduite dans le code (puis retirée) est toujours attrapée.
- Mettre à jour `doc/code.md` (section « Temps de la CI » : constats, ce qui réduit le temps, ce qui ne marche pas) et la fiche de décision (numéro suivant) dans le même commit.
