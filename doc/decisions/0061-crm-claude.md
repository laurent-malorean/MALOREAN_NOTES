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
