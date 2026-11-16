# 0015 — La mini CI avant chaque commit, plus rien à l'envoi

- **Date** : 2026-11-16
- **Statut** : acceptée ; remplace la partie « à chaque envoi » de la fiche 0006

## Contexte

La mini CI tournait deux fois : avant chaque commit (règle de travail), puis de nouveau à l'envoi, par un crochet `pre-push`, avec le test de mutation du code Rust envoyé. Le contenu envoyé est exactement celui qui a passé la CI au commit ; seules les dates des commits peuvent changer avant l'envoi. La seconde passe ne vérifiait donc rien de nouveau et faisait attendre plusieurs minutes à chaque envoi.

## Décision

- La mini CI complète tourne **avant chaque commit**, et comprend désormais le test de mutation du code Rust pas encore commité (l'interface était déjà testée en entier par Stryker).
- L'envoi ne relance aucun contrôle : le crochet `pre-push` est supprimé.
- Avant de livrer, `scripts/ci.sh --complet` teste toujours la mutation de tout le code Rust.

## Conséquences

- Chaque commit est vérifié au même niveau qu'avant l'envoi ; un envoi est immédiat.
- Un commit qui touche du code Rust prend quelques minutes de plus.
- Ce qui n'est pas passé par la mini CI ne doit pas être commité : c'est une règle de travail, plus un garde-fou automatique.
