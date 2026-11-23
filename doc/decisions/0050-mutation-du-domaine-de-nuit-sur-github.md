# 0050 — Mutation du domaine chaque nuit sur GitHub Actions (Linux, domaine seul, gratuit)

- **Date** : 2026-11-23
- **Statut** : acceptée, décision de l'utilisateur
- **Complète** la fiche 0049 (mutation du domaine locale, non bloquante) ; ne la remplace pas.

## Contexte

La mutation du domaine tout entier (992 erreurs à tester, environ 1,6 s chacune) prend environ 27 minutes sur le Mac. Le crochet local ne mute que le diff, et le tout-domaine n'avait aucun moment pour tourner sans occuper la machine de travail. Le dépôt GitHub est public : GitHub Actions y est gratuit et sans limite de minutes.

## Décision

Un travail GitHub Actions, `.github/workflows/mutation-domaine.yml`, joue chaque nuit (02:17 UTC) et à la demande (`workflow_dispatch`) la mutation de la seule crate `domain` : `cargo mutants --package domain --all-features --jobs 4 --timeout 30 --test-workspace=false`, les mêmes réglages que `scripts/mutation-diff.sh`. Pas à chaque push, pas à chaque pull request. Le travail échoue s'il reste un survivant (GitHub envoie un e-mail) ; le dossier `mutants.out` est joint en artefact. Droits : `contents: read` seulement. Durée maximale : 90 minutes. Seules actions tierces : `actions/checkout`, `actions/cache`, `actions/upload-artifact`, épinglées par version.

## Pourquoi

- **Sur GitHub** : la machine de travail reste libre, la nuit, et un échec arrive par e-mail sans y penser. Gratuit, car le dépôt est public (si le dépôt devenait privé, les minutes seraient comptées : à revoir).
- **Domaine seul** : Rust pur, rapide à muter, là où les règles métier se cassent en silence. Le reste (application, api, infrastructure, interface) demande macOS, WebKit ou des tests longs ; il reste à la demande en local.
- **Linux** : la crate `domain` n'a aucune dépendance macOS ; `ubuntu-latest` est la machine la plus courante et la plus rapide à obtenir.

## Mesure (23/11/2026, première exécution)

992 erreurs introduites en 47 minutes (48 min 31 s au total, installation comprise), contre environ 27 minutes estimées sur le Mac : 880 attrapées, 106 non compilables, 6 délais, 0 survivant. Les 6 délais sont des boucles infinies provoquées par l'erreur (`deduplicated`, `linked_titles`, `plan_save`, `cut`) : l'erreur est détectée, elle ne fait donc pas échouer le travail (cargo-mutants rend alors le code 3, lu dans le bilan comme en local).

## Conséquences

- On gagne le tout-domaine vérifié chaque nuit, sans coût ni occupation du Mac.
- Le planning de nuit ne devient actif qu'une fois le fichier sur la branche par défaut (`main`). GitHub peut retarder ou sauter un déclenchement planifié ; le lancement manuel reste possible.
- Un survivant se lit dans le journal du travail et dans l'artefact `mutants-out` (`missed.txt`) ; il se traite comme ceux de la liste de suivi locale.
