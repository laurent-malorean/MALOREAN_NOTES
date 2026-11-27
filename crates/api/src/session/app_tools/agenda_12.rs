//! Les outils de l'agenda 12 (fiche 0104) : lire sa grille, y ajouter un événement, en clore un. Ils
//! appellent les mêmes méthodes de session que les commandes de l'interface : mêmes cas d'usage,
//! mêmes règles, mêmes messages. Le texte d'un événement se lit et s'écrit avec les outils des
//! notes (`read_note`, `replace_in_note`).

use application::use_cases::EventDraft;
use domain::agenda_12::EventEnd;
use serde::Serialize;
use serde_json::{Value, json};

use super::{optional, required, written};
use crate::dto::{agenda_12_country, agenda_12_month};
use crate::session::Session;
use crate::{Agenda12ClosingItem, Agenda12EventItem, Agenda12Item, ApiError};

/// Combien de caractères au plus rend `read_agenda_12` : de quoi tenir sous la limite d'un résultat
/// d'outil de Claude Code ; au-delà, la réponse dit ce qui manque.
pub(super) const MAX_READ_AGENDA_12_CHARACTERS: usize = 60_000;

/// Ce qu'un échec dit à Claude : le message de l'application.
fn said(error: impl Into<ApiError>) -> String {
    error.into().message
}

/// Un événement, tel que l'IA le lit : ce qui est vide manque.
#[derive(Debug, Serialize)]
struct EventRead {
    path: String,
    title: String,
    month: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    day: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    year: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end_day: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    end_month: Option<u32>,
    /// Le code ISO 3166-1 du pays.
    #[serde(skip_serializing_if = "Option::is_none")]
    country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    country_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    city: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
    /// Le jour de la clôture, pour un événement clos.
    #[serde(skip_serializing_if = "Option::is_none")]
    closed_on: Option<String>,
    /// La ligne que montre l'écran.
    line: String,
}

impl From<Agenda12EventItem> for EventRead {
    fn from(event: Agenda12EventItem) -> Self {
        Self {
            path: event.path,
            title: event.title,
            month: event.month,
            day: event.day,
            year: event.year,
            end_day: event.end.map(|end| end.day),
            end_month: event.end.map(|end| end.month),
            country: event.country.as_ref().map(|country| country.code.clone()),
            country_name: event.country.map(|country| country.name),
            city: event.city,
            tags: event.tags,
            closed_on: event.closed_on,
            line: event.line.text,
        }
    }
}

/// Une case, telle que l'IA la lit.
#[derive(Debug, Serialize)]
struct CellRead {
    month: u32,
    name: String,
    events: Vec<EventRead>,
}

/// Un agenda 12, tel que l'IA le lit.
#[derive(Debug, Serialize)]
struct AgendaRead {
    path: String,
    title: String,
    columns: u32,
    tags: Vec<String>,
    cells: Vec<CellRead>,
    #[serde(skip_serializing_if = "Option::is_none")]
    archives: Option<Vec<EventRead>>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    unreadable: Vec<String>,
    /// La réponse est coupée : des événements ne sont pas dedans.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

/// Ce qui reste de la place qu'une réponse peut prendre, et combien d'événements n'y sont pas
/// entrés.
struct Room {
    left: usize,
    omitted: usize,
}

impl Room {
    /// L'événement tient-il ? Il prend sa place, sinon il est compté comme laissé de côté. Dès
    /// qu'un événement ne tient pas, aucun autre n'entre : la coupure est franche, dans l'ordre de
    /// la grille.
    fn take(&mut self, event: &EventRead) -> bool {
        let size = serde_json::to_string(event).map_or(usize::MAX, |text| text.chars().count());
        if self.omitted == 0 && size <= self.left {
            self.left -= size;
            true
        } else {
            self.omitted += 1;
            false
        }
    }
}

impl AgendaRead {
    fn of(path: &str, agenda: Agenda12Item, with_archives: bool) -> Self {
        let mut room = Room {
            left: MAX_READ_AGENDA_12_CHARACTERS,
            omitted: 0,
        };
        let mut keep = |events: Vec<Agenda12EventItem>| -> Vec<EventRead> {
            events
                .into_iter()
                .map(EventRead::from)
                .filter(|event| room.take(event))
                .collect()
        };
        let cells = agenda
            .cells
            .into_iter()
            .map(|cell| CellRead {
                month: cell.month,
                name: cell.name,
                events: keep(cell.events),
            })
            .collect();
        let archives = with_archives.then(|| keep(agenda.archives));
        Self {
            path: path.to_owned(),
            title: agenda.title,
            columns: agenda.columns,
            tags: agenda.tags,
            cells,
            archives,
            unreadable: agenda.unreadable,
            truncated: room.omitted > 0,
            message: (room.omitted > 0).then(|| {
                format!(
                    "La réponse est coupée : {} événement(s) ne sont pas rendus (la limite est de \
                     {MAX_READ_AGENDA_12_CHARACTERS} caractères). Filtrez avec `tag`, ou ne \
                     demandez pas les archives.",
                    room.omitted
                )
            }),
        }
    }
}

/// Un entier facultatif que l'outil lit dans ses arguments.
fn number(arguments: &Value, field: &str) -> Result<Option<i64>, String> {
    match &arguments[field] {
        Value::Null => Ok(None),
        value => value
            .as_i64()
            .map(Some)
            .ok_or_else(|| format!("« {field} » doit être un entier")),
    }
}

/// Un jour, un mois ou une année facultatif, positif.
fn unsigned(arguments: &Value, field: &str) -> Result<Option<u32>, String> {
    number(arguments, field)?
        .map(|value| {
            u32::try_from(value).map_err(|_| format!("« {field} » doit être un entier positif"))
        })
        .transpose()
}

/// L'année facultative, telle que l'application la lit.
fn year(arguments: &Value) -> Result<Option<i32>, String> {
    number(arguments, "year")?
        .map(|value| i32::try_from(value).map_err(|_| "« year » est hors des limites".to_owned()))
        .transpose()
}

/// Les étiquettes facultatives : une liste de textes.
fn tags(arguments: &Value) -> Result<Vec<String>, String> {
    let wrong = || "« tags » est une liste de textes".to_owned();
    match &arguments["tags"] {
        Value::Null => Ok(Vec::new()),
        Value::Array(items) => items
            .iter()
            .map(|item| item.as_str().map(str::to_owned).ok_or_else(wrong))
            .collect(),
        _ => Err(wrong()),
    }
}

/// Un oui ou un non facultatif : non si absent.
fn flag(arguments: &Value, field: &str) -> Result<bool, String> {
    match &arguments[field] {
        Value::Null => Ok(false),
        Value::Bool(value) => Ok(*value),
        _ => Err(format!("« {field} » est true ou false")),
    }
}

/// L'événement que décrivent les arguments de `add_agenda_12_event`.
fn draft_of(arguments: &Value) -> Result<EventDraft, String> {
    let title = required(arguments, "title")?.to_owned();
    let month = number(arguments, "month")?
        .ok_or_else(|| "il manque « month » : un nombre de 1 à 12".to_owned())?;
    let month = agenda_12_month(u32::try_from(month).unwrap_or(0)).map_err(said)?;
    let end = match (
        unsigned(arguments, "end_day")?,
        unsigned(arguments, "end_month")?,
    ) {
        (Some(day), end_month) => Some(EventEnd {
            day,
            month: end_month.map_or(Ok(month), agenda_12_month).map_err(said)?,
        }),
        (None, Some(_)) => return Err("« end_month » exige « end_day »".to_owned()),
        (None, None) => None,
    };
    Ok(EventDraft {
        title,
        month,
        day: unsigned(arguments, "day")?,
        year: year(arguments)?,
        end,
        country: optional(arguments, "country")
            .map(agenda_12_country)
            .transpose()
            .map_err(said)?,
        city: optional(arguments, "city").map(str::to_owned),
        tags: tags(arguments)?,
    })
}

impl Session {
    /// Lit l'agenda 12 `path` : ses cases dans l'ordre de la grille, avec les champs de leurs
    /// événements ; les archives s'ajoutent à la demande.
    pub(super) fn tool_read_agenda_12(&self, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        let tag = optional(arguments, "tag");
        let with_archives = flag(arguments, "include_archives")?;
        let agenda = self.read_agenda_12(path, tag).map_err(said)?;
        written(&AgendaRead::of(path, agenda, with_archives))
    }

    /// Ajoute un événement à l'agenda 12 `path`, avec les mêmes refus qu'à l'écran.
    pub(super) fn tool_add_agenda_12_event(&self, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        let created = self
            .add_agenda_12_event(path, draft_of(arguments)?)
            .map_err(said)?;
        let event = self.read_agenda_12_event(&created.path).map_err(said)?;
        written(&json!({
            "path": created.path,
            "agenda": path,
            "event": EventRead::from(event.event),
        }))
    }

    /// Clôt l'événement `path`, avec ou sans la copie qui prépare le suivant.
    pub(super) fn tool_close_agenda_12_event(&self, arguments: &Value) -> Result<String, String> {
        let path = required(arguments, "path")?;
        let closing = if flag(arguments, "prepare_next")? {
            Agenda12ClosingItem::WithSuccessor
        } else {
            Agenda12ClosingItem::Alone
        };
        let closed = self.close_agenda_12_event(path, closing).map_err(said)?;
        written(&closed)
    }
}
