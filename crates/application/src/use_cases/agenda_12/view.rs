//! Ce que l'écran d'un agenda 12 montre : la grille, les archives, la liste des étiquettes.

use domain::NotePath;
use domain::agenda_12::{
    Agenda12Event, Agenda12Line, Cell, Columns, Month, PlacedEvent, archives_order, event_tags,
    grid,
};

use super::files::Loaded;

/// Un événement tel qu'une case ou les archives le montrent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventEntry {
    /// Le chemin de sa note.
    pub path: NotePath,
    /// L'événement lu, avec tous ses champs.
    pub event: Agenda12Event,
    /// Sa ligne (§ 5.3).
    pub line: Agenda12Line,
}

impl EventEntry {
    pub(super) fn of(placed: PlacedEvent, today_year: i32) -> Self {
        Self {
            line: Agenda12Line::of(&placed.event, today_year),
            path: placed.path,
            event: placed.event,
        }
    }
}

/// Une case de la grille : un mois et ses événements, dans l'ordre de la case.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CellView {
    /// Le mois de la case.
    pub month: Month,
    /// Ses événements.
    pub events: Vec<EventEntry>,
}

/// Un agenda 12 lu : sa grille, ses archives et les étiquettes de ses événements.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Agenda12View {
    /// Son titre, « Sans titre » s'il n'en a pas.
    pub title: String,
    /// Les colonnes de sa grille.
    pub columns: Columns,
    /// Les étiquettes portées par les événements de la grille : la liste du filtre.
    pub tags: Vec<String>,
    /// Les douze cases, de janvier à décembre, filtrées par étiquette s'il y a un filtre.
    pub cells: Vec<CellView>,
    /// Les événements clos, du plus récemment clos au plus ancien.
    pub archives: Vec<EventEntry>,
    /// Les événements illisibles, laissés de côté.
    pub unreadable: Vec<NotePath>,
}

impl Agenda12View {
    /// La vue de l'agenda 12 de titre `title` et de colonnes `columns`, de ces événements lus,
    /// montrés avec ce filtre ; `today_year` est l'année du jour du Mac.
    pub(super) fn new(
        (title, columns): (String, Columns),
        loaded: Loaded,
        today_year: i32,
        tag: Option<&str>,
    ) -> Self {
        let tags = event_tags(&loaded.open);
        let cells = grid(loaded.open, tag)
            .into_iter()
            .map(|Cell { month, events }| CellView {
                month,
                events: events
                    .into_iter()
                    .map(|placed| EventEntry::of(placed, today_year))
                    .collect(),
            })
            .collect();
        let archives = archives_order(loaded.closed)
            .into_iter()
            .map(|placed| EventEntry::of(placed, today_year))
            .collect();
        Self {
            title,
            columns,
            tags,
            cells,
            archives,
            unreadable: loaded.unreadable,
        }
    }
}

/// Un événement lu pour sa bande : ses champs, sa ligne, son agenda 12 et s'il est clos.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventView {
    /// L'agenda 12 qui le contient, désigné par le chemin de sa note.
    pub agenda: NotePath,
    /// Son titre affiché, celui de l'agenda 12 (le lien « ← … » de l'écran).
    pub agenda_title: String,
    /// Il est dans les archives.
    pub closed: bool,
    /// L'événement, avec tous ses champs.
    pub entry: EventEntry,
}
