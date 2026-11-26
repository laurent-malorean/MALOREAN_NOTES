# 0075 — Modifier le texte d'une note par le MCP : l'outil `replace_in_note`, un texte remplacé par un autre, refusé s'il est répété

- **Date** : 2026-11-26
- **Statut** : acceptée (spécification : `doc/specs/brancher-une-ia.md`)
- **Remplace** le point « Partage » de la fiche 0040 (changer le texte d'une note reste aux outils de fichiers de l'IA).
- **Complète** la fiche 0074 (le paramètre `workspace` s'applique au nouvel outil comme aux autres).

## Contexte

La fiche 0040 (validée le 19/11) laissait le texte d'une note aux outils de fichiers de l'IA : « remplacer un passage par un autre couvre tous les cas ». Or une IA branchée (Codex, extension Claude de VS Code, Claude Code hors de l'application) ne travaille pas forcément dans le dossier de l'espace de travail, désigné par son nom et jamais par un chemin (fiche 0074) : elle n'a alors aucun moyen de modifier une note existante. L'utilisateur demande que tout ce qu'on fait dans l'application puisse se faire par le MCP. Passer par l'application donne aussi à l'IA les règles de la saisie (historique des versions, index, nom du fichier suivant le titre).

## Décision

- **Un outil, `replace_in_note`** (`AppTool::ReplaceInNote`), pour les IA branchées et pour la colonne Claude Code (même registre d'outils, un seul endroit de vérité). Entrées : `path` (la note), `old_text` (le texte à remplacer, exact), `new_text` (le nouveau texte, vide pour supprimer), `replace_all` (facultatif, faux par défaut), et le paramètre facultatif `workspace` de la fiche 0074.
- **Remplacement exact, jamais un motif** : `old_text` se recopie à l'identique (majuscules, accents, espaces, retours à la ligne) et se cherche dans tout le fichier, en-tête compris. Insérer revient à remplacer une ligne par elle-même suivie du nouveau texte ; supprimer, à remplacer par un texte vide.
- **Refus par défaut d'un texte répété** (sécurité : l'IA ne doit pas changer dix endroits quand elle en vise un). L'erreur dit combien de fois le texte apparaît et sur quelles lignes (cinq au plus, puis « et d'autres »), et propose deux issues : ajouter du texte autour pour qu'il n'apparaisse qu'une fois, ou passer `replace_all` à vrai pour remplacer toutes les occurrences. Avec `replace_all`, le résultat dit combien de remplacements ont eu lieu. Les occurrences ne se chevauchent pas (`aaa`, `aa` : une seule).
- **Autres refus, dits à l'IA en français, rien n'étant alors changé** : texte à remplacer introuvable (avec le rappel qu'il doit être recopié à l'identique), vide, ou identique au nouveau texte.
- **Seules les notes simples** (type de contenu `note`). Refusés : le **cahier de recherche** (« on n'y ajoute que des entrées (add_entry), son texte ne se remplace jamais » : il n'a pas d'équivalent « en lecture seule » ailleurs, c'est la règle de la fiche 0041), la carte mentale, le canvas, le CRM et ses fiches, qui ont des règles d'écriture propres (propriété `racines`, JSON du canvas, `rang` d'une action…) ; leurs outils viennent aux tâches suivantes de la liste « MCP » et lèveront ce refus type par type. Il n'existe pas d'autre état « lecture seule » d'une note de texte : l'option « lecture seule » du canvas est un réglage de l'écran.
- **Mêmes règles que la saisie** (le cas d'usage `ReplaceInNote` passe par `KeepVersion`, puis écrit la note (par `SaveNote` quand le titre change), comme le renommage et la restauration) :
  - le texte de la note d'avant est gardé en **version** avant l'écriture (s'il diffère de la dernière version) ; la note attend en plus la version de l'état écrit, comme après une saisie ;
  - l'**index** de mots est mis à jour par le stockage ; le **sens** est recalculé par le travailleur de sens quand l'espace est ouvert (fiche 0074) ;
  - l'**en-tête** est conservé tel quel quand le texte remplacé ne le touche pas ;
  - si le remplacement change le titre `#`, le **nom du fichier suit le titre** ; sinon le fichier garde son nom, même s'il ne correspond pas au titre (le chemin que l'IA vient d'employer reste valable), le dossier des pièces jointes est renommé et les liens vers les pièces jointes sont suivis, comme à l'enregistrement : le chemin rendu à l'IA peut donc changer, c'est celui à utiliser ensuite ;
  - les liens `[[titre]]` des autres notes ne sont pas réécrits (règle du renommage, fiche 0016) ; une IA qui change un titre passe par `rename_note`, qui les rend.
- **Ce que rend l'outil** : `path` (peut avoir changé avec le titre), `title` et `replacements` (le nombre de remplacements).
- **L'écran** : aucun mécanisme neuf. Le fichier écrit est vu par la surveillance du dossier, qui prévient l'interface (`workspace-changed`) ; la colonne qui montre la note la relit (ou garde le texte tapé dans une copie de conflit, fiche 0014), comme pour toute modification extérieure et pour les autres outils qui écrivent. Un espace visé en arrière-plan n'est pas à l'écran : rien à rafraîchir.
- **Le garde-fou du web** retient l'outil comme ceux qui créent ou changent une note (`changes_notes`). La colonne le nomme « Modification du texte ».
- **Instructions et descriptions** : la présentation du serveur ne dit plus « utilisez vos propres outils de fichiers » pour changer le texte d'une note simple ; elle renvoie à `replace_in_note`. Les consignes des cartes mentales et des CRM gardent les outils de fichiers (tâches suivantes). Les descriptions des outils sont écrites en français comme celles des autres outils.

## Conséquences

- Une IA branchée peut lire un texte (elle a la recherche et les extraits ; le texte entier d'une note se lit avec `read_note`, fiche 0076) et le changer sans connaître le dossier de l'espace de travail.
- Le serveur MCP garde son nom (`malorean`) ; renommé `malorean_notes` le 26/11/2026 (fiche 0082).
- Tests : la règle de remplacement (exact, supprimer, insérer, introuvable, vide, identique, répété avec lignes, `replace_all`, chevauchement, types refusés, messages) ; le cas d'usage (version gardée, index, renommage par le titre et liens des pièces jointes, en-tête conservé, refus du cahier) ; l'outil par son protocole sur des faux, pour la colonne et pour une IA branchée avec le paramètre `workspace` (espace ouvert en arrière-plan, espace non autorisé) ; sa description et son schéma ; la liste des outils qui changent une note ; les options de Claude Code (`--allowed-tools`, garde-fou) ; le nom de l'action dans la colonne.
