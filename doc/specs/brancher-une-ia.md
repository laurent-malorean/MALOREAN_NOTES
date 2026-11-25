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
- **Ce que l'IA reçoit** : les mêmes outils que la colonne Claude Code, sur les mêmes espaces de travail, désignés par leur nom et jamais par un chemin. Les règles de l'application s'appliquent à l'identique (corbeille, dossier des pièces jointes, cahiers en ajout seul).
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
