//! Ce que l'interface lit d'un agenda 12 (fiche 0104) : sa grille, ses archives, ses événements et la
//! liste des pays. Tout est calculé par Rust : l'interface affiche.

use application::use_cases::{Agenda12View, CellView, Closed, EventEntry, EventView};
use domain::agenda_12::{Agenda12Line, Country, EventEnd, YearTone};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Un pays de la liste où l'on choisit, ou celui d'un événement.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CountryItem {
    /// Son code ISO 3166-1 sur deux lettres, en majuscules (`DE`).
    pub code: String,
    /// Son nom en français (`Allemagne`).
    pub name: String,
    /// Son drapeau (`🇩🇪`).
    pub flag: String,
}

impl From<Country> for CountryItem {
    fn from(country: Country) -> Self {
        Self {
            code: country.code().to_owned(),
            name: country.name().to_owned(),
            flag: country.flag(),
        }
    }
}

/// La couleur de la pastille de l'année d'une ligne, d'après le jour du Mac.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum YearToneItem {
    /// L'année en cours : vert.
    Current,
    /// L'année suivante : orange.
    Next,
    /// Une année plus lointaine : marron.
    Later,
    /// Une année passée : neutre.
    Past,
}

impl From<YearTone> for YearToneItem {
    fn from(tone: YearTone) -> Self {
        match tone {
            YearTone::Current => Self::Current,
            YearTone::Next => Self::Next,
            YearTone::Later => Self::Later,
            YearTone::Past => Self::Past,
        }
    }
}

/// La fin d'un événement sur plusieurs jours.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Agenda12EndItem {
    /// Le jour de la fin.
    pub day: u32,
    /// Le mois de la fin, de 1 à 12 ; le mois du début quand l'événement tient dans un mois.
    pub month: u32,
}

impl From<EventEnd> for Agenda12EndItem {
    fn from(end: EventEnd) -> Self {
        Self {
            day: end.day,
            month: end.month.number(),
        }
    }
}

/// La ligne d'un événement (`date – drapeau (ville) – titre`), en parties : l'écran les met en forme
/// et les colore.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Agenda12LineItem {
    /// Le jour et le mois (`12/02`), ou l'intervalle (`10–13/02`, `30/01 → 02/02`) ; rien sans jour.
    pub date: Option<String>,
    /// L'année, à montrer en pastille.
    pub year: Option<i32>,
    /// La couleur de la pastille ; rien sans année.
    pub year_tone: Option<YearToneItem>,
    /// Le drapeau du pays.
    pub flag: Option<String>,
    /// La ville, à montrer entre parenthèses.
    pub city: Option<String>,
    /// Le titre.
    pub title: String,
    /// La ligne entière en texte : `10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World`.
    pub text: String,
}

impl From<&Agenda12Line> for Agenda12LineItem {
    fn from(line: &Agenda12Line) -> Self {
        Self {
            date: line.date.clone(),
            year: line.year,
            year_tone: line.tone.map(YearToneItem::from),
            flag: line.country.map(Country::flag),
            city: line.city.clone(),
            title: line.title.clone(),
            text: line.text(),
        }
    }
}

/// Un événement, avec tous ses champs et sa ligne.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Agenda12EventItem {
    /// Le chemin de sa note.
    pub path: String,
    /// Son titre.
    pub title: String,
    /// Son mois de début, de 1 à 12 : sa case.
    pub month: u32,
    /// Son jour de début.
    pub day: Option<u32>,
    /// Son année de début.
    pub year: Option<i32>,
    /// Sa fin.
    pub end: Option<Agenda12EndItem>,
    /// Son pays.
    pub country: Option<CountryItem>,
    /// Sa ville.
    pub city: Option<String>,
    /// Ses étiquettes.
    pub tags: Vec<String>,
    /// Le jour de sa clôture, `2026-11-27` ; rien s'il est ouvert ou n'a pas retenu son jour.
    pub closed_on: Option<String>,
    /// Sa ligne.
    pub line: Agenda12LineItem,
}

impl From<EventEntry> for Agenda12EventItem {
    fn from(entry: EventEntry) -> Self {
        let EventEntry { path, event, line } = entry;
        Self {
            path: path.to_path(),
            title: event.title,
            month: event.date.month().number(),
            day: event.date.day(),
            year: event.date.year(),
            end: event.date.end().map(Agenda12EndItem::from),
            country: event.country.map(CountryItem::from),
            city: event.city,
            tags: event.tags,
            closed_on: event.closed_on.map(|day| day.to_string()),
            line: Agenda12LineItem::from(&line),
        }
    }
}

/// Une case de la grille.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Agenda12CellItem {
    /// Son mois, de 1 (janvier) à 12 (décembre).
    pub month: u32,
    /// Le nom du mois en français, en minuscules (`février`).
    pub name: String,
    /// Ses événements, dans l'ordre de la case.
    pub events: Vec<Agenda12EventItem>,
}

impl From<CellView> for Agenda12CellItem {
    fn from(cell: CellView) -> Self {
        Self {
            month: cell.month.number(),
            name: cell.month.name().to_owned(),
            events: cell
                .events
                .into_iter()
                .map(Agenda12EventItem::from)
                .collect(),
        }
    }
}

/// Un agenda 12 lu : sa grille, ses archives et la liste de son filtre.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Agenda12Item {
    /// Son titre, « Sans titre » s'il n'en a pas.
    pub title: String,
    /// Le nombre de colonnes de sa grille : 3, 4 ou 6.
    pub columns: u32,
    /// Les étiquettes portées par les événements de la grille, la liste du filtre.
    pub tags: Vec<String>,
    /// Les douze cases, de janvier à décembre.
    pub cells: Vec<Agenda12CellItem>,
    /// Les événements clos, du plus récemment clos au plus ancien.
    pub archives: Vec<Agenda12EventItem>,
    /// Les chemins des événements illisibles, laissés de côté.
    pub unreadable: Vec<String>,
}

impl From<Agenda12View> for Agenda12Item {
    fn from(view: Agenda12View) -> Self {
        Self {
            title: view.title,
            columns: view.columns.count(),
            tags: view.tags,
            cells: view.cells.into_iter().map(Agenda12CellItem::from).collect(),
            archives: view
                .archives
                .into_iter()
                .map(Agenda12EventItem::from)
                .collect(),
            unreadable: view
                .unreadable
                .iter()
                .map(domain::NotePath::to_path)
                .collect(),
        }
    }
}

/// Un événement lu pour sa bande.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Agenda12EventDetailItem {
    /// Le chemin de son agenda 12 (le lien « ← … »).
    pub agenda: String,
    /// Le titre de son agenda 12.
    pub agenda_title: String,
    /// Il est dans les archives.
    pub closed: bool,
    /// L'événement.
    pub event: Agenda12EventItem,
}

impl From<EventView> for Agenda12EventDetailItem {
    fn from(view: EventView) -> Self {
        Self {
            agenda: view.agenda.to_path(),
            agenda_title: view.agenda_title,
            closed: view.closed,
            event: view.entry.into(),
        }
    }
}

/// Ce qu'a donné une clôture.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct Agenda12ClosedItem {
    /// Le chemin de l'événement dans les archives.
    pub closed: String,
    /// Le chemin de la copie qui prépare le suivant, si elle a été demandée.
    pub successor: Option<String>,
}

impl From<Closed> for Agenda12ClosedItem {
    fn from(closed: Closed) -> Self {
        Self {
            closed: closed.closed.to_path(),
            successor: closed.successor.as_ref().map(domain::NotePath::to_path),
        }
    }
}
