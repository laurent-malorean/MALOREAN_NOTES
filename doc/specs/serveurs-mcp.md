# Serveurs MCP de la colonne Claude Code

Spécification fonctionnelle, rédigée le 27/11/2026, **validée par l'utilisateur le 27/11** (demande de développement). Présentation de la rubrique (§ 3 « La liste », « La connexion à chaque service », maquette, § 9) refaite le 28/11 à la demande de l'utilisateur. Ce document se lit seul.

## 1. Besoin

L'utilisateur veut que Claude, dans la colonne Claude Code, se serve des mêmes services que dans VS Code : par exemple lire ses réunions Noota, ou chercher dans Notion ou Google Drive. Ces services sont des serveurs MCP. Dans VS Code, Claude Code les reçoit tous, car ils sont rattachés au compte Claude de l'utilisateur (connecteurs claude.ai) ou ajoutés à son Claude Code.

Aujourd'hui, la colonne Claude Code ne reçoit que le serveur de l'application. Tout autre serveur MCP est bloqué exprès (fiche 0032) : rien de ce que l'utilisateur a branché ailleurs n'y arrive, et un fichier `.mcp.json` posé dans les notes ne change rien.

La fonction : l'utilisateur choisit, serveur par serveur, ceux que Claude peut utiliser dans la colonne. Cela vaut pour n'importe quel serveur MCP que Claude Code connaît, pas seulement Noota.

## 2. Vocabulaire

- **Serveur MCP extérieur** : un serveur MCP que Claude Code connaît sur ce Mac, autre que celui de l'application. Il s'agit d'un connecteur du compte claude.ai (Noota, Notion, Slack…) ou d'un serveur ajouté par l'utilisateur à son Claude Code.
- **Serveur permis** : un serveur MCP extérieur que l'utilisateur a coché ; Claude peut se servir de tous ses outils dans la colonne Claude Code.
- **État d'un serveur** : ce que Claude Code dit d'un serveur quand l'application lit la liste : « connecté », « à connecter » (la connexion au service n'est pas faite), ou « en échec » (le serveur ne répond pas).

Ces mots entrent dans l'ontologie avant le code.

## 3. Comportement

### La rubrique « Serveurs MCP »

- **Où** : dans l'onglet « Claude » des Réglages, une rubrique **« Serveurs MCP »**, sous le réglage des modifications après une lecture du web.
- **Phrase d'introduction** : « Les services que Claude peut utiliser dans la colonne Claude Code, en plus des outils de l'application. Seuls les serveurs cochés lui sont ouverts. »
- **La liste** : chaque serveur MCP extérieur que Claude Code connaît (connecteurs claude.ai, serveurs ajoutés à Claude Code dans le Terminal, qu'ils se lancent sur le Mac ou soient sur le web), sauf les serveurs apportés par les plugins de Claude Code. Elle est **regroupée par état** (refonte du 28/11, demandée par l'utilisateur après essai de l'application réelle : la liste était tassée et répétait la même phrase sous chaque serveur « À connecter ») : « Connectés » d'abord, puis « À connecter », « En échec » et « Introuvables » (un serveur coché disparu reste visible dans ce dernier groupe). Chaque groupe a un petit titre avec son nombre de serveurs ; un groupe vide n'a pas de titre. Dans un groupe, les serveurs sont triés par nom. Une ligne par serveur, qui ne garde que :
  - une case à cocher, nommée par le serveur ;
  - son nom, tel que Claude Code le donne, sans le préfixe « claude.ai » ;
  - son état, en toutes lettres, à droite : « Connecté », « À connecter », « En échec » ou « Introuvable ».
- **En tête de la liste** : le nombre de serveurs (« 32 serveurs », « 1 serveur ») à gauche, le bouton **« Actualiser »** à droite, sous la phrase d'introduction.
- **Une zone de défilement** : quand la liste est longue, elle défile dans sa propre zone (28 rem de haut au plus) ; le titre de chaque groupe reste en haut pendant qu'on défile.
- **Les « À connecter » repliés s'ils sont plus de 5** : au-delà de 5 serveurs « À connecter », ceux qui ne sont pas cochés sont masqués au départ ; un bouton « Afficher les N serveurs non cochés » les déplie, puis devient « Masquer les serveurs non cochés ». Un serveur « À connecter » coché reste toujours visible. Les autres groupes ne se replient jamais.
- **Lecture de la liste** : l'application demande la liste à Claude Code à l'ouverture de l'onglet « Claude ». Cette lecture a pris 13 secondes sur le Mac de l'utilisateur, pour 32 serveurs : pendant ce temps, la rubrique affiche « Lecture des serveurs de Claude Code… » et le reste des Réglages reste utilisable. Un bouton **« Actualiser »** relit la liste.
- **Claude Code absent ou pas connecté** : la rubrique le dit en une phrase et renvoie à la colonne Claude Code, comme la vérification de la connexion ; aucune liste.
- **Aucun serveur coché au départ.** Cocher un serveur le permet dès le message suivant ; le décocher le retire dès le message suivant. Un tour déjà en cours garde ce qu'il avait au départ.
- **Garde du choix** : les noms des serveurs cochés se gardent d'un lancement à l'autre, avec les préférences de l'application, jamais dans l'espace de travail. Le choix vaut pour tous les espaces de travail.
- **Serveur coché disparu** : un serveur coché que Claude Code ne connaît plus reste dans la liste, coché, avec l'état « Introuvable », jusqu'à ce que l'utilisateur le décoche. Il n'est pas ouvert à Claude.

### La connexion à chaque service

- L'application ne fait aucune connexion elle-même et ne garde aucun mot de passe ni jeton : elle réutilise la connexion que Claude Code a déjà.
- **Serveurs « À connecter »** : la phrase qui dit quoi faire n'est dite **qu'une seule fois**, en tête du groupe « À connecter », jamais sous chaque serveur :
  - pour les connecteurs claude.ai : « Connectez-les dans les réglages des connecteurs de claude.ai, puis cliquez sur « Actualiser ». » ;
  - pour les serveurs ajoutés dans le Terminal : « Connectez-les dans le Terminal : tapez `claude`, puis `/mcp`, puis cliquez sur « Actualiser ». ».
  - Une phrase n'apparaît que si le groupe contient au moins un serveur de cette origine ; quand les deux origines sont là, le groupe montre d'abord les connecteurs sous leur phrase, puis les serveurs du Terminal sous la leur. La phrase reste visible quand les serveurs sont repliés.
- Un serveur « À connecter » peut être coché ; ses outils échoueront tant que la connexion n'est pas faite, et la colonne montre l'erreur du service.

### Dans la colonne Claude Code

- **Ce que Claude reçoit** : le serveur de l'application, comme aujourd'hui, plus les serveurs permis. Tous les outils d'un serveur permis sont permis d'office, sans rien demander.
- **Les serveurs non cochés sont invisibles pour Claude** : il ne voit pas leurs outils et ne peut pas les appeler.
- **Les connecteurs arrivent après le début du tour** : ils mettent quelques secondes à se connecter. Claude peut aller chercher leurs outils une fois prêts, au lieu de répondre qu'ils n'existent pas.
- **Affichage d'une action** : l'appel d'un outil d'un serveur permis est une action de Claude comme les autres, montrée avec le nom du serveur et celui de l'outil (« Noota · search_records »), puis son issue.
- **Garde-fou du web** : la réponse d'un serveur MCP extérieur vient de l'extérieur, comme une page web. Elle compte comme une lecture du web : quand les modifications après une lecture du web sont retenues, les créations et modifications de notes qui suivent dans le tour attendent l'accord de l'utilisateur.
- **Rien d'autre ne s'ouvre** : les réglages de Claude Code de l'utilisateur et ceux posés dans l'espace de travail (`.mcp.json`, `.claude/`) restent ignorés. Seuls les serveurs cochés passent.
- **Les IA branchées** (onglet « Brancher une IA ») ne sont pas concernées : cette rubrique ne règle que la colonne Claude Code.

### Maquette de la rubrique

```
Serveurs MCP
Les services que Claude peut utiliser dans la colonne Claude Code,
en plus des outils de l'application. Seuls les serveurs cochés lui
sont ouverts.
32 serveurs                                             [ Actualiser ]
+--------------------------------------------------------------------+
| Connectés  11                                                      |
|--------------------------------------------------------------------|
| [ ] Atlassian                                           Connecté   |
|--------------------------------------------------------------------|
| [x] Noota                                               Connecté   |
|--------------------------------------------------------------------|
| [ ] Slack                                               Connecté   |
| …                                                                  |
| À connecter  21                                                    |
|--------------------------------------------------------------------|
| Connectez-les dans les réglages des connecteurs de claude.ai,      |
| puis cliquez sur « Actualiser ».                                   |
| [ Afficher les 21 serveurs non cochés ]                            |
| En échec  1                                                        |
|--------------------------------------------------------------------|
| [ ] serveur-en-panne                                    En échec   |
+--------------------------------------------------------------------+
```

Lignes de 36 points au moins, séparées par un filet discret, fond au survol ; couleurs, polices et espacements du thème (clair et sombre) ; la liste ne déborde pas en largeur étroite.

## 4. Contraintes

- **Choix exprès de l'utilisateur** : aucun serveur extérieur n'est ouvert sans qu'il l'ait coché lui-même. Cocher un serveur donne à Claude tous ses outils, y compris ceux qui écrivent dans le service (envoyer un message Slack, créer une page Notion…) : la phrase d'introduction et l'aide de la case le disent.
- **Révision de la fiche 0032** : elle disait « aucun autre serveur MCP que celui de l'application ». Une nouvelle fiche de décision la révise : d'autres serveurs, seulement ceux cochés par l'utilisateur, tous les autres restent fermés.
- **Aucun secret gardé par l'application** : ni jeton, ni mot de passe ; seuls les noms des serveurs cochés sont gardés. La description d'un serveur ajouté dans Claude Code est relue à chaque tour et n'est jamais écrite ailleurs.

## 5. Hors de cette version

- Choisir outil par outil (par exemple « lecture seule » pour un serveur).
- Ajouter, retirer ou connecter un serveur depuis l'application ; cela se fait dans claude.ai ou dans Claude Code.
- Un choix différent par espace de travail.
- Ouvrir ces serveurs aux IA branchées.

## 6. Ce que les essais du 27/11 ont montré

Essais faits avec Claude Code lancé comme la colonne Claude Code le lance, sans le blocage des autres serveurs :

- La connexion Noota faite dans claude.ai est réutilisée telle quelle : la liste des réunions récentes et celle des espaces Noota ont répondu sans erreur d'authentification.
- Le serveur de l'application et Noota répondent ensemble dans le même tour.
- Seul Noota permis : l'appel d'un outil Notion a été refusé d'office.
- Sans moyen d'aller chercher les outils une fois prêts, Claude ne voyait pas les connecteurs dans 3 essais sur 4 ; avec ce moyen, il les a trouvés.
- Les connecteurs claude.ai arrivent d'eux-mêmes, même quand l'application ignore les réglages de l'utilisateur.
- Les serveurs ajoutés par l'utilisateur à son Claude Code (pour tout le Mac ou pour un dossier) n'arrivent pas d'eux-mêmes : deux serveurs d'essai, ajoutés puis retirés, étaient « Connecté » dans la liste de Claude Code, mais la colonne ne les a pas reçus. Lire les réglages de l'utilisateur pour les recevoir ouvrirait aussi ses autres réglages (crochets, permissions), ce que la fiche 0032 interdit. À la place, l'application lit la description de chaque serveur coché dans Claude Code au début de chaque tour, et la passe elle-même à Claude Code, comme elle passe déjà son propre serveur (ce passage a été essayé : le serveur de l'application ainsi passé et Noota ont répondu dans le même tour).
- Serveur web ajouté dans le Terminal et qui demande une connexion (essayé avec Noota, ajouté une seconde fois sous un autre nom puis connecté par `claude mcp login`) : passé par l'application, il a répondu avec la connexion faite dans le Terminal, sans erreur d'authentification. Noota refuse un serveur ajouté dans le Terminal dont le nom contient « Noota » : il faut lui donner un autre nom.
- Un serveur ajouté dans le Terminal à la même adresse qu'un connecteur claude.ai fait disparaître ce connecteur pour Claude Code : la liste montre alors seulement le serveur du Terminal, et c'est lui qu'il faut cocher.
- Le garde-fou du web se déclenche sur les outils d'un serveur extérieur, connecteur claude.ai comme serveur du Terminal.
- Masquer un serveur non coché : Claude, en cherchant ses outils, ne les trouve pas.
- Les serveurs apportés par les plugins de Claude Code n'arrivent pas à la colonne ; ils restent hors de la liste, par choix : ils appartiennent au plugin, pas à l'utilisateur.
- Les deux serveurs d'essai ont été retirés après les essais ; la configuration de Claude Code de l'utilisateur est revenue à l'identique.

## 7. Vérification avec les vrais outils

Sur le vrai `.app`, avec le compte de l'utilisateur :

1. Ouvrir Réglages > Claude : la liste montre Noota « Connecté ».
2. Cocher Noota. Dans la colonne Claude Code, demander « liste mes 3 dernières réunions Noota » : les réunions s'affichent, l'action est montrée « Noota · search_records ».
3. Demander un outil Slack, non coché : Claude ne le voit pas.
4. Décocher Noota : au message suivant, Claude ne voit plus Noota.

L'utilisateur est prévenu avant que la fonction soit annoncée terminée, avec ces gestes à essayer.

## 8. Contrat du moteur

Ce que le moteur offre à l'interface (fiche 0105). Les arguments sont en camelCase ; une erreur est un objet `{ message }` dont le message est en français, prêt à afficher. Les types sont générés dans `ui/src/bridge/generated/` (`McpServersItem`, `McpServerItem`, `ServerStateItem`). Les commandes ne dépendent d'aucun espace de travail ouvert.

### Types

- `ServerStateItem` : `"connected" | "toConnect" | "failed" | "notFound"` : « Connecté », « À connecter », « En échec », « Introuvable ». Les mots en toutes lettres sont ceux de la maquette (§ 3) ; c'est à l'interface de les écrire.
- `McpServerItem` : `{ name: string, displayName: string, connector: boolean, state: ServerStateItem, allowed: boolean }` : `name` est le nom tel que Claude Code le donne (celui que les commandes reçoivent) ; `displayName` le même sans le préfixe « claude.ai » ; `connector` vrai pour un connecteur du compte claude.ai (la phrase d'un serveur « À connecter » n'est pas la même que pour un serveur ajouté dans le Terminal) ; `allowed` : la case est cochée.
- `McpServersItem` : `{ kind: "listed", servers: McpServerItem[] } | { kind: "unavailable", message: string }`. `servers` est déjà trié par nom montré (casse ignorée), sans les serveurs des plugins, avec les serveurs cochés que Claude Code ne connaît plus (`state: "notFound"`, `allowed: true`). `message` est la phrase de la rubrique quand Claude Code est absent, pas connecté ou muet : elle renvoie à la colonne Claude Code et à « Actualiser ».

### Commandes

- `list_mcp_servers()` → `McpServersItem` : lit la liste auprès de Claude Code. **Dure jusqu'à une dizaine de secondes** (Claude Code vérifie chaque serveur) : à appeler sans bloquer l'écran, en montrant « Lecture des serveurs de Claude Code… ». Appelée à l'ouverture de l'onglet « Claude » et par « Actualiser ». Ne connecte rien. Erreur : seulement les préférences illisibles ; Claude Code absent ou muet n'est pas une erreur mais `kind: "unavailable"`.
- `allow_mcp_server({ name })` → rien : coche le serveur `name` (son `name`, pas `displayName`). Vaut dès le message suivant. Sans effet s'il est déjà coché. Erreurs : « « … » n'est pas un nom de serveur MCP » (nom vide ou sur plusieurs lignes) ; préférences illisibles ou impossibles à écrire.
- `disallow_mcp_server({ name })` → rien : décoche. Vaut dès le message suivant ; le serveur introuvable décoché disparaît de la liste à la relecture. Sans effet s'il n'était pas coché. Mêmes erreurs.

Les commandes ne rendent pas la liste : après un cochage, l'interface garde la ligne dans l'état voulu sans relire (la relecture dure) ; seule « Actualiser » relit.

### Événements

Aucun événement nouveau. L'action d'un outil d'un serveur permis arrive par l'événement existant `claude-event` (`actionStarted`, `action: "other"`) dont `tool` est déjà le texte à montrer : « Noota · search_records ».

### Règles que l'interface n'a pas à connaître

- Quels serveurs sont ceux de plugins, le tri, le serveur introuvable, le nom montré, le choix de ce qui est ouvert ou caché à Claude à chaque tour, `ToolSearch`, la description des serveurs ajoutés dans le Terminal : tout est dans le moteur.
- Le choix est gardé dans les préférences de l'application (`allowed_mcp_servers`), pour tous les espaces de travail ; il est relu à chaque message envoyé à Claude (`send_to_claude` n'a aucun argument de plus).
- La liste est demandée depuis le dossier personnel de l'utilisateur, jamais depuis l'espace de travail : un `.mcp.json` posé dans les notes ne change rien à la liste ni à ce que Claude reçoit. Un serveur ajouté dans le Terminal « pour un dossier » n'est donc listé que s'il l'a été pour le dossier personnel.
- Si la lecture n'a jamais été faite depuis le lancement, le premier message envoyé avec un connecteur coché la fait d'abord (une dizaine de secondes) pour savoir quels connecteurs cacher.

## 9. Interface réalisée

- **Où** : l'onglet « Claude » des Réglages montre, sous le réglage des modifications après une lecture du web, la rubrique « Serveurs MCP » (une partie de l'écran comme les autres, titre « Serveurs MCP »). Un champ de plus dans le contrôle des onglets : les parties « Claude » et « Serveurs MCP » vont ensemble dans l'onglet « Claude ».
- **Quand la liste est lue** : la première fois que l'onglet « Claude » est montré après l'ouverture des Réglages (au clic sur l'onglet, ou à l'ouverture si c'est le dernier onglet ouvert), jamais si l'on ne va pas sur cet onglet ; un nouveau passage sur l'onglet ne relit pas. « Actualiser » (à droite de l'en-tête de la liste, qui dit le nombre de serveurs) relit ; il est grisé pendant la lecture.
- **Textes** : ceux du § 3, mots pour mots. Pendant la lecture, l'en-tête dit « Lecture des serveurs de Claude Code… » ; liste lue, il dit le nombre de serveurs. Les phrases des serveurs « À connecter » sont celles du § 3, au pluriel, dites une fois par origine (connecteurs, Terminal) avec `claude` et `/mcp` en police de code (les accents graves du § 3 sont la notation du code, ils ne s'affichent pas). Liste vide : « Claude Code ne connaît aucun serveur MCP extérieur. » (seule phrase ajoutée à celles du § 3). Claude Code absent ou muet : la phrase du moteur (§ 8), en couleur d'erreur, sans liste.
- **Le repli** : l'état déplié ou replié des « À connecter » est gardé tant que les Réglages sont ouverts (cocher ne le change pas) ; le bouton garde le focus quand on l'actionne. Quand tous les « À connecter » sont cochés, aucun bouton n'est proposé au départ (rien à masquer).
- **La case** : nommée par le serveur (nom montré, sans « claude.ai »), décrite par son état et, pour un serveur « À connecter », la phrase de son groupe ; sa bulle d'aide dit que Claude pourra se servir de tous les outils du serveur, y compris ceux qui écrivent dans le service, sans rien demander (§ 4). L'état est coloré par les couleurs du thème (succès pour « Connecté », erreur pour « En échec » et « Introuvable », discret pour « À connecter »).
- **Cocher / décocher** : la ligne change aussitôt et la commande part ; la liste n'est pas relue. Si le moteur refuse (préférences illisibles ou impossibles à écrire), la case revient comme elle était et l'erreur du moteur est montrée en message. Décocher un serveur « Introuvable » le fait disparaître de la liste.
- **Les réglages restent utilisables** pendant la lecture : on change d'onglet, on règle autre chose ; la lecture finie, la rubrique se remplit.
- **Dans la colonne Claude Code** : l'action d'un outil d'un serveur permis est montrée « Noota · search_records » (§ 3) ; aucun autre changement d'écran.
- **Essais** : tests d'écran de la rubrique (textes, regroupement, phrase dite une fois, repli, mesures, états, cases, erreurs) et de son câblage ; parcours Playwright (`ui/e2e/mcp-servers.spec.ts`, avec le faux de Rust `ui/e2e/fake-mcp-servers.ts` : paramètres d'adresse `mcp=absent|empty|failing|many`, `mcpDelay`, `mcpAllowed`).
