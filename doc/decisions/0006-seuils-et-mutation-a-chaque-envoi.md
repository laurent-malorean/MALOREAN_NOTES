# 0006 — Seuils qui ne baissent jamais, test de mutation à chaque envoi

- **Date** : 2026-11-16
- **Statut** : acceptée ; remplace la partie « Mesures » de `0004-strategie-de-tests.md` ; le moment du test de mutation est remplacé par la fiche 0015

## Contexte

Après les rangements imposés par le guide de code, la couverture a légèrement baissé et le test de mutation, lancé seulement avant de livrer, a trouvé tard un type sans tests dans sa couche : un écart à la méthode TDD que rien n'a bloqué sur le moment.

## Décision

- **Seuils au niveau atteint, et qui ne baissent jamais** : Rust ≥ 95 % des lignes ; interface ≥ 98 % des lignes, instructions et fonctions, ≥ 94 % des branches. Quand la couverture monte, on relève le seuil.
- **Test de mutation à chaque push**, limité au code Rust qui part (`cargo mutants --in-diff`) ; sur tout le code au premier envoi et avant de livrer. Une erreur introduite qui passe inaperçue bloque le push.
- Une branche impossible (cas « jamais » d'un `switch` exhaustif) est exclue de la couverture avec sa raison écrite.

## Conséquences

- Un code ajouté sans vrai test est refusé au moment du push, pas des semaines plus tard.
- Le push prend quelques minutes de plus quand du code Rust change (environ 4 minutes pour une quarantaine d'erreurs introduites).
- Des seuils élevés obligent à tester aussi les cas d'erreur et les parties défensives, ou à les simplifier.
- L'interface a son test de mutation (Stryker), lancé à chaque push avec un seuil de 100 %. Stryker ne voit qu'un groupe de tests : pour lui, tous les tests de l'interface sont joués ensemble dans WebKit.
