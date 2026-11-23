# Écrire une entrée de cahier de recherche

Spécification fonctionnelle, issue de la discussion de conception du 23/11. Elle complète la fonction « Cahier de recherche » (entrées ajoutées, jamais modifiées).

## 1. Besoin

Rédiger une observation de plusieurs paragraphes, avec des listes, des images et des liens, en relisant les entrées précédentes à côté. La fenêtre de saisie actuelle (petite, bloquante) ne le permet pas.

## 2. Comportement

- Le « + » du cahier et la commande « Ajouter au cahier » ouvrent un **brouillon d'entrée** dans une colonne voisine du cahier.
- Le brouillon s'écrit dans l'éditeur habituel : mise en forme, collage d'images, liens, aide à l'écriture.
- Le cahier reste en lecture seule, visible à côté.
- On peut avoir plusieurs brouillons.
- Un brouillon est un fichier temporaire à nom unique, hors de la liste des notes et de la recherche. Il est supprimé quand on le valide ou qu'on l'abandonne. Raison : l'éditeur travaille sur des fichiers, une image collée s'écrit sur le disque, et fermer une colonne par erreur ne doit pas faire perdre une observation.
- **Valider** le brouillon ajoute l'entrée au cahier, datée du moment de la validation.
- Corriger une entrée : un bouton sur chaque entrée ouvre un brouillon qui cite l'entrée corrigée. La liste déroulante de la fenêtre actuelle disparaît.

## 3. Remplace

La fenêtre « Ajouter au cahier » actuelle.
