# 0001 — Interface Tauri 2 + CodeMirror 6

- **Date** : 2026-11-16
- **Statut** : acceptée

## Contexte

L'éditeur Markdown est le cœur du produit : mise en forme en direct, mode focus, collage d'images. Il faut un éditeur riche et extensible. Le reste de l'application (règles, stockage) est écrit en Rust.

## Décision

Application **Tauri 2**, interface en TypeScript (Vite), éditeur **CodeMirror 6**. Tout le travail (règles, disque, recherche) reste côté Rust ; la page ne fait qu'afficher et saisir.

## Conséquences

- On gagne un éditeur Markdown mûr, extensible fonctionnalité par fonctionnalité, et une application légère.
- On perd l'apparence « native Mac », qui n'est pas un objectif.
- Deux langages à tenir (Rust et TypeScript), d'où un seul point de passage entre eux et des types échangés générés depuis Rust.
