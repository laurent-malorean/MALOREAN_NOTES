# 0088 — Modèle de sens gardé en mémoire 5 minutes après son dernier usage

- **Date** : 2026-11-26
- **Statut** : acceptée, demande de l'utilisateur
- **Complète** les fiches 0042 et 0043 (moteur de sens et modèles de sens du disque).

## Contexte

Chaque recherche par le sens et chaque lot de calcul du sens rechargeaient le modèle depuis le disque (`MeaningModels::open`). Mesuré sur l'application qui tourne : de 15 à 49 secondes par recherche (Mac surchargé), et une empreinte mémoire passée de 105 Mo à 955–1 260 Mo après les recherches, sans jamais redescendre tant que l'application vit.

## Décision

1. **Un décorateur du port existant** : `KeptModels` (infrastructure) enveloppe `ModelFolder` derrière `MeaningModels`. Les cas d'usage ne changent pas. La règle de durée de vie est une règle d'adaptateur, pas du domaine.
2. **Délai fixe de 5 minutes** (`KEEP_DURATION`), après le dernier usage ; aucun réglage dans l'écran des réglages.
3. **Libération réelle, sans nouvelle recherche** : un fil (`modele-de-sens-garde`) dort jusqu'à l'échéance, puis lâche la seule référence gardée ; plus aucune référence `Arc` ne reste. Il s'arrête à la fermeture (`Drop` : le modèle est libéré et le fil rejoint).
4. **Un modèle en main n'est jamais libéré** : si une référence existe encore à l'échéance (un calcul long), le temps repart de ce moment.
5. **Un seul modèle gardé** : ouvrir un autre modèle libère l'ancien avant de charger le nouveau ; supprimer le modèle gardé le libère. Choisir un autre modèle déjà téléchargé suffit donc : le calcul du sens qui suit l'ouvre et remplace l'ancien.
6. **Concurrence** : le verrou est tenu pendant le chargement ; deux recherches simultanées ne chargent qu'une fois et reçoivent le même modèle. Un chargement raté n'est pas gardé (la suivante réessaie) ; un modèle non téléchargé donne la même erreur qu'avant (`ModelMissing`).
7. **Un port de temps à la milliseconde, `Uptime`** (`SystemUptime` en vrai, `FakeUptime` dans les tests) : `Clock` n'a que la minute et suit l'heure locale (qui peut être remise à l'heure) ; un minuteur de 5 minutes veut un temps qui ne recule jamais. Les tests font passer le temps sans attendre.

## Conséquences

- La première recherche après une pause paie le chargement ; les suivantes, et le calcul du sens pendant l'indexation, réutilisent le modèle chargé.
- Après 5 minutes sans usage, la mémoire revient à son niveau de repos.
- Mesures : voir la section suivante.
- Choisir un autre modèle ne libère l'ancien qu'à l'ouverture du nouveau (le calcul du sens qui suit) : si le nouveau n'est pas téléchargé, l'ancien reste chargé au plus 5 minutes.

## Mesures

Avant (application qui tourne, mesuré par l'utilisateur, Mac surchargé) : de 15 à 49 s par recherche par le sens, empreinte de 105 Mo à 955–1 260 Mo sans jamais redescendre.

Après (test `real_kept`, vrai modèle E5 petit, binaire de test optimisé, Mac très chargé : charge moyenne d'environ 50 sur 1 minute, d'autres agents compilaient en même temps, délai réduit à 3 s) :

- chargement à froid et première question : 702 ms ;
- deuxième question, modèle déjà chargé : 7,9 ms, avec le même objet (aucun rechargement) ;
- empreinte du processus (`footprint`) : 2,2 Mo avant, 1 241 Mo modèle chargé, 87 Mo après libération (3 s sans usage, plus 2 s), soit le niveau de repos ; plus aucune référence au modèle ne subsiste (vérifié par une référence faible).

Rejouer : `cargo test --release -p infrastructure --test meaning real_kept -- --nocapture` (ignoré, avec un message, si le modèle n'est pas sur le Mac).
