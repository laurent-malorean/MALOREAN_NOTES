//! Ce que l'IA lit des outils de l'agenda 12 (fiche 0104) : leurs descriptions, dans les mots de
//! l'application (agenda 12, événement, case, clore, archives), et l'entrée qu'ils attendent.

use domain::app_tools::AppTool;
use serde_json::{Value, json};

use super::{Described, input, text};

fn agenda_path() -> Value {
    text(
        "Chemin de l'agenda 12 depuis l'espace de travail : `dossier/salons.md` (une note \
         `type: agenda-12`).",
    )
}

fn integer(description: &str) -> Value {
    json!({ "type": "integer", "description": description })
}

/// Ce que fait l'un des trois outils de l'agenda 12, et l'entrée qu'il attend ; le dernier à qui le
/// catalogue demande, après ceux du CRM.
pub(super) fn described(tool: AppTool) -> Described {
    match tool {
        AppTool::ReadAgenda12 => read_agenda_12(),
        AppTool::AddAgenda12Event => add_agenda_12_event(),
        AppTool::CloseAgenda12Event => close_agenda_12_event(),
        _ => unreachable!(
            "un outil qui n'est ni du CRM ni de l'agenda 12 est décrit par le catalogue"
        ),
    }
}

fn read_agenda_12() -> Described {
    (
        "Lit un agenda 12 comme des données : la grille de 12 mois de janvier à décembre, ce que \
         montre l'écran. Rend `path`, `title`, `columns` (3, 4 ou 6), `tags` (les étiquettes des \
         événements de la grille), `cells` (les 12 cases dans l'ordre, chacune avec `month` de 1 à \
         12, `name` et `events`, dans l'ordre de la case : année croissante, puis jour, puis titre ; \
         les événements sans année viennent en dernier), `unreadable` (événements illisibles, \
         laissés de côté). Chaque événement : `path` (sa note, pour `read_note`, \
         `replace_in_note`, `add_tags`, `remove_tags`, `close_agenda_12_event`), `title`, `month`, \
         `day`, `year`, `end_day`, `end_month` (la fin d'un événement sur plusieurs jours), \
         `country` (code ISO 3166-1), `country_name`, `city`, `tags`, `line` (la ligne de l'écran : \
         `10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World`) et, pour un événement clos, \
         `closed_on` ; ce qui est vide manque. Le texte d'un événement n'y est pas : lisez-le avec \
         `read_note`. `tag` ne garde que les événements qui portent cette étiquette ; \
         `include_archives` ajoute `archives`, les événements clos, du plus récemment clos au plus \
         ancien. Borné à 60 000 caractères ; au-delà, `truncated` vaut true et `message` dit ce qui \
         manque (jamais de coupure silencieuse). Refusé si la note n'est pas un agenda 12.",
        input(
            json!({
                "path": agenda_path(),
                "tag": text("Une étiquette : seuls les événements de la grille qui la portent."),
                "include_archives": json!({
                    "type": "boolean",
                    "description": "Ajouter les événements clos (`archives`). Faux par défaut.",
                }),
            }),
            &["path"],
        ),
    )
}

fn add_agenda_12_event() -> Described {
    (
        "Crée un événement dans un agenda 12 : une note rangée dans son dossier des événements, \
         nommée d'après son titre, dans la case de son mois. Un événement a un titre et un mois \
         (`month`, de 1 pour janvier à 12 pour décembre) ; le jour (`day`), l'année (`year`), la fin \
         (`end_day`, avec `end_month` si elle tombe un autre mois que le début ; une fin exige un \
         jour de début), le pays (`country`, code ISO 3166-1 sur deux lettres : `FR`, `DE`), la \
         ville (`city`) et les étiquettes (`tags`) sont facultatifs. Mêmes refus qu'à l'écran : \
         titre vide, jour qui n'existe pas dans le mois (31 février, 29 février d'une année non \
         bissextile), fin avant le début ou sans jour de début, pays inconnu. Le texte de \
         l'événement s'écrit ensuite avec `replace_in_note`. Rend `path` (la note de l'événement), \
         `agenda` et `event` (tous ses champs, comme `read_agenda_12`).",
        input(
            json!({
                "path": agenda_path(),
                "title": text("Le titre de l'événement."),
                "month": integer("Le mois de début, de 1 (janvier) à 12 (décembre) : sa case."),
                "day": integer("Le jour de début."),
                "year": integer("L'année de début."),
                "end_day": integer("Le jour de fin d'un événement sur plusieurs jours."),
                "end_month": integer("Le mois de fin, de 1 à 12, s'il diffère du mois de début."),
                "country": text("Le code du pays : `FR`, `DE`, `US`."),
                "city": text("La ville."),
                "tags": json!({
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Les étiquettes, sans `#`.",
                }),
            }),
            &["path", "title", "month"],
        ),
    )
}

fn close_agenda_12_event() -> Described {
    (
        "Clôt un événement d'un agenda 12, comme le bouton « Clore » : il sort de la grille et \
         passe dans les archives de son agenda 12 (le sous-dossier `archives/` de son dossier des \
         événements), en retenant le jour de sa clôture ; il garde tous ses champs et son texte. \
         Avec `prepare_next` à true (« Clore et préparer le suivant »), une copie reprend son titre, \
         son mois, son pays, sa ville et ses étiquettes, sans jour, sans année, sans fin et sans \
         texte, et apparaît dans la grille : à faire quand l'événement revient chaque année. Ne \
         clôturez rien sans que l'utilisateur le demande. Refusé si l'événement est déjà clos. \
         Rend `closed` (le nouveau chemin de la note, dans les archives) et `successor` (le \
         chemin de la copie, ou null).",
        input(
            json!({
                "path": text(
                    "Chemin de la note de l'événement : `dossier/salons/salon-embedded-world.md` \
                     (`path` d'un événement de `read_agenda_12`)."
                ),
                "prepare_next": json!({
                    "type": "boolean",
                    "description": "Créer la copie qui prépare le suivant. Faux par défaut.",
                }),
            }),
            &["path"],
        ),
    )
}
