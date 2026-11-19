# 0005 — Aide à l'écriture par le modèle d'IA intégré au Mac

- **Date** : 2026-11-16
- **Statut** : acceptée ; le moteur 1 est précisé par la fiche 0031 (le moteur de repli reste à faire)

## Contexte

On veut corriger, reformuler et résumer un passage sans compte payant ni clé d'accès chez un fournisseur d'IA. Le modèle d'Apple (Apple Intelligence) est accessible aux applications depuis macOS 26 ; vérifié le 16/11/2026 sur Mac M4, macOS 26.6.1 : disponible, essai de correction réussi.

## Décision

Moteur principal : **le modèle d'IA intégré au Mac**, appelé par un petit module Swift rangé dans l'infrastructure, derrière un port « assistant d'écriture » dans les mots de l'application. Moteur de repli au choix de l'utilisateur : un modèle local (Ollama, LM Studio), derrière le même port. L'IA ne modifie jamais une note sans accord explicite.

## Conséquences

- Gratuit, privé, hors connexion ; aucune clé à gérer.
- Mac compatible requis (puce Apple, Apple Intelligence activé) ; sinon la fonction se masque ou passe au repli.
- Petit modèle : bon pour corriger et reformuler, à découper pour les longues notes.
- Un pont Rust ↔ Swift à écrire et à tester.
