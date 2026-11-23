# 0047 — CI à trois niveaux : barrière de commit rapide, mutation du diff en arrière-plan, CI complète à la livraison

- **Date** : 2026-11-23
- **Statut** : acceptée
- **Remplacée en partie par la fiche 0049** : la dette de mutation bloquante, la mutation du diff de tout le code à chaque commit et la CI complète à la livraison n'existent plus ; la barrière rapide, le crochet `post-commit` et la voie documentation restent.
- **Remplace en partie** la fiche 0015 (la mini CI complète avant chaque commit) et la règle « seul un passage complet autorise un commit ».

## Contexte

La CI prenait 41 % du temps de travail (30,2 h sur 73,6 h, 394 passages) ; une grosse livraison dépassait une heure (test de mutation Rust : 39 min pour 271 erreurs introduites). Objectif : moins de 25 minutes pour une livraison, moins de 10 minutes pour un petit commit, sans affaiblir un contrôle. Dépôt personnel, livraisons de temps à autre.

## Décision

1. **Barrière de commit** (`scripts/ci.sh`, par défaut) : fichiers privés, vocabulaire, longueur des fichiers, mise en forme, lints, `cargo deny`, tests des seules crates touchées et de leurs dépendantes, côté interface formatage, types, lints et tests des fichiers touchés (`vitest related`). Autorise commit et push. Documentation Markdown seule : contrôles du texte seulement.
2. **Mutation du diff du commit, en arrière-plan** : crochet `post-commit` versionné (`scripts/hooks`, branché par `scripts/install-hooks.sh`, `core.hooksPath` local). Copie figée du commit, `cargo mutants --in-diff` (tests de la seule crate de l'erreur) et Stryker incrémental. Un travail à la fois ; le plus récent remplace l'attente et couvre les commits sautés. Verdict : `.git/ci-mutation/<commit>.txt` et `.git/ci-mutation/dernier`, lu par `scripts/ci.sh --verdict`.
3. **Dette de mutation** : des survivants refusent le commit suivant, sauf s'il change un fichier cité ou un test de la même crate (ou de l'interface). Pas d'option de contournement. Un commit de documentation seule passe. Le push n'est jamais bloqué. Payée quand un verdict suivant est OK (il reteste alors aussi les fichiers cités).
4. **Livraison** : `scripts/ci.sh --complet` (couverture globale, parcours complets et ralentis, mutation de tout le code), obligatoire, refusée si une dette est ouverte ou si le dernier verdict n'est pas OK.

## Pourquoi

- La règle des 100 % de mutation n'est jamais supprimée : elle est vérifiée après le commit au lieu d'avant. Un commit peut exister quelques minutes avec un test manquant ; c'est acceptable pour un dépôt personnel, et la dette l'empêche de s'accumuler (le commit suivant doit la payer) et la livraison de passer.
- La mutation représente l'essentiel du temps ; la sortir du chemin du commit fait passer la barrière de 30 à 60 minutes à moins d'une minute.

## Mesures (23/11/2026, Mac M4 à 10 cœurs)

| Mesure | Avant | Après |
|---|---|---|
| Commit de documentation seule | passage complet (30 à 60 min) | 3 à 5 s |
| Petit commit, fichier d'interface | passage complet | 14 s |
| Petit commit, fichier de l'api | passage complet | 23 s |
| Petit commit, fichier du domaine (tests des cinq crates) | passage complet | 55 s |
| Trois fichiers (domaine, api, interface) | passage complet | 56 s |
| Mutation Rust, échantillon de 86 erreurs (4 fichiers de la recherche par le sens), tests de tout l'espace | 44 s par erreur (12 erreurs en 523 s, arrêté) | |
| Même échantillon, tests de la seule crate de l'erreur | | 1088 s (12,6 s par erreur), 0 survivante, 65 attrapées, 19 non compilables, 2 délais |
| Mutation du diff d'un petit commit (5 fichiers, 41 lignes), en arrière-plan | | 247 s |
| Passage sans changement | | `--verifier` : instantané |

## Essayé, non gardé ou non mesuré

- `cargo-nextest` : 21 s contre 36 s sur la seule crate `infrastructure` (compilation comprise pour `cargo test`), 23 s contre environ 25 s sur tout l'espace de travail ; pas de gain net démontré, non branché.
- Non mesurés (pas de passage complet de comparaison, voulu par l'utilisateur) : 6 ou 8 tâches en parallèle, profil de test (`debug`, `opt-level` des dépendances), délai des erreurs qui bouclent, `sccache`, mutation Rust incrémentale. `target/` n'est déjà pas copié par cargo-mutants : le coût est la compilation à froid par tâche (53 s).
- Le passage complet de comparaison avant correction n'a pas été fini : l'égalité des verdicts des tests de la seule crate et de tout l'espace repose sur l'absence de survivante sur l'échantillon.

## Conséquences

- `CLAUDE.md`, `doc/code.md` (§ 7 et « Temps de la CI ») et `doc/specs/ci-plus-rapide.md` décrivent les trois niveaux ; `scripts/test-ci-gate.sh` et `scripts/test-ci-doc-only.sh` prouvent la barrière, la dette et la voie documentation.
- Une erreur du domaine qu'aucun test du domaine n'attrape (seulement une autre crate) devient une survivante : le test s'écrit dans la crate du code.
