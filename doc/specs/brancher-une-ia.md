# Brancher une IA à l'application

Spécification fonctionnelle, rédigée le 25/11 (demande du 24/11). Ce document se lit seul.

## 1. Besoin

Aujourd'hui, les outils de l'application (chercher, étiquettes, cahier de recherche, etc.) ne sont donnés qu'à la colonne Claude Code, le temps d'un tour. L'utilisateur veut s'en servir depuis une IA extérieure à l'application, par exemple l'extension Claude de VS Code ou Codex, sans ouvrir aucun port réseau.

## 2. Vocabulaire

- **Brancher une IA** : donner à une IA extérieure l'accès aux outils de l'application.
- **Clé de branchement** : le secret que l'IA présente pour être écoutée. Elle est stable : elle ne change que si l'utilisateur la révoque. À ne pas confondre avec la clé du tour, propre à la colonne Claude Code.
- **Commande de branchement** : la petite commande que l'IA lance pour joindre l'application (le programme de l'application lui-même, comme le relais de la colonne Claude Code).

## 3. Comportement

- Un onglet **« Brancher une IA »** dans les Réglages. Tout s'y fait avec des boutons.
- **Sans clé** : l'onglet explique en une phrase à quoi il sert et montre un seul bouton, **« Créer une clé de branchement »**. Tant qu'il n'y a pas de clé, l'application n'ouvre aucune prise pour les IA extérieures.
- **Créer** : le bouton crée la clé et l'affiche avec un bouton **« Copier »**. Dessous, deux blocs de configuration prêts à coller, chacun avec son bouton « Copier » :
  - pour **Claude** (extension VS Code et Claude Code hors de l'application) ;
  - pour **Codex**.
  Chaque bloc contient la commande de branchement et la clé ; il n'y a rien d'autre à chercher ni à taper.
- **Avec une clé** : l'onglet montre qu'elle existe, la date de sa création, les blocs à copier et un bouton **« Révoquer la clé »**. La clé reste affichée et copiable tant qu'elle existe.
- **Révoquer** : le bouton, après confirmation, efface la clé. Les IA déjà branchées sont coupées tout de suite et l'application referme la prise. Le bouton « Créer une clé de branchement » revient ; une nouvelle clé n'a rien à voir avec l'ancienne.
- **L'application doit tourner** : l'IA extérieure n'est écoutée que tant que l'application est ouverte. Fermée, la commande de branchement répond à l'IA que l'application n'est pas lancée.
- **Ce que l'IA reçoit** : les mêmes outils que la colonne Claude Code, sur les espaces de travail que l'utilisateur a autorisés, désignés par leur nom et jamais par un chemin. Les règles de l'application s'appliquent à l'identique (corbeille, dossier des pièces jointes, cahiers en ajout seul).
- **Choisir les espaces de travail** : sous le texte d'introduction, l'onglet montre la liste des espaces de travail de l'utilisateur, **une case à cocher chacun** (« Espaces de travail ouverts aux IA »), avec ou sans clé. **Aucune n'est cochée au départ** : une IA branchée ne voit alors aucun espace. Cocher un espace le rend visible et utilisable par les IA ; le décocher le leur retire tout de suite. L'état se garde d'un lancement à l'autre, avec les préférences de l'application (jamais dans l'espace de travail) ; créer ou révoquer la clé ne le change pas. Les réglages de l'application (thème, largeur du texte…) ne sont jamais ouverts à une IA.
- **Lister les espaces** : l'outil `list_workspaces` donne à l'IA le nom de chaque espace coché, avec celui qui est ouvert chez l'utilisateur ; aucun coché : une liste vide et un message qui renvoie à l'onglet « Brancher une IA ».
- **Choisir l'espace d'un outil** : chaque outil accepte un paramètre facultatif `workspace` (un nom). Sans lui, c'est l'espace ouvert chez l'utilisateur, s'il est coché. Un nom inconnu ou non coché est refusé, avec la liste des noms permis. L'espace choisi s'ouvre en arrière-plan : l'écran et l'espace de l'utilisateur ne changent pas. Un espace décoché ou disparu pendant le travail refuse l'appel suivant, sans rien écrire ailleurs. `viewed_note` et `show_note`, qui parlent de l'écran, ne visent que l'espace ouvert.
- **Changer le texte d'une note** : l'outil `replace_in_note` remplace un texte par un autre (`old_text`, `new_text`) dans une note simple, avec les règles de la saisie (version du texte d'avant gardée, index à jour, nom du fichier qui suit le titre). Le texte à remplacer est recopié à l'identique ; s'il est introuvable, vide ou répété, l'IA reçoit une erreur claire en français et rien n'est changé ; `replace_all` à vrai remplace toutes les occurrences. Refusé sur un cahier de recherche (on n'y ajoute que des entrées, par `add_entry`) et sur une carte mentale, un canvas ou un CRM. Fiche 0075.
- **La colonne Claude Code** : son espace de travail reste celui du tour, coché ou non ; elle peut viser un autre espace coché par `workspace`, comme une IA branchée.
- **Sans clé ou avec une mauvaise clé** : tout est refusé.

## 4. Contraintes

- **Aucun port réseau** : ni TCP, ni UDP, ni écoute sur `localhost`. Seule une prise locale du Mac sert, dans un dossier que seul le compte de l'utilisateur peut ouvrir (voir la fiche 0040).
- **Stockage de la clé** : un fichier lisible par l'utilisateur seul, hors de l'espace de travail et jamais dans les notes. Elle n'est ni écrite dans un journal ni envoyée nulle part.
- **Risque assumé** : un programme du Mac qui connaît la clé lit et écrit les notes comme l'IA branchée. C'est pourquoi la clé est révocable en un clic.
- **Les mêmes outils pour tous** : la colonne Claude Code et les IA extérieures partagent un seul serveur d'outils ; un outil ajouté sert aux deux.

## 5. Hors de cette version

- Plusieurs clés distinctes (une par IA), avec un nom chacune.
- Choisir les outils permis à chaque IA.
- Un mode réseau ou l'API ouverte à d'autres IA (tâche à part).

## 6. Vérification avec les vrais outils

L'essai se fait avec l'extension VS Code et avec Codex, sur le vrai `.app`. L'utilisateur est prévenu avant que la fonction soit annoncée terminée, avec les gestes exacts à essayer.
