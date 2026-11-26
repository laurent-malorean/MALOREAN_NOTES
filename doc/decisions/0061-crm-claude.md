# 0061 — CRM et Claude : un outil pour créer un CRM, une consigne dans la présentation du serveur, la recherche qui dit le CRM de chaque fiche

- **Date** : 2026-11-25
- **Statut** : acceptée
- **Complète** les fiches 0040 (outils de l'application pour Claude), 0056 (les mêmes outils pour une IA branchée) et 0058 (index des fiches du CRM).
- **Complétée** par la fiche 0081 (26/11/2026) : lire et écrire les fiches ne passe plus par des outils de fichiers mais par `read_crm` et quatorze outils de changement ; la consigne sur le format des fiches est remplacée, dans la présentation du serveur, par une consigne sur ces outils.

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

### Recherche et liens (§ 12)

Déjà fait par la tranche stockage (fiche 0058), vérifié ici par les outils : chaque fiche est un résultat à elle seule (types `crm`, `crm-entreprise`, `crm-personne`, `crm-action`, `crm-projet`), cherchée par son texte utile et ses étiquettes ; son conteneur (le CRM) vient de son chemin ; son segment de sens garde le titre du CRM ; le filtre par étiquette la voit ; `[[titre]]` retrouve le CRM et ses fiches.

Ajouté :
- **Les outils disent le CRM de chaque fiche** : `search_notes`, `search_by_meaning` et `linking_notes` rendent, pour le CRM ou une fiche, `type` (le nom du type de contenu) et, pour une fiche, `crm` (le chemin de son CRM). Rien de plus pour une note (les résultats d'avant sont identiques). `search_notes` accepte `content_type` parmi les cinq types du CRM ; son message d'erreur et sa description les listent.
- **Les liens entrants d'une action** (`domain::crm::action_links`, utilisé par `NoteLinks::backlinks`) : une action désigne une note par ses notes liées (`notes`), les `[[titre]]` de sa description et ceux de ses commentaires, comme le dit la spécification. Ses références à une personne, une entreprise ou un projet (`[[nom-de-fichier]]`, dans l'en-tête) n'en sont pas : sans cette règle, une note qui porte le même titre qu'une entreprise (« Acme ») aurait montré toutes les actions de cette entreprise comme liens entrants. Une action illisible se lit comme une note.
- **Pour l'écran** : `LinkingNoteItem` porte en plus `contentType` et `crm`, tous deux facultatifs (absents pour une note : le type TypeScript généré reste compatible avec le code existant), de quoi montrer « Action · titre » et ouvrir l'action dans son CRM. L'affichage et le clic restent à l'interface.

## Points tranchés là où la spécification ne dit rien

- La consigne ajoute « ne renommez jamais le fichier d'une fiche » : la spécification (§ 4.1) dit que renommer une fiche change son titre, jamais son nom de fichier, parce que les autres fiches la désignent par ce nom ; l'outil `rename_note` de Claude changerait ce nom.
- Pour une action, les liens de ses listes à cocher ne comptent pas comme liens entrants : la spécification ne cite que les notes liées, la description et les commentaires.
- Pour une entreprise, une personne, un projet et le CRM, les liens entrants se lisent comme pour une note (tout le texte du fichier) : la spécification ne dit rien d'autre.
- Les outils nomment les types comme la propriété `type:` du fichier (`crm-action`), pas comme les types générés de l'interface (`crmAction`).
