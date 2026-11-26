# 0049 — Politique de CI : la mutation n'est plus exigée à chaque commit (domaine seul, non bloquante) ; échantillon par fonction ailleurs ; fin de fonction sans mutation ; tag `ci-verte`

- **Date** : 2026-11-23
- **Statut** : acceptée, accord explicite de l'utilisateur
- **Remplace en partie** la fiche 0006 (test de mutation à chaque envoi, seuil 100 %) et la fiche 0047 (la dette de mutation qui refusait le commit suivant, la CI complète obligatoire à la livraison).

## Contexte

Une CI « complète » lancée en fin de fonction a duré plus de 2 heures : `--complet` mutait tout le code (2 556 erreurs introduites), dont 34 qui bouclent, chacune attendant une coupure automatique passée de 20 s à 209 s. La CI prenait déjà 41 % du temps de travail. Le projet est une application locale, un développeur et des agents, des livraisons de temps en temps, rien en production à chaque push. Personne ne fait de la mutation à chaque commit : la pratique courante est une mutation rare, ciblée et non bloquante.

## Décision

1. **Barrière à chaque commit** (`scripts/ci.sh`, moins de 3 minutes) : formatage, lints, dépendances, tests, couverture à 95 % (interface comprise : tests et seuils de Vitest). Pas de Stryker. Documentation Markdown seule : contrôles du texte.
2. **Mutation du domaine** (`crates/domain`, règles pures), en arrière-plan après un commit qui le touche (crochet `post-commit`), sur le diff, coupure des erreurs qui bouclent à 30 s. **Non bloquante** : un survivant s'écrit dans le verdict et dans la liste de suivi (`.git/ci-mutation/suivi.txt`), il ne refuse jamais le commit suivant. La dette bloquante de la fiche 0047 est supprimée.
3. **Reste du Rust et interface** : pas de mutation à chaque commit. `scripts/ci.sh --echantillon` (à la demande, en arrière-plan, non bloquant) : un dixième des erreurs du diff depuis le tag, en mode « une erreur par fonction » (cargo-mutants : corps de fonction remplacé ; les erreurs d'opérateurs une à une, de forme « replace X with Y in … », sont écartées par `--exclude-re ' in '`, ce qui divise le nombre d'erreurs : 1 800 au lieu de 2 560 sur tout le code), tranche choisie au hasard (`--shard k/10`), coupure 90 s. Stryker de l'interface : à la demande (`--mutation-interface`).
4. **Fin de fonction** : `scripts/ci.sh --fonction` (moins de 10 minutes) : la barrière en entier, couverture globale, tous les parcours (normaux et lecture ralentie), dépendances ; sans mutation.
5. **Livraison** : `scripts/ci.sh --livraison` (moins de 25 minutes) : la fin de fonction, la mutation du domaine et l'échantillon du diff depuis le tag local `ci-verte` ; un survivant refuse la livraison ; à son succès, `ci-verte` avance à HEAD. `ci-verte` est un tag git local, jamais poussé, posé d'abord sur le dernier commit dont tout le code a passé la mutation à 100 % (`scripts/ci-verte.sh poser`), déplacé par `scripts/ci-verte.sh avancer`.
6. **`--tout-le-code`** (mutation de tout le code, plus de 2 heures) reste une option exceptionnelle, jamais lancée par une règle. `--complet` et `--sans-mutation` disparaissent (refusés avec un message).

## Pourquoi

- Le coût de la mutation (plus d'une heure) est sans commune mesure avec ce qu'elle protège ici ; le domaine, lui, est petit, pur et rapide à muter (42 erreurs en environ 70 s), et c'est là que les règles métier se cassent en silence.
- Une mutation non bloquante ne perd rien : les survivants restent visibles et traités quand le temps le permet. La règle des 100 % reste le seuil visé, elle n'est plus un verrou de commit.

## Mesures (23/11/2026, Mac M4)

La mutation du domaine (42 erreurs, deux fichiers du sens) donne le même verdict avec la coupure de 30 s qu'avec la coupure automatique : 38 attrapées, 4 non compilables, 0 survivante, environ 69 s dans les deux cas. `--fonction` : environ 2 minutes 40 (Rust 98 s de couverture globale, parcours normaux 60 s et ralentis 60 s en parallèle). Barrière : 3 à 5 s (documentation), 64 s (interface), 80 à 100 s (Rust). Échantillon d'un dixième du diff depuis `f637671` : 81 à 93 s. Détails et pistes écartées : `doc/developpement/code.md`, « Temps de la CI ».

## Conséquences

- `CLAUDE.md`, `doc/developpement/code.md` (§ 7, « Temps de la CI »), `doc/developpement/architecture.md`, `doc/specs/ci-plus-rapide.md` et `CLAUDE.local.md` portent la nouvelle règle ; `scripts/test-ci-gate.sh` prouve les scénarios (domaine non bloquant, tag, échantillon, livraison, ménage).
- La coupure de 90 s de l'échantillon n'a pas été comparée à la coupure automatique sur l'api ou l'infrastructure : à refaire si une erreur est vue « boucle » à tort.
