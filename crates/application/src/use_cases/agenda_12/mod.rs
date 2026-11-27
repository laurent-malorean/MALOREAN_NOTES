//! L'agenda 12 (spécification `doc/specs/agenda-12.md`, fiche 0104) : le créer, le lire, et changer
//! ses événements geste par geste. Chaque cas d'usage lit le fichier le plus récent, décide avec les
//! règles pures du domaine, puis écrit.

mod closing;
mod events;
mod files;
mod read;
mod view;

pub use closing::{CloseAgenda12Event, Closed, Closing, ReopenAgenda12Event};
pub use events::{
    ChangeAgenda12Event, ChangeColumns, CreateAgenda12, CreateAgenda12Event, DeleteAgenda12Event,
    EventChange, EventDraft,
};
pub use read::{ReadAgenda12, ReadAgenda12Event};
pub use view::{Agenda12View, CellView, EventEntry, EventView};

#[cfg(test)]
mod fixture;

#[cfg(test)]
mod following_tests;
