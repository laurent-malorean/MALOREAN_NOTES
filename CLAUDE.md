# MALOREAN Notes

Application Mac de notes, toutes en Markdown. Rust + Tauri 2 + CodeMirror 6.

@CLAUDE.local.md

## Documents de référence

- `doc/produit.md` : vision, principes, périmètre.
- `doc/developpement/architecture.md` (+ `architecture.svg`) : couches, organisation du projet, parcours d'une action.
- `doc/developpement/code.md` : règles de qualité et leurs contrôles.
- `doc/ontology.md` : vocabulaire, à employer partout.
- `doc/developpement/travail-en-branches.md` : une branche et un dossier de travail (`worktrees/<fonction>`) par fonction ; nommage, création, fusion, nettoyage.
- `doc/decisions/` : fiches des décisions d'architecture.
- `doc/specs/` : spécifications fonctionnelles validées, une par fonction.
- `doc/format/` : formats de fichier, un par type de contenu (note, cahier de recherche, carte mentale, canvas, CRM) et l'espace de travail ; seule description du format, les specs y renvoient.
- `doc/mcp/` : les outils du serveur MCP pour les IA, la liste puis une page par partie ; à tenir à jour avec chaque outil ajouté ou changé.
- `doc/README.md` : sommaire de la documentation.

## Méthode

- **Ontologie d'abord** : un nouveau mot s'ajoute à `doc/ontology.md` avant d'apparaître dans le code.
- **Vocabulaire unique** : un seul mot par notion, partout (écrans, documents, code, tests) ; pas de synonymes ; le mot vient de `doc/ontology.md`.
- **TDD** : écrire le test qui échoue, puis le code minimal qui le fait passer, puis nettoyer. Pas de code de production sans test qui l'exige.
- Documentation à jour dans le même commit que l'évolution.

## Organisation du travail

- `todo.md` ne liste que ce qui est à produire (fonctions, bugs, code de qualité) ; les règles de développement vont dans `CLAUDE.md` et `doc/developpement/code.md` ; l'ordre des prochaines tâches est dans `CLAUDE.local.md`.
- **Bugs d'abord** : la section « Bugs » de `todo.md` passe avant toute nouvelle fonction.
- **Une fonction = une branche et un dossier de travail** (`worktrees/<fonction>`, voir `doc/developpement/travail-en-branches.md`) : plusieurs agents peuvent avancer en même temps, chacun dans son dossier ; seul l'agent principal fusionne dans `main`.
- **Un agent par tâche**, avec une consigne qui se suffit à elle-même ; les agents travaillent l'un après l'autre, jamais deux en même temps sur la même branche.
- Chaque tâche : TDD, mini CI, commit, case cochée dans `todo.md` aussitôt.
- Une tâche marquée « à préciser » ou « à discuter » attend l'utilisateur : ne pas la coder.

## CI : barrière à chaque commit, mutation ciblée et non bloquante (doc/decisions/0049)

- **Barrière de commit** : avant chaque commit, `./scripts/ci.sh` (moins de 3 minutes ; quelques secondes pour de la documentation Markdown seule). Secrets exclus, vocabulaire, longueur des fichiers, mise en forme, lints sans avertissement, dépendances, tests avec couverture (Rust ≥ 95 %, interface : seuils de Vitest). **Elle autorise le commit et le push** ; si elle échoue : ne pas commiter, corriger, relancer. Jamais de contournement (`--no-verify`, test désactivé, lint levé sans raison).
- **La mutation n'est plus une barrière** : après un commit qui touche `crates/domain`, le crochet `post-commit` (posé une fois par `scripts/install-hooks.sh`) mute le diff du domaine en arrière-plan (coupure 30 s) ; `./scripts/ci.sh --verdict` donne le résultat. Un survivant s'écrit dans la liste de suivi (`.git/ci-mutation/suivi.txt`) à traiter ; **il ne refuse jamais un commit**. Le reste du code (application, api, infrastructure, interface) n'est pas muté à chaque commit : seulement à la demande (`--echantillon`, `--mutation-interface`) ou à la livraison.
- **Fin de fonction** : `./scripts/ci.sh --fonction` (moins de 10 minutes) : la barrière en entier, couverture globale, tous les parcours (normaux et lecture ralentie), sans mutation. `--copie` la joue sur une copie figée pendant qu'on continue.
- **Livraison** : `./scripts/ci.sh --livraison` (moins de 25 minutes) : la fin de fonction, puis la mutation du domaine et un échantillon (un dixième, une erreur par fonction) du diff Rust depuis le tag local `ci-verte` ; à son succès, `ci-verte` avance à HEAD. `--tout-le-code` (mutation de tout le code, plus de 2 heures) est exceptionnel : jamais lancé par une règle.
- **Fin de tâche d'un agent** (10 minutes au plus sur le Mac) : `./scripts/ci.sh` (barrière, à chaque commit) puis `./scripts/ci.sh --fonction`, **sans mutation**. La mutation se joue sur GitHub, par groupes parallèles (`.github/workflows/mutation.yml`, groupes décrits dans `scripts/mutation-groupes.json`, chacun de 10 à 20 minutes, doc/decisions/0059) ; un survivant se corrige à la tâche suivante (jamais une barrière). `./scripts/ci.sh --branche` (mutation du diff de la branche sur le Mac) reste possible à la demande, jamais imposé.
- **Mutation de nuit par groupes sur GitHub** (doc/decisions/0059) : toute la mutation du Rust (domaine, application, infrastructure, api) se joue chaque nuit (02:17 UTC) et à la demande (onglet Actions, « Run workflow », entrée facultative « groupe »), un groupe de mutation par machine, 25 minutes au plus ; un survivant fait échouer son groupe (e-mail) ; le résumé de l'exécution donne le bilan de chaque groupe.
- **Rejeu des dépassements** (doc/decisions/0053) : les erreurs dont le test dépasse le délai sont rejouées une fois avec un délai x 4 par `scripts/ci.sh` et la CI de nuit ; un survivant du rejeu est un survivant, un dépassement persistant est un avertissement chiffré ; le crochet post-commit ne rejoue rien.
- **Essai de l'application réelle** (à la demande, avant une livraison ; ni dans la barrière ni dans `--fonction`) : `scripts/essai-application.sh` construit le vrai `.app` d'essai, le lance sur un espace de travail temporaire et lit le rapport que l'application écrit après avoir joué ses scénarios dans sa vraie fenêtre (fiche 0054).
- **Écrire les tests qui tuent les erreurs introduites en même temps que le code** : chaque valeur littérale, borne et cas limite a un test qui l'affirme. Constats, durées et pièges : `doc/developpement/code.md`, section « Temps de la CI ».
- L'envoi (push) ne relance pas la CI.

## Secrets

- Aucun secret dans le code ni dans l'historique. `_SECRET/` reste toujours dans `.gitignore`.
