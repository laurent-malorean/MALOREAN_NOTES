# Déplacer un bloc de texte

Spécification fonctionnelle rédigée le 27/11, **à valider par l'utilisateur** : ne pas coder avant sa validation. Ce document se lit seul. Les points marqués **(à valider)** sont des propositions.

## 1. Idée

Comme dans Notion : quand on passe la souris sur un paragraphe, un titre, un élément de liste… deux petits boutons apparaissent dans la marge à sa gauche. Le premier ajoute un bloc dessous, le second, une poignée, permet de saisir le bloc et de le glisser ailleurs dans la note. Rien ne change dans le fichier que l'ordre des lignes de Markdown.

## 2. Vocabulaire

- **Bloc de texte** : un morceau de la note qui se déplace d'un seul geste (§ 3).
- **Poignée de bloc** : le bouton à six points (⋮⋮) dans la marge à gauche d'un bloc ; on le glisse pour déplacer le bloc, on le clique pour ouvrir son menu.
- **Bouton d'insertion** : le bouton « + » à gauche de la poignée ; il ajoute un paragraphe vide sous le bloc.
- **Repère de dépôt** : la ligne horizontale colorée qui montre, pendant le glissement, où le bloc va tomber.

Ces mots entrent dans `doc/ontology.md` avant le code.

## 3. Ce qu'est un bloc de texte

Un bloc de texte est lu dans le Markdown de la note, au premier niveau :

- **un paragraphe** : les lignes qui se suivent jusqu'à une ligne vide ;
- **un titre** : sa ligne seule ; ses paragraphes ne le suivent pas **(à valider)** ;
- **un élément de liste** (à puces, numérotée, case à cocher), **avec tous ses sous-éléments** ;
- **une citation** : toutes ses lignes ;
- **un bloc de code** : de la ligne d'ouverture à la ligne de fermeture ;
- **un tableau**, **une ligne de séparation**, **une image** seule sur sa ligne.

L'en-tête de la note (le bloc YAML en tête de fichier) n'est pas un bloc de texte : il reste en haut et n'a pas de poignée.

## 4. Les boutons dans la marge

- Ils apparaissent **au survol du bloc** avec la souris, et disparaissent quand elle s'en va **(à valider)** ; ils sont dans la marge qui existe déjà à gauche du texte, sans le décaler.
- Un bloc multiligne (liste, tableau, code) a une seule paire de boutons, alignée sur sa première ligne.
- Même taille, mêmes couleurs et même survol que les autres boutons-icônes de l'application (valeurs du thème).
- Bulles d'aide : « Ajouter un bloc dessous » et « Glisser pour déplacer, cliquer pour le menu ».
- Absents sur une note en lecture seule (corbeille, cahier de recherche), et pendant une saisie vocale.

## 5. Déplacer en glissant

1. Appuyer sur la poignée et bouger : le bloc entier se met en retrait grisé à sa place, et le repère de dépôt suit la souris entre les blocs.
2. Relâcher : le bloc est retiré d'où il était et posé à l'endroit du repère. Le curseur reste dans le bloc déplacé.
3. **Échap** pendant le glissement, ou relâcher sur la place d'origine : rien ne change.
4. Près du haut ou du bas de la zone visible, la note défile toute seule pour atteindre une place éloignée.
5. Le glissement reste dans la même note : pas d'une note à une autre, ni d'une colonne à l'autre.

### 5.1 Ce qui se passe dans le fichier

- Seules les lignes du bloc changent de place ; le texte du bloc n'est pas modifié.
- **Lignes vides** : entre deux blocs de paragraphe, de titre, de citation, de code ou de tableau, il reste une seule ligne vide, avant comme après le bloc déplacé. Entre deux éléments d'une même liste, il n'y en a pas.
- **Élément de liste** : il prend le niveau de retrait de l'élément voisin devant lequel il est déposé ; ses sous-éléments le suivent en gardant leur retrait relatif **(à valider)**. Déposé entre deux paragraphes, il forme une liste à lui seul.
- **Liste numérotée** : les numéros sont refaits dans l'ordre, dans la liste de départ et dans celle d'arrivée.
- **Une seule étape d'annulation** : Cmd + Z remet le bloc à sa place d'origine en un coup, Cmd + Maj + Z le redéplace.
- Le changement s'enregistre, et entre dans l'historique des versions, comme n'importe quelle modification.

## 6. Le menu de la poignée

Un clic sur la poignée, sans glisser, ouvre un petit menu, pour ceux qui ne veulent pas glisser (aucune action ne dépend du seul glissement, ni d'un raccourci clavier) **(à valider)** :

- **Monter** : le bloc passe au-dessus du bloc précédent ;
- **Descendre** : le bloc passe sous le bloc suivant.

Chaque entrée est grisée quand elle est sans effet (premier bloc, dernier bloc). Les règles du § 5.1 sont les mêmes. **Échap** ferme le menu.

## 7. Le bouton d'insertion

- Un clic sur « + » ajoute **une ligne vide sous le bloc** (après le dernier sous-élément s'il s'agit d'une liste) et y place le curseur ; l'utilisateur écrit ensuite en Markdown comme d'habitude (`#`, `-`, `>`…). Aucun menu de types de bloc **(à valider)**.
- Sous un élément de liste, la nouvelle ligne est un nouvel élément de la même liste, au même niveau.
- Une seule étape d'annulation.

## 8. Où ça marche

- Dans l'éditeur de texte d'une note et dans celui d'un brouillon d'entrée de cahier de recherche : partout où l'on écrit du Markdown avec l'éditeur habituel **(à valider)**.
- Pas dans les champs de formulaire, les nœuds de canvas ni de carte mentale, ni dans une note en lecture seule.
- Au pointeur seulement. Pas de gestes tactiles dans cette version.

## 9. Contraintes techniques

- Aucun nouveau format de fichier : le déplacement est une modification de texte (une seule transaction de l'éditeur), vue par la synchronisation et les versions comme une édition ordinaire.
- Les blocs sont lus dans l'arbre syntaxique du Markdown de l'éditeur, pas par des expressions régulières sur le texte.
- Le repère de dépôt et le retrait grisé sont des décors de l'éditeur, jamais du contenu.
- Les mots affichés (bulles d'aide, menu) sont en français.

## 10. Hors périmètre

- Déplacer plusieurs blocs d'un coup, sélectionner un bloc entier, copier ou dupliquer un bloc.
- Transformer un bloc en un autre type (menu « Transformer en »), menu de types au « + » ou à la barre oblique.
- Déplacer un titre avec toute sa section (le panneau Plan reste l'outil de la structure).
- Déplacer un bloc vers une autre note, une autre colonne ou un autre type de contenu.
- Colonnes côte à côte dans une note.
- Raccourci clavier de déplacement : le menu du § 6 est la voie sans glisser.

## 11. À valider

1. Un titre se déplace seul, sans les paragraphes qui le suivent.
2. Les boutons apparaissent seulement au survol du bloc.
3. Un élément de liste prend le niveau de son voisin au dépôt, ses sous-éléments le suivent.
4. Le menu de la poignée : Monter, Descendre, rien d'autre.
5. Le « + » ajoute une ligne vide dessous, sans menu de types de bloc.
6. Périmètre : les éditeurs de texte (notes, brouillons de cahier), jamais d'une note à l'autre.
