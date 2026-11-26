//! Ce que l'IA lit des outils du CRM (fiche 0081) : leurs descriptions, dans les mots de
//! l'application (action, personne, entreprise, projet, étape, statut, colonne), et l'entrée
//! qu'ils attendent.

use domain::app_tools::AppTool;
use domain::mind_map::PALETTE;
use serde_json::{Value, json};

use super::{Described, input, text};

fn crm_path() -> Value {
    text("Chemin du CRM depuis l'espace de travail : `dossier/clients.md` (une note `type: crm`).")
}

fn texts(description: &str) -> Value {
    json!({ "type": "array", "items": { "type": "string" }, "description": description })
}

pub(super) fn read_crm() -> Described {
    (
        "Lit un CRM comme des données, sans les fichiers de ses fiches : ce que montre l'écran. \
         Rend `path`, `title`, `today` (le jour du Mac), `stages` (les étapes, entre `TODO` et \
         `Done`), `tags` (les étiquettes des actions), `columns` (une par statut, dans l'ordre : \
         `TODO`, les étapes, `Done`, `Cancel`), `people`, `companies`, `projects`, `nodata` (NODATA : les \
         personnes sans entreprise), `unreadable` (fiches illisibles laissées de côté), \
         `truncated`. Chaque colonne : `status` (le nom à donner à `move_crm_action`), `closed`, \
         `count` et `late` (les cartes de la colonne et celles en retard, filtres ou non) et \
         `actions` (les cartes visibles, dans l'ordre de la colonne). Chaque action : `ref` (sa \
         référence, pour les autres outils), `fiche` (le chemin de sa note, pour `add_tags` et \
         `remove_tags`), `title`, `status`, `date`, `late_days` (en retard de tant de jours) ou \
         `due_today`, `people` (chacune avec `ref` et `company`, l'entreprise du moment où on l'a \
         donnée), `project` (référence), `channel`, `color` (nom de la palette), `tags`, \
         `linked_notes` (titres de notes), `description`, `checklists` (`index`, `name`, `items` \
         avec `index`, `done`, `text`) et `comments` (`index`, `at`, `text`, dans l'ordre écrit) ; \
         ce qui est vide manque. Chaque personne : `ref`, `fiche`, `name`, `role`, `company` \
         (référence ; rien pour NODATA), `career` (`company`, `from`, `to`), `email`, `phone`, \
         `linkedin`, `notes`, `tally` (`open`, `late`, `today`). Chaque entreprise : `ref`, \
         `fiche`, `name`, `site`, `sector`, `address`, `phone`, `notes`, `people`, `tally`. \
         Chaque projet : `ref`, `fiche`, `name`, `color`, `tags`, `tally`. Les filtres de \
         l'écran sont facultatifs et s'ajoutent : une action n'est rendue que si elle répond à \
         tous. Borné : 34 000 caractères pour les actions, 16 000 pour les personnes, 10 000 \
         pour les entreprises, 6 000 pour les projets ; au-delà, `truncated` vaut true et `message` dit ce \
         qui manque et comment avancer (jamais de coupure silencieuse). Les CRM d'un espace se \
         listent avec `search_notes` (`content_type` : `crm`). Refusé si la note n'est pas un CRM.",
        input(
            json!({
                "path": crm_path(),
                "search": text("Un mot cherché dans le titre, la description et les commentaires des actions."),
                "person": text("La référence d'une personne : seules ses actions."),
                "company": text(
                    "La référence d'une entreprise, ou `NODATA` pour les personnes sans entreprise : seules les actions d'une de ses personnes (au moment où elles ont été données)."
                ),
                "projects": texts("Les références de projets : seules leurs actions (une action sans projet est alors masquée)."),
                "tags": texts("Des étiquettes : les actions qui portent au moins l'une d'elles."),
            }),
            &["path"],
        ),
    )
}

fn reference(what: &str) -> Value {
    text(&format!(
        "La référence {what}, le `ref` que `read_crm` donne (le nom de son fichier sans extension)."
    ))
}

fn operation(operations: &str) -> Value {
    text(&format!(
        "Le geste de l'interface à faire, un seul par appel : {operations}."
    ))
}

fn integer(description: &str) -> Value {
    json!({ "type": "integer", "description": description })
}

fn color() -> Value {
    text(&format!(
        "Une couleur de la palette de l'application : {}. Aucune autre couleur (pas d'hexadécimal).",
        PALETTE.join(", ")
    ))
}

pub(super) fn create_crm_action() -> Described {
    (
        "Crée une action dans un CRM, comme la fenêtre d'une action de MALOREAN Notes : \
         `title` seul suffit (une ligne, non vide) ; la date est aujourd'hui et le statut `TODO` \
         sans `status`. Mêmes refus que l'interface, dits en français : titre vide ou sur \
         plusieurs lignes, `status` qui n'est pas une colonne du CRM (`read_crm` donne les \
         colonnes), personne ou projet qui n'existe pas (`Cette fiche n'existe plus.`), couleur \
         hors palette, canal inconnu, jour invalide. Chaque personne donnée entre avec son \
         entreprise de ce moment. Rend `path`, `ref` (la référence de l'action) et `fiche` (le \
         chemin de sa note, pour `add_tags`). Les étiquettes s'ajoutent aussi plus tard avec \
         `add_tags` et `remove_tags` sur `fiche`.",
        input(
            json!({
                "path": crm_path(),
                "title": text("Le titre de l'action, sur une ligne."),
                "status": text("Le nom d'une colonne du CRM (`TODO`, une étape, `Done`, `Cancel`) ; `TODO` si absent."),
                "date": text("Le jour où l'action est à faire, ou a été faite : `2026-11-24` ; aujourd'hui si absent."),
                "people": texts("Les références des personnes de l'action."),
                "channel": text("Le canal : appel, e-mail, rendez-vous, courrier, salon, réseau social ou autre."),
                "project": reference("du projet de l'action"),
                "color": color(),
                "tags": texts("Les étiquettes de l'action, sans `#`."),
                "linked_notes": texts("Les titres des notes liées à l'action."),
                "description": text("La description, en Markdown."),
            }),
            &["path", "title"],
        ),
    )
}

pub(super) fn change_crm_action() -> Described {
    (
        "Change une action d'un CRM par un geste de la fenêtre d'une action, avec les règles et \
         les messages de l'interface ; un seul geste par appel, désigné par `operation`. Champs : \
         `title` (`title`), `date` (`date`, `2026-11-24`), `channel` (`channel` ; vide pour le \
         retirer), `project` (`project`, une référence ; vide pour « Sans projet »), `color` \
         (`color` ; vide pour la retirer), `linked_notes` (`linked_notes`, la liste entière des \
         titres de notes), `add_person` et `remove_person` (`person`, une référence). Texte : \
         `description` (`text` remplace la description), `add_checklist` (`name`), \
         `rename_checklist` (`list`, `name`), `remove_checklist` (`list`), `add_item` (`list`, \
         `text`), `edit_item` (`list`, `item`, `text`), `check_item` (`list`, `item`, `done`), \
         `remove_item` (`list`, `item`), `add_comment` (`text`, daté de maintenant : pour un \
         compte rendu, ajoutez un commentaire plutôt que de réécrire la description), \
         `edit_comment` (`comment`, `text`), `remove_comment` (`comment`). Une liste, un élément \
         et un commentaire se désignent par leur `index` (à partir de 0) tel que `read_crm` le \
         donne. Le statut se change avec `move_crm_action`, les étiquettes avec `add_tags` et \
         `remove_tags`. Refusé, sans rien changer : action introuvable (`Cette fiche n'existe \
         plus.`), titre vide, jour invalide, couleur ou canal inconnu, personne ou projet \
         introuvable, liste, élément ou commentaire qui n'existe pas. Rend `path` et `action` \
         (l'action comme `read_crm` la donne ensuite). Le texte d'avant est gardé dans \
         l'historique des versions de la fiche.",
        input(
            json!({
                "path": crm_path(),
                "action": reference("de l'action"),
                "operation": operation(
                    "`title`, `date`, `channel`, `project`, `color`, `linked_notes`, `add_person`, \
                     `remove_person`, `description`, `add_checklist`, `rename_checklist`, \
                     `remove_checklist`, `add_item`, `edit_item`, `check_item`, `remove_item`, \
                     `add_comment`, `edit_comment`, `remove_comment`"
                ),
                "title": text("Le nouveau titre (`title`)."),
                "date": text("Le nouveau jour, `2026-11-24` (`date`)."),
                "channel": text("Le canal (`channel`) ; vide pour le retirer."),
                "project": text("La référence du projet (`project`) ; vide pour « Sans projet »."),
                "color": text("Le nom d'une couleur de la palette (`color`) ; vide pour la retirer."),
                "linked_notes": texts("La liste entière des titres de notes liées (`linked_notes`)."),
                "person": reference("de la personne (`add_person`, `remove_person`)"),
                "text": text("Le texte : description, élément ou commentaire."),
                "name": text("Le nom de la liste à cocher."),
                "list": integer("L'`index` de la liste à cocher (à partir de 0)."),
                "item": integer("L'`index` de l'élément dans sa liste (à partir de 0)."),
                "done": json!({ "type": "boolean", "description": "`true` pour cocher l'élément, `false` pour le décocher (`check_item`)." }),
                "comment": integer("L'`index` du commentaire (à partir de 0, dans l'ordre écrit)."),
            }),
            &["path", "action", "operation"],
        ),
    )
}

pub(super) fn move_crm_action() -> Described {
    (
        "Met une action dans une colonne du Kanban d'un CRM, comme glisser sa carte : son statut \
         devient `status` (le nom d'une colonne : `TODO`, une étape, `Done`, `Cancel`) et son rang \
         s'efface. Sans `before` ni `at_end`, la carte prend sa place par sa date ; avec `before` \
         (la référence d'une carte de la colonne), elle se place juste avant elle ; avec \
         `at_end`, tout en bas. Une colonne terminée (`Done`, `Cancel`) ne se range pas à la \
         main : la place demandée y est ignorée. Refusé : action introuvable (`Cette fiche \
         n'existe plus.`), `status` qui n'est pas une colonne de ce CRM, `before` avec `at_end`. \
         Rend `path` et `action` (l'action comme `read_crm` la donne ensuite).",
        input(
            json!({
                "path": crm_path(),
                "action": reference("de l'action"),
                "status": text("Le nom de la colonne d'arrivée (majuscules et accents ignorés)."),
                "before": reference("de la carte devant laquelle placer l'action"),
                "at_end": json!({ "type": "boolean", "description": "`true` pour placer l'action tout en bas de la colonne." }),
            }),
            &["path", "action", "status"],
        ),
    )
}

pub(super) fn delete_crm_action() -> Described {
    (
        "Met une action d'un CRM à la corbeille de MALOREAN Notes, avec ses pièces jointes (jamais \
         effacée : l'utilisateur peut la restaurer comme une note). Ne supprimez rien sans que \
         l'utilisateur le demande. Refusé : action introuvable (`Cette fiche n'existe plus.`). \
         Rend `path` et `deleted` (la référence).",
        input(
            json!({ "path": crm_path(), "action": reference("de l'action") }),
            &["path", "action"],
        ),
    )
}

pub(super) fn create_crm_person() -> Described {
    (
        "Crée une personne dans un CRM, comme « Nouvelle personne » de l'interface : `name` est \
         son nom entier (prénom et nom), refusé s'il est vide, sur plusieurs lignes ou déjà celui \
         d'une autre personne du CRM (majuscules, accents et ponctuation ignorés). Avec \
         `company`, la personne entre dans cette entreprise le jour même et son parcours le dit ; \
         sans elle, elle est dans NODATA. Les autres champs se donnent ensuite avec \
         `change_crm_person`. Rend `path`, `ref` (la référence de la personne) et `fiche` (le \
         chemin de sa note, pour `add_tags`).",
        input(
            json!({
                "path": crm_path(),
                "name": text("Le nom entier de la personne."),
                "company": reference("de l'entreprise de la personne ; NODATA si absent"),
            }),
            &["path", "name"],
        ),
    )
}

pub(super) fn change_crm_person() -> Described {
    (
        "Change une personne d'un CRM par un geste de l'interface, avec ses règles et ses \
         messages ; un seul geste par appel, désigné par `operation` : `rename` (`name`, le nom \
         entier ; refusé s'il est vide ou déjà pris), `field` (`field` : `role`, `email`, `phone` \
         ou `linkedin`, et `value` ; vide, le champ est retiré), `notes` (`notes` remplace les \
         notes libres), `company` (« Changer d'entreprise » : `company`, la référence de la \
         nouvelle entreprise, vide pour NODATA ; `day` le jour du changement, `2026-11-24`, \
         aujourd'hui si absent ; l'ancien passage du parcours est fermé à ce jour). Un e-mail déjà \
         celui d'une autre personne n'est pas refusé : la réponse porte `warning`. Les étiquettes \
         se changent avec `add_tags` et `remove_tags`. Refusé, sans rien changer : personne ou \
         entreprise introuvable (`Cette fiche n'existe plus.`), nom refusé, champ inconnu, jour \
         invalide. Rend `path` et `person` (la personne comme `read_crm` la donne ensuite).",
        input(
            json!({
                "path": crm_path(),
                "person": reference("de la personne"),
                "operation": operation("`rename`, `field`, `notes`, `company`"),
                "name": text("Le nouveau nom entier (`rename`)."),
                "field": text("Le champ : `role`, `email`, `phone` ou `linkedin` (`field`)."),
                "value": text("La valeur du champ (`field`) ; vide pour le retirer."),
                "notes": text("Les notes libres, en Markdown (`notes`)."),
                "company": text("La référence de la nouvelle entreprise (`company`) ; vide pour NODATA."),
                "day": text("Le jour du changement d'entreprise, `2026-11-24` ; aujourd'hui si absent."),
            }),
            &["path", "person", "operation"],
        ),
    )
}

pub(super) fn delete_crm_person() -> Described {
    (
        "Met une personne d'un CRM à la corbeille de MALOREAN Notes (jamais effacée : l'utilisateur \
         peut la restaurer), et la retire de la liste des personnes de chacune de ses actions ; les \
         actions restent. Ne supprimez rien sans que l'utilisateur le demande. Refusé : personne \
         introuvable (`Cette fiche n'existe plus.`). Rend `path` et `deleted` (la référence).",
        input(
            json!({ "path": crm_path(), "person": reference("de la personne") }),
            &["path", "person"],
        ),
    )
}

pub(super) fn create_crm_company() -> Described {
    (
        "Crée une entreprise dans un CRM, comme « Nouvelle entreprise » de l'interface : `name` est \
         son nom, refusé s'il est vide, sur plusieurs lignes ou déjà celui d'une autre entreprise \
         du CRM (majuscules, accents et ponctuation ignorés). Les autres champs se donnent ensuite \
         avec `change_crm_company`. Rend `path`, `ref` (la référence de l'entreprise) et `fiche` \
         (le chemin de sa note, pour `add_tags`).",
        input(
            json!({ "path": crm_path(), "name": text("Le nom de l'entreprise.") }),
            &["path", "name"],
        ),
    )
}

pub(super) fn change_crm_company() -> Described {
    (
        "Change une entreprise d'un CRM par un geste de l'interface, avec ses règles et ses \
         messages ; un seul geste par appel, désigné par `operation` : `rename` (`name` ; refusé \
         s'il est vide ou déjà pris), `field` (`field` : `site`, `sector`, `address` ou `phone`, \
         et `value` ; vide, le champ est retiré), `notes` (`notes` remplace les notes libres). Les \
         étiquettes se changent avec `add_tags` et `remove_tags`. Refusé, sans rien changer : \
         entreprise introuvable (`Cette fiche n'existe plus.`), nom refusé, champ inconnu. Rend \
         `path` et `company` (l'entreprise comme `read_crm` la donne ensuite).",
        input(
            json!({
                "path": crm_path(),
                "company": reference("de l'entreprise"),
                "operation": operation("`rename`, `field`, `notes`"),
                "name": text("Le nouveau nom (`rename`)."),
                "field": text("Le champ : `site`, `sector`, `address` ou `phone` (`field`)."),
                "value": text("La valeur du champ (`field`) ; vide pour le retirer."),
                "notes": text("Les notes libres, en Markdown (`notes`)."),
            }),
            &["path", "company", "operation"],
        ),
    )
}

pub(super) fn delete_crm_company() -> Described {
    (
        "Met une entreprise d'un CRM à la corbeille de MALOREAN Notes (jamais effacée : \
         l'utilisateur peut la restaurer). Chacune de ses personnes passe à NODATA (son parcours \
         garde l'entreprise, fermée ce jour-là) ; les actions gardent l'entreprise du moment. Ne \
         supprimez rien sans que l'utilisateur le demande. Refusé : entreprise introuvable \
         (`Cette fiche n'existe plus.`). Rend `path` et `deleted` (la référence).",
        input(
            json!({ "path": crm_path(), "company": reference("de l'entreprise") }),
            &["path", "company"],
        ),
    )
}

pub(super) fn create_crm_project() -> Described {
    (
        "Crée un projet dans un CRM, comme « Nouveau projet » de l'interface : `name` est son nom, \
         refusé s'il est vide, sur plusieurs lignes ou déjà celui d'un autre projet du CRM \
         (majuscules, accents et ponctuation ignorés). Sa couleur est la moins utilisée du CRM, \
         comme dans l'interface ; `change_crm_project` la change. Rend `path`, `ref` (la \
         référence du projet) et `fiche` (le chemin de sa note, pour `add_tags`).",
        input(
            json!({ "path": crm_path(), "name": text("Le nom du projet.") }),
            &["path", "name"],
        ),
    )
}

pub(super) fn change_crm_project() -> Described {
    (
        "Change un projet d'un CRM par un geste de l'interface, avec ses règles et ses messages ; \
         un seul geste par appel, désigné par `operation` : `rename` (`name` ; refusé s'il est \
         vide ou déjà pris ; ses actions le suivent sans rien changer) ou `color` (`color`, une \
         couleur de la palette). Les étiquettes se changent avec `add_tags` et `remove_tags`. \
         Refusé, sans rien changer : projet introuvable (`Cette fiche n'existe plus.`), nom \
         refusé, couleur hors palette. Rend `path` et `project` (le projet comme `read_crm` le \
         donne ensuite).",
        input(
            json!({
                "path": crm_path(),
                "project": reference("du projet"),
                "operation": operation("`rename`, `color`"),
                "name": text("Le nouveau nom (`rename`)."),
                "color": color(),
            }),
            &["path", "project", "operation"],
        ),
    )
}

pub(super) fn delete_crm_project() -> Described {
    (
        "Met un projet d'un CRM à la corbeille de MALOREAN Notes (jamais effacé : l'utilisateur \
         peut le restaurer) ; ses actions passent à « Sans projet », jamais supprimées. Ne \
         supprimez rien sans que l'utilisateur le demande. Refusé : projet introuvable (`Cette \
         fiche n'existe plus.`). Rend `path` et `deleted` (la référence).",
        input(
            json!({ "path": crm_path(), "project": reference("du projet") }),
            &["path", "project"],
        ),
    )
}

pub(super) fn change_crm_stages() -> Described {
    (
        "Change les étapes d'un CRM, les colonnes du Kanban entre `TODO` et `Done` ; un seul geste \
         par appel, désigné par `operation` : `add` (`name` : une nouvelle étape, avant `Done`), \
         `rename` (`from` le nom actuel, `to` le nouveau ; les actions de l'étape la suivent et \
         gardent leur rang), `remove` (`name` ; ses actions repartent en `TODO`, leur rang \
         s'efface), `move` (`name` et `index`, la place à partir de 0 parmi les étapes). Le changement \
         touche plusieurs fichiers : tous ensemble, ou aucun. Un nom d'étape tient sur une ligne, \
         fait 40 caractères au plus, n'est ni `TODO`, `Done` ou `Cancel` ni celui d'une autre \
         étape (majuscules et accents ignorés). Refusé, sans rien changer, avec le message de \
         l'interface : nom refusé, étape inconnue. Rend `path` et `stages` (les étapes).",
        input(
            json!({
                "path": crm_path(),
                "operation": operation("`add`, `rename`, `remove`, `move`"),
                "name": text("Le nom de l'étape (`add`, `remove`, `move`)."),
                "from": text("Le nom actuel de l'étape (`rename`)."),
                "to": text("Le nouveau nom de l'étape (`rename`)."),
                "index": integer("La place de l'étape parmi les étapes, à partir de 0 (`move`)."),
            }),
            &["path", "operation"],
        ),
    )
}

/// Ce que fait l'un des quinze outils du CRM, et l'entrée qu'il attend ; à part de la liste des
/// autres outils pour que chaque fonction reste courte.
pub(super) fn described(tool: AppTool) -> Described {
    match tool {
        AppTool::ReadCrm => read_crm(),
        AppTool::CreateCrmAction => create_crm_action(),
        AppTool::ChangeCrmAction => change_crm_action(),
        AppTool::MoveCrmAction => move_crm_action(),
        AppTool::DeleteCrmAction => delete_crm_action(),
        AppTool::CreateCrmPerson => create_crm_person(),
        AppTool::ChangeCrmPerson => change_crm_person(),
        AppTool::DeleteCrmPerson => delete_crm_person(),
        AppTool::CreateCrmCompany => create_crm_company(),
        AppTool::ChangeCrmCompany => change_crm_company(),
        AppTool::DeleteCrmCompany => delete_crm_company(),
        AppTool::CreateCrmProject => create_crm_project(),
        AppTool::ChangeCrmProject => change_crm_project(),
        AppTool::DeleteCrmProject => delete_crm_project(),
        AppTool::ChangeCrmStages => change_crm_stages(),
        _ => unreachable!("un outil qui n'est pas du CRM est décrit par le catalogue"),
    }
}
