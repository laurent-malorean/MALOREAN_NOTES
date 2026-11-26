# 0024 — Espaces de travail : une liste gardée par Rust, chaque espace désigné par son nom

- **Date** : 2026-11-18
- **Statut** : acceptée

## Contexte

L'application n'ouvrait qu'un dossier de notes à la fois, la « bibliothèque », et ne se souvenait que du dernier. On veut, comme les « vaults » d'Obsidian, garder plusieurs dossiers et passer de l'un à l'autre. On prépare aussi le pilotage par des IA, qui ne doivent pas savoir où les notes sont rangées sur le disque.

## Décision

- **Le mot** : « espace de travail » (`Workspace`) remplace « bibliothèque » (`Library`) partout : ontologie, interface, code, types partagés, commandes, documentation. Les fiches acceptées gardent l'ancien mot, avec une note en tête.
- **Un espace de travail = un nom + un dossier.** Le nom est choisi par l'utilisateur, celui du dossier par défaut, sans espaces autour ; deux espaces n'ont jamais le même nom (majuscules ignorées) ni le même dossier.
- **La liste est gardée par Rust**, avec les autres préférences de l'application (`preferences.json`, dans le dossier de configuration), à la place de « la dernière bibliothèque ouverte » : chaque espace (nom, dossier) dans l'ordre d'ajout, et le nom de celui ouvert en dernier, rouvert au lancement. Le port `Preferences` lit et écrit la liste entière (`workspaces`, `save_workspaces`) ; ses tests de contrat sont joués sur le faux et sur le fichier JSON. Les règles (noms et dossiers uniques, espace ouvert) vivent dans l'application (`Workspaces`), pas dans l'adaptateur.
- **Passage de l'ancien fichier** : un `preferences.json` qui ne connaît que `last_library` (ou `last_workspace`) donne un premier espace de travail, nommé d'après son dossier, ouvert. L'ancienne clé n'est plus écrite.
- **Entre l'interface et Rust, un espace de travail est désigné par son nom** : ouvrir, renommer, retirer prennent un nom ; la liste ne rend que les noms et lequel est ouvert. Seul l'ajout reçoit un dossier, celui que l'utilisateur vient de choisir dans la fenêtre du Mac. L'espace ouvert garde l'emplacement de son dossier, comme avant, pour les images des notes.
- **Ajouter** : choisir un dossier, puis un nom (prérempli avec celui du dossier) ; le nouvel espace s'ouvre. **Renommer** ne change que le nom. **Retirer** oublie l'espace, sans toucher à ses fichiers ; l'espace ouvert ne se retire pas (passer d'abord à un autre), pour que la fenêtre montre toujours un espace connu.
- **Passer d'un espace à l'autre** : tout ce qui est tapé est enregistré d'abord, puis l'espace s'ouvre avec ses colonnes, ses dossiers pliés, son tri, ses notes récentes, son dossier des modèles et son journal. Le sélecteur est en tête de la colonne des dossiers (le nom de l'espace ouvert, avec un menu) ; la palette a « Changer d'espace de travail » (Cmd+Maj+E), « Ajouter un espace de travail », « Renommer l'espace de travail » et « Retirer un espace de travail ».
- **Les réglages de confort de chaque espace** (disposition, dossiers pliés, tri, notes récentes, journal ; le dossier des modèles a rejoint les préférences de l'application, fiche 0077) restent rangés dans le stockage de la page sous le dossier de l'espace (`malorean.layout:<dossier>`…), comme avant : un dossier n'appartient qu'à un espace, et renommer un espace ne les perd pas. Les clés n'ont pas changé : rien de ce que l'utilisateur avait gardé n'est perdu.

## Conséquences

- Plusieurs dossiers de notes, retrouvés d'un lancement à l'autre, sans jamais toucher aux fichiers pour renommer ou retirer.
- Une API prête pour les IA : un nom suffit pour désigner un espace, aucun chemin n'est à connaître.
- Un dossier déplacé dans le Finder n'est pas suivi : son espace ne s'ouvre plus (message), il faut le retirer et l'ajouter de nouveau.
- Un espace retiré puis ajouté de nouveau sur le même dossier retrouve ses colonnes et ses réglages de confort.
