# 0061 — CRM et Claude : un outil pour créer un CRM, une consigne dans la présentation du serveur, la recherche qui dit le CRM de chaque fiche

- **Date** : 2026-11-25
- **Statut** : acceptée
- **Complète** les fiches 0040 (outils de l'application pour Claude), 0056 (les mêmes outils pour une IA branchée) et 0058 (index des fiches du CRM).

## Contexte

Spécification validée : `doc/specs/crm.md`, § 12 (recherche et liens) et § 13 (Claude). Claude lit et écrit les fiches avec ses outils de fichiers, comme une note, et un CRM ouvert se met à jour en direct : rien à coder pour cela. Restent un outil pour créer un CRM, ce que Claude apprend du format, et une recherche qui rend les fiches avec leur CRM.

## Décision

### L'outil `create_crm`

- Pris parmi les outils de l'application (`AppTool::CreateCrm`, `mcp__malorean__create_crm`), donc offert tel quel à la colonne Claude Code et à une IA branchée : le serveur MCP est le même.
- Entrée : `title` (obligatoire), `folder` (la racine par défaut, créé avec ses parents comme pour `create_note`). Il passe par le cas d'usage `CreateCrm` de la tranche stockage : en-tête `type: crm`, titre `#`, nom du fichier tiré du titre (suffixe si pris). Il rend `{ "path": … }`.
- Un titre refusé (plusieurs lignes) ne crée rien, pas même le dossier : le titre est vérifié avant la création du dossier.
- Il change une note : `changes_notes` est vrai, donc le garde-fou du web le retient après une lecture du web, comme `create_mind_map` ; aucune autre règle à ajouter.

### La consigne sur les CRM

- Elle est dans la **présentation du serveur d'outils** (`instructions` de `initialize`, `session/app_tools/mcp.rs`), que Claude lit à chaque connexion : la colonne Claude Code et une IA branchée la reçoivent donc de la même façon. Aucun prompt système de la colonne n'existe (l'adaptateur n'en passe pas) ; la description de `create_crm` y renvoie.
- Contenu (spécification § 13, format du § 4 en bref) : le rangement (un dossier par sorte de fiche, qui porte le nom du fichier du CRM) et les quatre types de fiche ; une fiche en désigne une autre par `[[nom-de-fichier]]` ; noms de fichier en kebab-case (une action : date puis titre) ; les propriétés d'une action (avec les personnes `[[personne]] · [[entreprise]]`), ses listes à cocher et ses commentaires ; celles d'une personne. Puis les cinq règles : ne jamais toucher à `rang` ; pour un statut, le nom exact d'une colonne du CRM (`TODO`, `Done`, `Cancel` et les étapes de `etapes`, « Progress » et « WaitingFor » sans cette propriété) ; ne rien supprimer sans que l'utilisateur le demande ; un commentaire plutôt qu'une description réécrite.
- Un test lit la présentation et vérifie chaque phrase de la consigne.

## Points tranchés là où la spécification ne dit rien

- La consigne ajoute « ne renommez jamais le fichier d'une fiche » : la spécification (§ 4.1) dit que renommer une fiche change son titre, jamais son nom de fichier, parce que les autres fiches la désignent par ce nom ; l'outil `rename_note` de Claude changerait ce nom.
