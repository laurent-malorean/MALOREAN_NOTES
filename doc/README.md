# Documentation de MALOREAN Notes

## À la racine

- [`produit.md`](produit.md) : vision, principes et périmètre de l'application.
- [`ontology.md`](ontology.md) : le vocabulaire, un seul mot par notion, employé partout (écrans, documents, code, tests).

## Dossiers

- [`specs/`](specs/) : les spécifications fonctionnelles validées, une par fonction : ce que voit et fait l'utilisateur.
- [`format/`](format/) : les formats de fichier, seule description de ce que l'application lit et écrit sur le disque :
  - [`espace-de-travail.md`](format/espace-de-travail.md) : l'organisation d'un espace de travail (dossiers, pièces jointes, corbeille, historique des versions, noms de fichier) ;
  - [`note.md`](format/note.md) : la note Markdown, son en-tête, ses liens, la note du jour et les modèles ;
  - [`cahier-de-recherche.md`](format/cahier-de-recherche.md) : le cahier de recherche et ses entrées datées ;
  - [`carte-mentale.md`](format/carte-mentale.md) : la carte mentale, une liste à puces ;
  - [`canvas.md`](format/canvas.md) : le canvas, au format ouvert JSON Canvas ;
  - [`crm.md`](format/crm.md) : le CRM et ses fiches (entreprises, personnes, projets, actions) ;
  - [`agenda-12.md`](format/agenda-12.md) : l'agenda 12, ses événements et leurs archives.
- [`mcp/`](mcp/) : les outils du serveur MCP offerts aux IA (la liste complète, puis une page par partie : paramètres, réponses, erreurs, exemples).
- [`decisions/`](decisions/) : les fiches des décisions d'architecture, numérotées.
- [`developpement/`](developpement/) : pour travailler sur le code :
  - [`architecture.md`](developpement/architecture.md) et son schéma [`architecture.svg`](developpement/architecture.svg) : couches, organisation du projet, parcours d'une action, liste des fiches de décision ;
  - [`code.md`](developpement/code.md) : les règles de qualité et leurs contrôles (TDD, couverture, mutation, temps de la CI) ;
  - [`travail-en-branches.md`](developpement/travail-en-branches.md) : une branche et un dossier de travail par fonction.
