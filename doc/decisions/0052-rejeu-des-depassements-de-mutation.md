# 0052 — Rejeu des dépassements de délai de la mutation

- **Date** : 2026-11-24
- **Statut** : acceptée, demande de l'utilisateur
- **Complète** les fiches 0049 (mutation ciblée non bloquante) et 0050 (mutation de nuit sur GitHub).

## Contexte

Constat mesuré le 24/11/2026 : sur la crate `infrastructure`, 89 contrôles sur 513 ont dépassé le délai de 60 s (machine chargée, tests lents). cargo-mutants compte un dépassement comme détecté, mais ce n'est pas une preuve : un test normal qui dure trop long ne dit rien de la qualité des tests. On les a rejoués à la main avec `cargo mutants --iterate -o <même dossier de sortie> --timeout 240` (`--iterate` rejoue seulement les contrôles « missed » et « timeout » d'une passe précédente).

## Décision

- **Rejeu automatique, une seule fois** : `scripts/mutation-rejeu.sh` rejoue les dépassements d'une passe avec un délai quadruplé (borné à 600 s), puis fusionne le bilan. Appelé par `scripts/ci.sh` (mutation du domaine de la livraison, échantillon, tout-le-code : toute mutation lancée par le script) et par le travail de nuit GitHub.
- **Verdict non faussé** : un survivant après rejeu est un survivant (liste de suivi `.git/ci-mutation/suivi.txt`, refus de la livraison, échec du travail de nuit). Un dépassement qui persiste après rejeu est un avertissement chiffré, jamais un succès silencieux ; il ne refuse rien (comme avant). Une erreur de l'outil au rejeu fait échouer.
- **Rapport** : « N dépassements avant, M après » dans la sortie de la CI et dans `mutants.out/rejeu.txt` (artefact `mutants-out` de la nuit).
- **Le crochet après commit ne rejoue rien** : il tourne en arrière-plan avec une coupure de 30 s et doit rester court et non bloquant ; un rejeu quadruplé rallongerait un travail qu'on ne surveille pas. Ses dépassements restent comptés dans son bilan.
- **Nuit** : le rejeu ne porte que sur les dépassements (6 sur 992 à la première exécution), dans la limite des 90 minutes du travail (étape limitée à 75 minutes pour que le bilan soit toujours joint). Durée ajoutée : au plus (nombre de dépassements x 120 s) / 4 tâches en parallèle, soit environ 3 minutes pour 6 dépassements (calcul, pas encore mesuré sur GitHub) ; si le rejeu seul dépasse ce qui reste, l'étape est coupée et le travail échoue.

## Conséquences

- Les survivants cachés derrière un délai trop serré apparaissent à la livraison, sans rejeu à la main.
- Une passe avec beaucoup de dépassements (89 sur 513) coûte un rejeu de la même taille : environ 89 x 240 s / 4 au pire. Mieux vaut régler la charge de la machine que s'en remettre au rejeu.
- Scénarios : `scripts/test-ci-rejeu.sh` (faux cargo-mutants).
