# Serveurs MCP de la colonne Claude Code

Spécification fonctionnelle, rédigée le 27/11/2026, à valider. Ce document se lit seul.

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
- **La liste** : chaque serveur MCP extérieur que Claude Code connaît (connecteurs claude.ai, serveurs ajoutés à Claude Code qui se lancent sur le Mac), sauf les serveurs plugins et les serveurs web ajoutés à la main (voir « Ce que les essais du 27/11 ont montré »), une ligne chacun, triée par nom :
  - une case à cocher, nommée par le serveur ;
  - son nom, tel que Claude Code le donne, sans le préfixe « claude.ai » ;
  - son état, en toutes lettres : « Connecté », « À connecter » ou « En échec ».
- **Lecture de la liste** : l'application demande la liste à Claude Code à l'ouverture de l'onglet « Claude ». Cette lecture a pris 13 secondes sur le Mac de l'utilisateur, pour 32 serveurs : pendant ce temps, la rubrique affiche « Lecture des serveurs de Claude Code… » et le reste des Réglages reste utilisable. Un bouton **« Actualiser »** relit la liste.
- **Claude Code absent ou pas connecté** : la rubrique le dit en une phrase et renvoie à la colonne Claude Code, comme la vérification de la connexion ; aucune liste.
- **Aucun serveur coché au départ.** Cocher un serveur le permet dès le message suivant ; le décocher le retire dès le message suivant. Un tour déjà en cours garde ce qu'il avait au départ.
- **Garde du choix** : les noms des serveurs cochés se gardent d'un lancement à l'autre, avec les préférences de l'application, jamais dans l'espace de travail. Le choix vaut pour tous les espaces de travail.
- **Serveur coché disparu** : un serveur coché que Claude Code ne connaît plus reste dans la liste, coché, avec l'état « Introuvable », jusqu'à ce que l'utilisateur le décoche. Il n'est pas ouvert à Claude.

### La connexion à chaque service

- L'application ne fait aucune connexion elle-même et ne garde aucun mot de passe ni jeton : elle réutilise la connexion que Claude Code a déjà.
- **Serveur « À connecter »** : sous son nom, une phrase dit quoi faire :
  - pour un connecteur claude.ai : « Connectez-le dans les réglages des connecteurs de claude.ai, puis cliquez sur « Actualiser ». » ;
  - pour un autre serveur : « Connectez-le dans le Terminal : tapez `claude`, puis `/mcp`, puis cliquez sur « Actualiser ». ».
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
Serveurs MCP                                            [ Actualiser ]
Les services que Claude peut utiliser dans la colonne Claude Code,
en plus des outils de l'application. Seuls les serveurs cochés lui
sont ouverts.

[ ] Atlassian                Connecté
[ ] Figma                    À connecter
      Connectez-le dans les réglages des connecteurs de claude.ai,
      puis cliquez sur « Actualiser ».
[x] Noota                    Connecté
[ ] Notion                   Connecté
[ ] Slack                    Connecté
…
```

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
- Serveurs plugins de Claude Code : ils n'arrivent pas non plus et ne sont pas dans la liste de cette version.
- Reste non essayé, faute d'un tel serveur sur le Mac : un serveur web ajouté à la main dans Claude Code et qui demande une connexion (OAuth). La connexion faite dans Claude Code est-elle reprise quand l'application passe le serveur elle-même ? L'essai demande d'abord que l'utilisateur ajoute et connecte un tel serveur dans le Terminal. Tant que cet essai n'est pas fait, ces serveurs restent hors de cette version.

## 7. Vérification avec les vrais outils

Sur le vrai `.app`, avec le compte de l'utilisateur :

1. Ouvrir Réglages > Claude : la liste montre Noota « Connecté ».
2. Cocher Noota. Dans la colonne Claude Code, demander « liste mes 3 dernières réunions Noota » : les réunions s'affichent, l'action est montrée « Noota · search_records ».
3. Demander un outil Slack, non coché : Claude ne le voit pas.
4. Décocher Noota : au message suivant, Claude ne voit plus Noota.

L'utilisateur est prévenu avant que la fonction soit annoncée terminée, avec ces gestes à essayer.
