# 0034 — Index par types de contenu : chaque élément porte un type et son conteneur ; un seul type pour l'instant, la page

- **Date** : 2026-11-19
- **Statut** : acceptée
- **Complète** la fiche 0028 : même index, même règle de recherche ; le format de la base passe de 1 à 2.
- **Révisée** par la fiche 0037 (20/11/2026) : le type de contenu des notes se nomme désormais « note » (`ContentType::Note`), et non plus « page » ; format de l'index 3. Cette fiche garde l'ancien mot.
- **Complétée** par la fiche 0041 (20/11/2026) : le cahier de recherche et ses entrées, la propriété `type:` lue ; format de l'index 4.

## Contexte

L'application accueillera d'autres contenus Markdown que les notes (CRM avec tableau kanban, carte mentale), sur le modèle d'un autre projet de l'utilisateur. Chaque fichier y dira sa sorte par la propriété `type:` de son en-tête ; un fichier sans `type:` est une page. Un fichier reste un élément indexé : une fiche du kanban est un fichier, une carte mentale aussi. L'utilisateur veut aussi retrouver, depuis un élément, ce à quoi il appartient (le tableau d'une fiche, la carte d'un nœud).

Demandé le 19/11 : préparer l'index à ces types, avec un seul type pour l'instant, la page, sans rien retirer à l'existant.

Pistes regardées pour une note dont l'en-tête porte déjà un `type:` inconnu (`type: kanban`) :

- **L'écarter de l'index** : elle disparaîtrait de la liste et de la recherche alors que rien ne sait encore l'afficher autrement. Rejeté.
- **Garder le nom écrit tel quel** comme type : la recherche et l'écran devraient gérer des types que l'application ne connaît pas. Rejeté.
- **La traiter comme une page** tant que ce type n'existe pas. Retenu : aucune note ne disparaît ; le jour où le type existe, une reconstruction de l'index (changement de format) la reclasse.

## Décision

- **Domaine** : `ContentType` (une seule valeur, `Page`, nommée `"page"`), `ContentType::ALL` (tous les types) et `from_name`. Le résumé d'une note (`NoteSummary`) porte son type et son conteneur (`Option<NotePath>`, aucun pour une page). Toute note lue est une page sans conteneur : la propriété `type:` n'est pas encore lue, elle le sera quand un deuxième type existera.
- **Conteneur désigné par un chemin** : l'élément auquel un autre appartient est un fichier de l'espace de travail ; son chemin suffit, et un type à venir le remplira sans nouveau changement de format.
- **Index** : la table `notes` gagne `type` (le nom du type, jamais vide) et `container` (le chemin du conteneur, `NULL` pour une page). `FORMAT_VERSION` passe à 2 : une base du premier format est remplacée par une base vide, aussitôt remplie à l'ouverture de l'espace de travail, comme le prévoyait la fiche 0028 ; « Reconstruire l'index » ne change pas. Un type ou un conteneur illisible dans la base rend l'index indisponible, comme toute autre valeur abîmée.
- **Filtre par type, préparé** : le port `NoteIndex::search` reçoit les types où chercher (aucun : rien n'est trouvé) ; le cas d'usage `SearchNotes` cherche parmi tous par défaut, `among` restreint. Pas d'élément d'écran tant qu'un seul type existe.
- **Le type et le conteneur suivent chaque résultat** jusqu'à la page (`SearchResultItem.contentType`, `ContentTypeItem`, `container`). L'écran montre le type en petit et en gris, à droite du dossier de chaque résultat : « Page » pour l'instant. Le nom montré de chaque type est tenu par la page (`contentTypeLabel`).
- **« Note » reste le mot du fichier** ; « page » est son type. La question de renommer « note » en « page » reste ouverte pour l'utilisateur.

## Conséquences

- Mesure sur l'espace de travail généré de 2 000 notes de la fiche 0028, version optimisée, médianes de trois passages (avant → après) : ouverture, index à jour, 10,7 à 12,2 ms → 11,2 à 11,4 ms ; liste d'un dossier de 727 notes 0,8 ms → 0,8 à 0,9 ms ; recherche « jardin » (100 résultats) 12,9 à 13,5 ms → 13,1 à 14,1 ms ; recherche « zéphyr » (21 résultats) 1,6 à 1,7 ms → 1,6 à 1,9 ms ; filtre par étiquette 3,3 à 3,5 ms → 3,3 à 3,5 ms. Les écarts restent dans le bruit d'une mesure à l'autre.
- Le premier lancement de cette version relit tout l'espace de travail une fois (la base change de format).
- Un nouveau type ajoutera une valeur à `ContentType`, la lecture de `type:` dans le domaine, son nom à l'écran, et un nouveau numéro de format pour reclasser les notes déjà indexées.
- Les propriétés de l'en-tête (statut, personne…) ne sont pas encore indexées.
