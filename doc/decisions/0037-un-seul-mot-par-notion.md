# 0037 — Un seul mot par notion : le type de contenu « page » devient « note », l'interface ne s'appelle plus « la page »

- **Date** : 2026-11-20
- **Statut** : acceptée
- **Révise** la fiche 0034 (le type de contenu des notes) ; le format de l'index passe de 2 à 3.

## Contexte

Décidé par l'utilisateur le 19/11 : un seul mot par notion, partout — écrans, documents, code, tests —, sans synonyme. Le mot « note » reste celui des notes, partout ; « page » ne doit plus désigner une note. Les types de contenu à venir s'appelleront Note, Carte de kanban, Carte mentale…

L'audit de l'ontologie et du code a trouvé plusieurs notions à deux noms :

- le type de contenu des notes, nommé « page » (`ContentType::Page`, `"page"`, « Page » sur chaque résultat de recherche) ;
- l'interface (le code TypeScript de `ui/` affiché par WebKit), appelée tantôt « l'interface », tantôt « la page », dans les documents, les commentaires et les noms de tests ;
- la liste des dossiers, appelée aussi « colonne des dossiers », alors qu'une colonne est une zone d'édition ;
- la liste des notes, nommée `sidebar` dans les classes et variables CSS ;
- la confirmation et la demande d'un nom, appelées « question » ;
- la carte d'un kanban, appelée « fiche de kanban » ou « fiche de CRM » ;
- « bibliothèque », remplacée par « espace de travail » le 18/11, restée dans quelques phrases.

## Décision

- **La règle** s'écrit dans `CLAUDE.md` (« Méthode ») et `doc/code.md` : un seul mot par notion, partout (écrans, documents, code, tests) ; pas de synonymes ; le mot vient de `doc/ontology.md`. Un mot remplacé reste noté « Autrefois … » dans l'ontologie.
- **Type de contenu « note »** : `ContentType::Note`, nommé `"note"` dans l'index ; `ContentTypeItem` vaut `"note"` ; chaque résultat de recherche montre « Note ». Le format de l'index passe à 3 : une base du format 2, dont les lignes disent `page`, est remplacée par une base vide, aussitôt remplie à l'ouverture de l'espace de travail, comme le prévoit la fiche 0028. Rien à faire pour l'utilisateur.
- **« Page »** ne garde qu'un sens : le feuillet compté par le bandeau (« caractères par page »). Une page web reste « page web ».
- **« Interface »** désigne le code de `ui/` partout ; « la page » n'est plus employée pour elle (commentaires Rust et TypeScript, documents, noms de tests, description des permissions de Tauri). Les objets techniques de WebKit ou de Playwright gardent leur nom d'outil (`page` des parcours, `page_setup` de l'impression), comme la commande `print_page` déjà nommée dans l'ontologie.
- **Liste des dossiers, liste des notes** entrent dans l'ontologie ; les classes et variables CSS suivent : `.notes-panel`, `--notes-panel-width`, `.side-panel-header`, `.side-panel-footer`, `--side-panel` (couleur des panneaux latéraux).
- **Demande d'un nom** entre dans l'ontologie ; « (réglages, fenêtre de choix, confirmation, demande d'un nom) » remplace « (réglages, choix, question) ».
- **Contrôle automatique** : l'étape « Vocabulaire » de `scripts/ci.sh` refuse les anciens mots qu'elle liste (`bibliothèque`, `colonne des dossiers`, `sidebar`, `ContentType::Page`) dans tout fichier du dépôt, sauf les fiches de décision et les lignes « Autrefois … » de l'ontologie. « La page » n'y est pas : « page web » et « page de connexion » restent justes ; la revue s'en charge.
- **Les fiches de décision** sont datées et gardent les mots de leur époque, comme elles l'ont fait pour « bibliothèque ».

## Conséquences

- Le premier lancement de cette version relit tout l'espace de travail une fois (la base change de format).
- Aucun comportement ne change ; seuls les mots montrés changent : « Note » au lieu de « Page » sur les résultats de recherche, et « page web » dans la question posée après une lecture du web.
- Le message que le garde-fou du web donne à Claude garde son texte : l'adaptateur reconnaît une modification retenue à ce texte, enregistré dans les flux de référence des tests.
