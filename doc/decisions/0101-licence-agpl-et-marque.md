# 0101 — Licence AGPL-3.0 pour le code, marque gardée par l'auteur

- **Date** : 2026-11-26
- **Statut** : acceptée
- **Remplace** la licence MIT choisie au départ.

## Contexte

L'utilisateur veut trois choses : rester maître de son produit et de son nom ; que n'importe qui puisse reprendre le code ; que toute version reprise reste open source.

La licence MIT ne garantit pas la troisième : un tiers peut reprendre le code dans un produit fermé.

## Décision

- **Code sous AGPL-3.0 ou version ultérieure** (`AGPL-3.0-or-later`) : texte officiel de la FSF dans `LICENSE`, champ `license` de `Cargo.toml` (hérité par toutes les crates) et de `ui/package.json`.
  - Chacun peut utiliser, étudier, modifier et redistribuer le code.
  - Une version modifiée et distribuée doit rester sous la même licence, avec son code source.
  - L'AGPL, plutôt que la GPL, couvre aussi une version offerte comme service en ligne : son code doit être donné à ses utilisateurs.
- **L'auteur garde ses droits** : la licence donne des droits aux autres sans rien céder ; l'auteur peut, en plus, accorder une autre licence (par exemple commerciale) à qui il veut.
- **Le nom et l'icône ne sont pas sous licence** : « MALOREAN Notes », son logo et son icône restent à l'auteur. Une version dérivée distribuée doit porter un autre nom et une autre icône. Le README le dit.
- **Dépendances** : la liste des licences acceptées des dépendances (`deny.toml`) ne change pas ; MIT, Apache-2.0, BSD, MPL-2.0 et les autres licences permissives qu'elle autorise sont compatibles avec l'AGPL-3.0.

## Conséquences

- Les copies du code déjà diffusées sous MIT restent sous MIT pour qui les a prises ; l'AGPL vaut à partir de ce commit.
- Une contribution extérieure est reçue sous AGPL ; pour garder la possibilité d'une licence commerciale, il faudra demander aux contributeurs un accord de cession ou de licence (CLA) avant d'accepter leur code.
- La protection juridique du nom passe par un dépôt de marque (INPI), hors du dépôt de code.
