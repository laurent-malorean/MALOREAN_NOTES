# Écrire une entrée de cahier de recherche

Spécification fonctionnelle, refaite le 23/11 (version simple, remplace la précédente). Elle complète la fonction « Cahier de recherche » (entrées ajoutées, jamais modifiées). Ce document se lit seul.

![Maquette dans l'écran de l'application](entree-de-cahier.png)

## 1. Besoin

Ajouter une observation à un cahier de recherche simplement, sans fenêtre ni colonne en plus, en voyant le cahier au-dessus.

## 2. Comportement

- Le cahier est une note comme les autres, ouverte dans sa colonne. **Son texte n'est pas modifiable** : on ne peut rien y changer, ni dans les entrées ni dans les titres.
- **On ne saisit qu'en bas de la page** : une zone de saisie fait partie de la page du cahier, sous son texte. Elle montre **8 lignes** à la fois (au-delà, elle défile) et accepte un texte libre sur plusieurs lignes.
- Un seul bouton, **« Ajouter l'entrée »**, sous la zone de saisie. Un message au-dessus dit où l'entrée sera rangée (« elle sera datée au moment de l'ajout et rangée sous « Lundi 23 novembre » »).
- À l'ajout, l'entrée est **datée du moment de l'ajout** et rangée au bon niveau de titre du cahier : `## année`, `### mois`, `#### jour`, puis `- 09:42 - texte`. Un titre d'année, de mois ou de jour qui n'existe pas encore est créé. Les entrées restent classées de la plus ancienne (en haut) à la plus récente (en bas), comme un cahier papier. La zone de saisie se vide ensuite.
- **Étiquettes** : comme pour tout contenu, le champ d'étiquettes est sous les onglets de la colonne (étiquettes en pastilles avec « × », champ « Ajouter une étiquette » et « + »). C'est la seule chose modifiable en dehors de la zone de saisie : un geste réécrit seulement `tags` dans l'en-tête, le texte du cahier reste tel quel.
- **Pas de correction** : aucune entrée ne se modifie, et il n'y a aucun bouton « Corriger ». Une erreur se rectifie par une nouvelle entrée.

## 2 bis. Repérer les entrées

- Chaque entrée du cahier porte, **sur son côté gauche, une barre verticale** : elle couvre toute la hauteur de l'entrée (sa première ligne, ses lignes suivantes, ses paragraphes en retrait et ses sous-puces), pour distinguer d'un coup d'œil une entrée de la suivante.
- Deux entrées successives sont **séparées par un espace net** : leurs deux barres ne se touchent pas.
- La barre est d'une teinte discrète du thème, lisible en clair comme en sombre.
- Cela ne concerne que les cahiers de recherche : les listes des autres notes ne changent pas. La barre est un simple affichage, le texte du cahier n'en est pas changé.

## 3. Ce qui disparaît

- La fenêtre de saisie « Ajouter au cahier », sa liste déroulante de choix du cahier et son bouton « Ajouter ».
- Le « + » en haut du cahier.
- La commande « Ajouter au cahier » (palette et barre des menus) : elle n'existe plus.
- Les brouillons, les colonnes de brouillon et les boutons « Corriger » (pensés dans la version précédente de cette spécification).

## 4. Décidé par l'utilisateur (23/11)

- **Il n'y a pas de commande « Ajouter au cahier »** (ni dans la palette ni dans la barre des menus) : on ajoute une entrée seulement depuis la page du cahier de recherche, par la zone de saisie en bas. Hors d'un cahier, rien n'apparaît.
- L'outil de l'application pour Claude (« ajouter une entrée au cahier ») ne change pas ; seule sa partie « correction » disparaît avec la correction de l'interface.
