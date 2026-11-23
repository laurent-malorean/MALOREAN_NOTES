# 0043 — Moteur de sens et téléchargement des modèles : `candle` sur le processeur, `reqwest` déjà tiré par Tauri avec le TLS du système

- **Date** : 2026-11-23
- **Statut** : acceptée
- **Complète** la fiche 0042 (même décision, détails de mise en œuvre et mesures).

## Contexte

La fiche 0042 fixe le modèle (E5), le moteur (`candle`) et le téléchargement vérifié. Restait à choisir comment télécharger en HTTPS sans alourdir l'application, et à mesurer le moteur écrit pour de bon.

## Décision

- **Deux ports dans `application`** (`meaning_ports.rs`) : `Embedder` et `MeaningModels`, avec `MeaningError` (modèle absent, téléchargement échoué ou interrompu, fichier refusé, suppression refusée, calcul échoué ; chaque message dit quoi faire). Aucun chemin ni octet dans leurs signatures. Un faux en mémoire et trois contrats (forme, sens, modèles) sont joués sur le faux et sur les adaptateurs réels.
- **Téléchargement : `reqwest` en mode bloquant**, celui que Tauri tire déjà. Dans l'arbre de Tauri il n'a aucun TLS ; on lui ajoute `native-tls`, qui s'appuie sur Security.framework de macOS (crate `security-framework`, MIT ou Apache-2.0). Ni `rustls`, ni `ring`, ni OpenSSL : aucune licence ajoutée à `deny.toml`. Lecture en flux par morceaux de 256 Ko : une annonce d'avancement par morceau, l'appelant peut interrompre. Le client bloquant ne mesure pas le silence entre deux octets : une durée maximale de 6 heures borne un téléchargement figé.
- **Somme SHA-256 : `sha2`**, déjà dans l'arbre de Tauri.
- **Écriture** : `<fichier>.part`, vérifié (taille puis somme), synchronisé, renommé ; en cas d'échec il est effacé. Un fichier qui porte son vrai nom est entier et vérifié : une nouvelle tentative ne retélécharge que ce qui manque, et l'avancement compte les fichiers déjà là.
- **Calcul : sur le processeur, pour les deux modèles** (décision de l'utilisateur, qui change la fiche 0042 sur ce point : plus de repli Metal). Mesure du 23/11/2026 (M4, build `release`, 411 segments de notes réelles de l'utilisateur, petit modèle, triés, lots de 16) : processeur avec `accelerate` 5,3 s, Metal 7,0 s ; une question 5 ms au processeur, 9 à 13 ms sur Metal ; chargement 0,3 s. Le grand modèle n'a pas été mesuré sur Metal, par décision de l'utilisateur. Les vecteurs des 6 premiers segments de référence sont identiques à ceux de Python (cosinus 1,00000).
- **Dépendances** : `candle-core`, `candle-nn`, `candle-transformers` 0.11 (`accelerate` seule), `tokenizers` 0.22 (sans fonction par défaut, `fancy-regex`), déclarées une fois dans `[workspace.dependencies]`.
- **Tests sans réseau ni modèle réel** : de tout petits modèles fabriqués par le test (réglages minuscules aux dimensions des vrais, découpeur par caractère construit par code, poids tirés d'une graine) pour les deux familles ; un serveur HTTP local écrit avec `std::net::TcpListener` pour le téléchargement ; le contrat sur le vrai petit modèle seulement s'il est sur ce Mac (dossier des modèles, sinon cache de Hugging Face), avec des vecteurs de référence de Python sur des textes neutres (cosinus au moins 0,999).

## Conséquences

- `cargo deny` signale `paste` (RUSTSEC-2024-0436, crate de macros « non entretenue », sans faille connue), tirée par `gemm`, lui-même tiré par `candle-core` : exception explicite décidée par l'utilisateur le 23/11/2026, écrite dans `deny.toml` avec son motif (macro de compilation seule, rien ne s'exécute dans l'application, aucune faille connue) et sa condition de retrait (dès que `candle` ou `gemm` s'en passe).
- La compilation s'allonge (candle, gemm).
- Le TLS du système n'a pas été joué sur le vrai réseau (aucun test n'y va) : le premier téléchargement réel le vérifiera.
