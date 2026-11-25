# 0059 — Toute la mutation sur GitHub, en groupes de mutation parallèles ; sur le Mac, pas de mutation en fin de tâche

- **Date** : 2026-11-25
- **Statut** : acceptée, décision de l'utilisateur
- **Remplace** la fiche 0050 (un seul travail de nuit, domaine seul) et la consigne « `--branche` en fin de tâche » de la fiche 0049 / `doc/travail-en-branches.md`. Complète la fiche 0053 (rejeu des dépassements, inchangé).

## Contexte (mesures)

- Le travail de nuit « mutation-domaine » du 25/11/2026 a échoué sur la limite de 75 minutes : 1 413 erreurs à tester, environ 19 à 22 erreurs par minute mesurées. Le 24/11 : 1 120 erreurs en 60 minutes (997 attrapées, 117 non compilables, 6 dépassements).
- Le domaine a ensuite gagné le module CRM : `cargo mutants --list` donne maintenant **2 039 erreurs pour le seul domaine** (dont 606 pour le CRM), 583 pour `application`, 552 pour `infrastructure`, 578 pour `api` : **3 752** au total. Un travail unique de nuit n'a donc aucune chance de finir.
- La consigne imposait `./scripts/ci.sh --branche` en fin de tâche d'un agent : la mutation du diff de la branche sur le Mac, des heures sur une machine saturée.
- Le dépôt est public : les minutes GitHub ne sont pas comptées.

## Décision

1. **Toute la mutation du Rust passe sur GitHub**, en **groupes de mutation** parallèles (mot de l'ontologie) : une grande partie fonctionnelle, mutée seule sur sa machine, **25 minutes au plus** (visé : 10 à 20), jamais 2 heures. Quatre crates couvertes : `domain`, `application`, `infrastructure`, `api` (la crate `app`, l'assemblage de Tauri, n'est pas mutée : son `main.rs` est déjà exclu de la couverture et n'a pas de test automatique).
2. **Une seule source de vérité** : `scripts/mutation-groupes.json` (nom, crate, fichiers par motifs de cargo-mutants `--file`). Le groupe « autres » de chaque crate n'a pas de fichiers : il mute tout fichier qu'aucun autre groupe de la crate ne nomme (`--exclude` de leurs motifs). Un fichier neuf entre donc dans un groupe, sans qu'on y pense, et n'échappe jamais. `scripts/test-ci-mutation-groupes.sh` vérifie que chaque fichier de production des quatre crates tombe dans exactement un groupe (par le calcul des motifs, puis contre la liste de fichiers de cargo-mutants lui-même) ; il est joué par la barrière quand les scripts ou le travail GitHub changent, et par `--fonction`.
3. **Le travail** `.github/workflows/mutation.yml` (remplace `mutation-domaine.yml`) : planning 02:17 UTC et `workflow_dispatch` (entrée facultative « groupe » pour n'en lancer qu'un). Trois tâches : `matrice` (lit le fichier de groupes, produit la matrice JSON lue par `fromJSON`), `mutation` (un groupe par machine, `fail-fast: false`, `timeout-minutes: 25`, étape de mutation coupée à 22 minutes pour que le bilan soit toujours joint), `resume` (`if: always()`, étape « Summary » : erreurs, attrapées, survivantes, dépassements, durée de chaque groupe, groupe sans bilan signalé). Même réglage qu'avant : `--all-features --jobs 4 --test-workspace=false`, coupure 30 s (domaine) ou 90 s (ailleurs, comme `SAMPLE_TIMEOUT`), rejeu des dépassements (`scripts/mutation-rejeu.sh`), un survivant fait échouer son groupe, un dépassement persistant avertit. Chaque groupe joint son bilan en artefact `mutation-<groupe>` (avec `bilan.json`). La logique d'un groupe est dans `scripts/mutation-groupe.sh` (testable avec un faux cargo-mutants), le résumé dans `scripts/mutation-resume.sh`.
4. **Machines** : `domain` et `application` sur `ubuntu-latest` (aucune dépendance au Mac) ; `infrastructure` et `api` sur `macos-latest` (le moteur de calcul du sens utilise Accelerate, Tauri et les menus demandent macOS). Gratuit aussi pour un dépôt public.
5. **Sur le Mac, par tâche, 10 minutes au plus** : la fin d'une tâche d'un agent est `./scripts/ci.sh` (barrière à chaque commit) puis `./scripts/ci.sh --fonction`, **sans mutation**. `./scripts/ci.sh --branche` reste, à la demande, jamais imposé. Un survivant que GitHub trouve se corrige à la tâche suivante (règle du 23/11 : la mutation n'est jamais une barrière).

## Les groupes et leurs nombres d'erreurs (mesurés par `scripts/mutation-groupes.sh compter`, 25/11/2026)

Nombres d'erreurs listées par `cargo mutants --list` : ils surestiment ce qui est réellement testé (les erreurs non compilables en moins : par exemple 534 listées pour 356 testées sur `api`).

- Domaine, 2 039 erreurs en 12 groupes :
  - `domaine-notes-texte` 226 (note, titre, en-tête, étiquettes, liens, recherche) ;
  - `domaine-notes-fichiers` 196 (dossiers, noms de fichier, enregistrement, conflits, historique, export, journal, type de contenu, modèles, classement) ;
  - `domaine-sens` 228 (sens, vecteurs, segments, différences) ;
  - `domaine-pieces-jointes` 174 (pièces jointes, pages web) ;
  - `domaine-canvas` 146 ;
  - `domaine-carte-cahier` 201 (carte mentale, cahier de recherche) ;
  - `domaine-claude` 32 (Claude, outils de l'application, clé de branchement) ;
  - `domaine-ecriture-json` 230 ;
  - `domaine-crm-journee` 218 (journée, semaine, Kanban, compteurs, filtres) ;
  - `domaine-crm-actions` 177 (actions, étapes) ;
  - `domaine-crm-fiches` 211 (en-tête, personnes, sociétés, projets, références, noms, palette) ;
  - `domaine-autres` 0 aujourd'hui.
- Application, 583 erreurs en 4 groupes : `application-magasins` 218, `application-cas-d-usage` 183, `application-faux` 182 (faux en mémoire des tests), `application-autres` 0.
- Infrastructure, 552 erreurs en 6 groupes : `infrastructure-notes` 113, `infrastructure-index` 118, `infrastructure-divers` 131 (modèles de sens, historique, surveillance, préférences), `infrastructure-claude` 130, `infrastructure-sockets-systeme` 60, `infrastructure-autres` 0. Plus petits que le domaine : leurs tests sont plus lents (environ 43 s par erreur mesurés pour `infrastructure`).
- API, 578 erreurs en 6 groupes : `api-outils-lecture` 100, `api-outils-ecran` 81, `api-claude-reglages` 122, `api-commandes` 148, `api-session` 127, `api-autres` 0.

Soit 28 groupes, de 32 à 230 erreurs listées (au plus 230, la cible étant 250). Le domaine, qui compile vite, est groupé à 175 à 230 erreurs (environ 10 à 12 minutes au débit mesuré de 19 à 22 erreurs par minute, plus l'installation) ; `infrastructure` et `api`, plus lents, à 60 à 150.

## Limites

- **Les durées sur GitHub ne sont pas encore mesurées** pour `application`, `infrastructure` et `api` : le premier passage (à lancer à la main, onglet Actions) dit quels groupes dépassent 25 minutes ; on les coupe alors en deux dans le fichier de groupes (une ligne à changer, la matrice suit).
- Un groupe dont les tests sont lents peut dépasser ses 25 minutes : il est alors rouge sans verdict de mutation (le résumé le dit : « sans bilan »). Le temps d'installation de cargo-mutants (quelques minutes à froid, gardé en cache ensuite) compte dans les 25 minutes.
- **`infrastructure` et `api` sur macOS n'ont pas été essayés sur GitHub** : si leurs tests de base échouent sur la machine de GitHub (fenêtre, menus, `ipc_menu`), le groupe sort en erreur de l'outil (code 4) ; à traiter alors groupe par groupe.
- GitHub limite les machines simultanées d'un dépôt public (environ 20 au total, 5 pour macOS) : les groupes en trop attendent leur tour, la durée totale de la nuit est celle des plus longues files, pas celle d'un groupe.
- **Le verdict arrive après coup** : un survivant est connu le lendemain matin (e-mail), pas à la fin de la tâche. C'est le prix d'une fin de tâche en moins de 10 minutes.
- Le planning n'est actif que depuis la branche `main`. Le cache de cargo-mutants est par système et architecture. Le YAML a été validé par Ruby (YAML puis jq), pas par `actionlint` (non installé sur le Mac).
