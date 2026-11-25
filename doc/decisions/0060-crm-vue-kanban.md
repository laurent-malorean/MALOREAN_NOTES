# 0060 — CRM : la vue de base (création, onglets, Kanban, Ma semaine)

- **Date** : 2026-11-25
- **Statut** : acceptée
- **Complète** les fiches 0057 et 0058 (domaine, stockage et commandes du CRM), 0050 (carte mentale : une note montrée à la place de l'éditeur) et 0054 (essai de l'application réelle).

## Contexte

Spécification validée : `doc/specs/crm.md`, §§ 6, 7.1, 7.2 et 7.6. Cette tranche donne au CRM son interface : créer un CRM, la barre d'onglets, le Kanban et Ma semaine. Les onglets Personnes, Entreprises et Projets, la fenêtre d'une action et les fiches viennent à la tranche suivante.

## Décision

- **Un CRM prend la place de l'éditeur dans la colonne**, comme la carte mentale et le canvas : `crm-pane.ts` (la colonne et sa mémoire d'onglet) et `crm-view.ts` (les onglets, l'état, les gestes). L'éditeur garde le texte de la note, caché ; seul Rust écrit les fichiers du CRM. Un CRM est reconnu à son en-tête (`type: crm`), lu comme Rust le lit (`state/declared-type.ts`, partagé avec la carte mentale).
- **L'écran n'a aucune règle** : il affiche la vue complète que `read_crm` rend (colonnes, ordre, retard, jour, semaine, compteurs) et, après chaque geste, la relit, réussi ou refusé. Un message d'erreur de Rust est montré tel quel. Seuls restent côté interface des calculs d'affichage : le texte des dates, le lundi précédent ou suivant, la couleur d'une étiquette (somme des codes de son nom, § 3, que l'interface de Rust n'expose pas), le nombre de cartes montrées d'une colonne terminée.
- **Un dessin complet à chaque lecture**, sans comparaison : le champ de recherche est créé une fois (le redessiner à chaque frappe lui ferait perdre le curseur) ; une saisie en cours (ligne d'ajout rapide, champ d'étape), le défilement du tableau et de chaque colonne sont retrouvés après le dessin. Deux lectures qui se croisent : seule la dernière compte.
- **Glisser aux événements du pointeur** (`crm-drag.ts`, comme la carte mentale) plutôt que par le glisser-déposer HTML : pareil dans les tests, dans la fenêtre et à la souris. Le calcul de la place est pur (`state/crm-drop.ts`) : la carte suivante est la première dont le milieu est plus bas que le pointeur ; pas de place dans une colonne terminée ni pendant un filtre ; un dépôt qui ne change rien n'appelle pas Rust. Le tableau défile quand le pointeur reste à moins de 48 points de son bord : sans cela, un jour ou une colonne hors de vue serait inatteignable dans une fenêtre étroite.
- **Mise à jour en direct** (§ 10) : un changement venu d'ailleurs dont le chemin est dans le dossier du CRM (`clients.md` : `clients/`) relit le CRM montré (`Pane.followCrm`, appelé par le suivi des modifications extérieures).
- **L'onglet choisi est gardé sur ce Mac** (`crm-tab:<chemin>` dans le stockage local), jamais dans le fichier ; les filtres ne le sont pas.
- **Création** : « Nouveau CRM » après « Nouveau cahier de recherche » dans le menu d'un dossier ou de la racine, dans la palette (après les commandes du canvas) et dans le menu Fichier (après « Nouveau canvas… »).

## Points tranchés là où la spécification ne dit rien

- Cliquer une carte ne fait rien pour l'instant (la fenêtre d'une action est la tranche suivante).
- « + Ajouter une action » ouvre toujours la ligne d'ajout rapide, même sans personne dans le CRM (la spécification ouvre alors la fenêtre de l'action) ; la ligne n'a pas « Plus de détails ». Dans Ma semaine, le bouton de chaque jour ouvre la même ligne, avec la date du jour et le statut « TODO », à la place de la fenêtre. La tranche suivante remplace ces deux cas par la fenêtre.
- Une personne ou une entreprise d'une carte dont la fiche n'existe plus est laissée de côté (§ 4.1) : la carte ne montre pas son entreprise d'alors.
- « Afficher 10 de plus (N restantes) » garde le 10 de la spécification même quand il reste moins de 10 cartes ; « restante » au singulier pour une seule.
- « + Ajouter une étape » est une tuile entre la dernière étape et « Done » ; le champ d'étape s'abandonne par Échap, ou en le quittant ; Entrée valide, un nom refusé reste dans le champ avec le message d'erreur.
- Les personnes d'une carte : « Nom (entreprise) » sur une ligne chacune, deux au plus puis « +N » sur une troisième ligne ; les repères de commentaires et de notes liées s'écrivent « 💬 N » et « ⧉ N ».
- Le jour d'un en-tête de Ma semaine s'écrit « Lundi 23 » ; la colonne des actions d'avant le lundi, « En retard ».

## Conséquences

- La tranche suivante appelle les mêmes commandes (`changeCrmAction`, `createCrmAction`…) depuis la fenêtre d'une action et les fiches ; `BoardActions` (ajout rapide, étapes, dépôts) est le point où brancher « Plus de détails » et le clic sur une carte.
- L'essai de l'application réelle joue un scénario du CRM : création par le pont, cinq colonnes visibles (largeurs, hauteurs, cible d'un clic), une carte glissée, le statut relu dans le fichier.
