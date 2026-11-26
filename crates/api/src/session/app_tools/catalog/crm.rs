//! Ce que l'IA lit des outils du CRM (fiche 0081) : leurs descriptions, dans les mots de
//! l'application (action, personne, entreprise, projet, étape, statut, colonne), et l'entrée
//! qu'ils attendent.

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
