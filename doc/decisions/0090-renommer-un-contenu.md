# 0090 : renommer un contenu par le menu du clic droit

## Contexte

L'utilisateur ne trouvait aucun moyen de renommer une note, un CRM, une carte mentale. Seule une note simple se
renommait, en tapant son titre `#` ; un CRM, une carte mentale, un canvas, un cahier de recherche n'ont pas de
titre à taper à l'écran. Les dossiers et les espaces de travail avaient « Renommer », pas les contenus : une
action sans contrôle visible.

## Décisions

- **« Renommer… » dans le menu du clic droit d'une note** (liste, onglet, résultat de recherche), juste après
  « Fermer », avec l'icône `edit` du jeu partagé. Le même choix pour une note, une carte mentale, un cahier de
  recherche, un canvas et un CRM. Pas de raccourci : le renommage d'un dossier ou d'un espace de travail n'en a
  pas non plus, et aucun raccourci n'existe pour ce genre de geste.
- **La fenêtre est la demande d'un nom** (celle des espaces de travail), préremplie avec le titre actuel ; Entrée
  ou « Renommer » valide, Échap ou « Annuler » ne fait rien. Nouveau : `refuse`, une vérification faite avant la
  fermeture ; un titre refusé laisse la fenêtre ouverte et s'explique sous le champ (phrase en français, effacée
  à la frappe suivante).
- **Un seul cas d'usage Rust, `RenameNote`**, appelé par la commande `rename_note` de l'interface. Il réutilise les
  règles de l'enregistrement d'une note (`plan_save` : kebab-case, pièces jointes et leurs liens, `SaveNote` :
  index, historique) et `retitled` (le titre `#`, l'en-tête gardé). Le texte d'avant est gardé en version.
  L'outil MCP `rename_note` n'est pas touché : il garde son comportement (suffixe `-2` si le nom est pris).
- **Titre refusé, pas numéroté.** L'enregistrement par le titre tapé donne le suffixe `-2` à un nom pris ; un
  renommage demandé dans une fenêtre ne doit pas surprendre : un titre vide (`EmptyTitle`) ou dont le nom de
  fichier est déjà pris dans le dossier (`TitleTaken`) est refusé, rien ne change.
- **Le titre selon le contenu.** Note, carte mentale, cahier de recherche, CRM : le titre `#` (l'en-tête et le
  reste du texte sont gardés). Canvas : pas de texte à lui, son titre est son nom de fichier (sans `.canvas`) ; le
  titre tapé devient le nom du fichier (« Mon plan » donne `mon-plan.canvas`), le contenu n'est pas touché.
- **Un CRM emmène le dossier de ses fiches.** Les fiches sont dans le dossier qui porte le nom du fichier du CRM,
  et se désignent entre elles par le nom de leur fichier sans dossier : seul le dossier est renommé, aucune fiche
  n'est réécrite. Si le dossier au nouveau nom existe déjà, le renommage est refusé avant toute écriture ; si
  l'enregistrement échoue après le déplacement du dossier, le dossier revient. Le déplacement d'un CRM dans un
  autre dossier n'emmène toujours pas ses fiches (hors de cette fonction).
- **Une fiche de CRM n'a pas « Renommer… »** : entreprise et personne ont leur champ de nom dans leur écran, une
  action sa fenêtre, un projet sa liste ; « renommer une fiche change son titre, jamais son nom de fichier »
  (crm.md § 4.1). L'interface ne propose pas le choix (elle lit le `type:` de la note avant d'ouvrir le menu), et
  Rust refuse aussi (`FicheNamedInItsScreen`).
- **Ce qui suit.** Onglets de toutes les colonnes (même cachés) : nouveau chemin et nouveau titre, avec ceux des
  fiches d'un CRM renommé ; récentes, historique (les versions suivent), épingle (dans l'en-tête), index. Les
  colonnes qui montrent la note relisent son texte. Les liens `[[titre]]` des autres notes ne sont pas réécrits,
  comme pour un titre tapé.
- **Le menu s'ouvre après une question.** Pour savoir si « Renommer… » est offert (pas pour une fiche), le menu
  lit la note avant de s'ouvrir (`withRename`) ; sans module de renommage donné aux listes, le menu s'ouvre tout de
  suite, comme avant.

## Contrôles

Tests Rust (cas d'usage, session, commande), tests d'écran (fenêtre, menus, module de renommage), parcours
`rename-content.spec.ts` (note, onglet, historique, épingle, récentes, canvas, carte, cahier, CRM, fiche) et un
scénario de l'essai de l'application réelle (`rename.ts`).
