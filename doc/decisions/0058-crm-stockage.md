# 0058 — CRM : stockage, geste en plusieurs fichiers, index et commandes

- **Date** : 2026-11-25
- **Statut** : acceptée
- **Complète** la fiche 0057 (les règles pures du CRM), la fiche 0034 (types de contenu), la fiche 0028 (index) et la fiche 0044 (segments de sens).

## Contexte

Spécification : `doc/specs/crm.md` (§§ 4, 5, 6, 10, 11, 12). La tranche précédente a livré le domaine ; celle-ci le branche sur le disque, l'index et les commandes. Pas d'interface ni d'outils pour Claude dans cette tranche.

## Décision

- **L'index range le CRM et ses fiches par cinq types de contenu** (`ContentType::Crm`, `CrmCompany`, `CrmPerson`, `CrmAction`, `CrmProject`), nommés comme leur propriété `type:`. Choisi plutôt que de laisser `CrmKind` hors de `ContentType` : une fiche est une note à part entière, l'index n'a ainsi aucun cas particulier (liste, recherche, étiquettes, corbeille). Le conteneur d'une fiche (son CRM) se tire de son chemin : `clients/personnes/jean.md` a pour conteneur `clients.md`. L'index est reconstruit (`FORMAT_VERSION` 9).
- **La recherche par les mots lit le texte utile de chaque fiche** (spécification § 12), jamais ses propriétés techniques ; une seule fonction (`NoteSummary::searched_text`) remplace les trois endroits qui décidaient de ce que l'index lit d'une note (index en mémoire, index SQLite, extrait d'un résultat).
- **La recherche par le sens donne à chaque fiche un segment** (titre sous celui de son CRM, puis texte utile, coupé comme celui d'une note s'il est trop long). Le titre du CRM est lu dans l'index de mots au moment où la fiche est rangée ; si le CRM change de titre ensuite, les segments de ses fiches ne le suivent qu'à leur prochain rangement (ou à « Reconstruire l'index »).
- **Un geste est une suite de pas** (`Gesture` : réécrire une note qui existe, mettre une note à la corbeille). Un geste d'un seul pas s'écrit directement. Un geste de plusieurs fichiers est gardé avant d'être appliqué (port `PendingGestures`, dossier caché `.pending-gestures/` de l'espace de travail, un fichier JSON par geste écrit par fichier temporaire puis renommage), appliqué pas à pas, puis oublié. Un pas sur une note qui n'existe plus est sans effet : un geste ne recrée jamais une fiche supprimée.
- **Un geste interrompu est terminé** à l'ouverture de l'espace de travail (`RecoverGestures`) et avant chaque geste suivant : le geste raté (disque plein) est donc retenté au geste d'après, sans que l'interface s'en occupe. Un fichier de geste illisible est retiré (journalisé) pour ne pas bloquer tous les gestes.
- **Chaque geste relit le fichier sur le disque** avant de le changer : seul le champ touché change, sur la version la plus récente. Les gestes sur le texte d'une action sont fins (`BodyChange` : ajouter un commentaire, cocher un élément…) pour qu'une liste ou un commentaire ajouté ailleurs ne soit pas écrasé par une description envoyée de l'écran. Une liste, un élément ou un commentaire se désigne par sa place dans l'ordre écrit.
- **Le dossier d'une sorte de fiche naît avec sa première fiche** (`CrmKind::folder`), le dossier du CRM avec lui.
- **La lecture rend une vue complète** (`CrmView`) : fiches, colonnes du Kanban (nombres de toutes les cartes, cartes filtrées), Ma semaine (filtrée), compteurs, étiquettes. L'interface ne recalcule rien.
- **Les commandes de l'API sont fines** : une commande, un cas d'usage ; les requêtes sont converties en types de l'application à la frontière (références, jours, couleurs, canaux).

## Points tranchés là où la spécification ne dit rien

- Le statut d'un geste doit être une colonne du CRM (sinon « n'est pas une colonne de ce CRM ») ; seule la lecture range un statut inconnu dans « TODO ».
- Une fiche dont le fichier n'a plus son `type:` est traitée comme une fiche disparue par un geste.
- Les compteurs d'une entreprise comptent les actions dont une des entreprises d'alors est elle (une action ne compte qu'une fois) ; NODATA compte celles d'entreprise absente et celles sans personne.
- Le Kanban garde toutes les cartes d'une colonne terminée ; l'interface en montre 10 (`closed_page`) puis 10 de plus à chaque clic.
- Pas de verrou entre deux gestes simultanés sur le même fichier : une seule personne utilise l'application, les commandes sont appelées l'une après l'autre.

## Commandes de l'API (pour la vue Kanban)

`create_crm(folder, title)`, `read_crm(path, filters, weekDay)` (rend `CrmItem` : fiches, `columns`, `week`, compteurs, `tags`, `closedPage`), `crm_email_is_known(crm, email, except)`, `create_crm_action(crm, draft)`, `change_crm_action(crm, action, change)`, `move_crm_action(crm, action, status, placement)`, `delete_crm_action(crm, action)`, `create_crm_person(crm, name, company)`, `change_crm_person`, `delete_crm_person`, `create_crm_company`, `change_crm_company`, `delete_crm_company`, `create_crm_project`, `change_crm_project`, `delete_crm_project`, `change_crm_stages(crm, change)`. Les gestes sont des unions étiquetées par `kind` (types générés dans `ui/src/bridge/generated/`). Le pont `ui/src/bridge/index.ts` n'est pas encore branché : c'est le travail de la tranche de la vue.

## Conséquences

- La tranche suivante (vue Kanban) appelle les commandes `create_crm`, `read_crm`, `change_crm_action`, `move_crm_action`… et affiche `CrmItem`.
- `doc/architecture.md` et `doc/ontology.md` portent les mots nouveaux (geste, gestes en attente, vue du CRM, fiche disparue, types de contenu du CRM).
