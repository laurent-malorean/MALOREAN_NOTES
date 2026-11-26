---
type: cahier-de-recherche
tags: [exemple, veille]
---
# Veille maintenance prédictive

## 2026

### Octobre

#### Mardi 6

- 09:15 - Début de la veille sur la maintenance prédictive : on cherche ce qui est réellement mesurable sur nos sites clients avant de parler d'intelligence artificielle.
- 16:40 - Trois familles de signaux à comparer :
  - vibrations (roulements, moteurs)
  - température (chambres froides, armoires électriques)
  - courant absorbé (pompes, compresseurs)

#### Mardi 13

- 10:05 - Appel avec Acme Industries : leurs 3 sites de production relèvent déjà les vibrations à la main, une fois par semaine. Premier terrain d'essai envisagé.
- 11:30 - Question ouverte : à partir de combien de mois d'historique un seuil d'alerte devient-il fiable ?

#### Mardi 20

- 09:42 - Lecture d'un article de synthèse : les alertes par simple dépassement de seuil produisent beaucoup de fausses alertes ; la tendance sur plusieurs jours est plus sûre.

  À retenir pour la suite :
  - comparer chaque équipement à lui-même, pas à une valeur du constructeur
  - garder la trace de chaque alerte et de sa suite (panne réelle ou non)

#### Mardi 27

- 14:20 - Pharmalab France demande une traçabilité complète des relevés de température : chaque mesure doit rester consultable pendant 5 ans.

### Novembre

#### Mardi 3

- 08:55 - Test des capteurs de froid chez Gourmet Bistro Group : 12 capteurs posés, relevé toutes les 5 minutes.
- 17:10 - Premier constat : deux capteurs perdent leur liaison quand la porte de la chambre froide reste fermée longtemps. À reposer plus près de la porte.

#### Mardi 10

- 10:30 - Correction de [l'entrée du 20 octobre 2026 à 09:42](#2026-10-20-09h42) : la tendance sur plusieurs jours demande au moins 30 jours d'historique, pas 15 comme je l'avais cru.
- 15:00 - Voir la note de mise en forme [[NOTE_FAKE]] pour l'exemple de présentation du compte rendu à envoyer à Nordik Logistique.

#### Mardi 17

- 09:10 - Nordik Logistique : flotte de 120 véhicules, donc un coût par capteur qui compte.

  Options étudiées :
  1. capteurs sur les seuls véhicules frigorifiques
  2. capteurs sur toute la flotte
  3. relevé à bord une fois par jour, sans capteur permanent

  L'option 1 est la plus raisonnable pour un pilote.
- 11:45 - Idée : proposer à chaque client un tableau de bord avec trois voyants (vert, orange, rouge) par équipement.

#### Mardi 24

- 09:30 - Bilan à 7 semaines : 4 alertes émises, 3 vraies pannes évitées, 1 fausse alerte. Le pilote chez Gourmet Bistro Group est jugé concluant.
- 16:15 - Prochaine étape : étendre à Acme Industries au premier trimestre 2027 et chiffrer le coût par site.
