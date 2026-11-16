# 0004 — Stratégie de tests et garde-fou avant envoi

- **Date** : 2026-11-16
- **Statut** : remplacée en partie par `0006-seuils-et-mutation-a-chaque-envoi.md` (seuils et moment du test de mutation)

## Contexte

Les tests doivent être solides à tous les niveaux, du domaine à l'écran. Sur Mac, Tauri ne permet pas de piloter sa fenêtre par un robot de test ; la page tourne dans WebKit. Une règle sans vérification est un vœu : il faut un contrôle qui bloque.

## Décision

- **Niveaux** : règles du domaine (unitaires et propriétés sur données générées), cas d'usage sur faux en mémoire, contrat commun au faux et au vrai stockage, disque réel en dossier temporaire, commandes appelées par le simulateur de Tauri (noms, arguments JSON, origine), logique d'interface sans écran, écran et éditeur dans **WebKit** (Vitest navigateur), parcours complets dans WebKit avec la partie Rust remplacée par un faux (Playwright).
- **Mesures** : seuils de couverture (Rust ≥ 93 % des lignes, interface ≥ 90 %) ; test de mutation (`cargo mutants`) avant de livrer, aucune erreur introduite ne doit passer.
- **Garde-fou** : `scripts/ci.sh` est lancé automatiquement avant chaque push et le bloque en cas d'échec.

## Conséquences

- Chaque couche se teste au plus près, et la cohérence entre couches (noms de commandes, types échangés) est vérifiée automatiquement.
- La mini CI prend quelques minutes ; le test de mutation, plus long, est réservé à la livraison.
- Le vrai binaire Tauri n'est pas piloté de bout en bout : la page et les commandes sont testées séparément, l'assemblage est vérifié à la main.
- Plusieurs outils à installer une fois (voir `doc/code.md`).
