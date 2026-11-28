//! L'agenda 12 (spécification `doc/specs/agenda-12.md`, fiche 0104) : une grille de 12 mois, de
//! janvier à décembre, où chaque événement est rangé dans son mois. Les règles pures de l'agenda 12 et
//! de ses événements, leur format de fichier (`doc/format/agenda-12.md`) et les calculs de la
//! grille. Aucun accès au disque ni à l'horloge : le jour d'aujourd'hui est toujours donné.

mod agenda;
mod country;
mod country_names;
mod date;
mod event;
mod event_change;
mod event_write;
mod folders;
mod grid;
mod line;
mod month;

pub use agenda::{AGENDA_TYPE, Agenda12, Columns, Layout, with_columns, with_layout};
pub use country::Country;
pub use date::{DateError, EventDate, EventEnd, MAX_YEAR, MIN_YEAR};
pub use event::{Agenda12Event, EVENT_TYPE, EventUnreadable, searchable_text};
pub use event_change::{DateChange, change_date};
pub use event_write::{
    TitleError, clean_title, closed_on, new_event_content, reopened, successor_content, with_city,
    with_country, with_day, with_end, with_month, with_tags, with_title, with_year,
};
pub use folders::{ARCHIVES, EventPlace, archives_folder, event_place, events_folder};
pub use grid::{Cell, PlacedEvent, archives_order, cell_order, event_tags, grid};
pub use line::{Agenda12Line, YearTone};
pub use month::Month;
