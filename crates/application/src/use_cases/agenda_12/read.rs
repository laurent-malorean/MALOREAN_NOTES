//! Lire un agenda 12 (spécification §§ 5 et 8) et un événement (§ 4.2).

use domain::NotePath;
use domain::agenda_12::{Agenda12, PlacedEvent};
use domain::crm::Day;

use super::files::{AgendaFiles, read_event};
use super::view::{Agenda12View, EventEntry, EventView};
use crate::{AppError, Clock, NoteStore, StoreError};

/// Lire un agenda 12 : sa grille, ses archives et ses étiquettes.
#[derive(Debug)]
pub struct ReadAgenda12<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> ReadAgenda12<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// L'agenda 12 de la note `agenda`, ses douze cases montrant seulement les événements qui portent
    /// l'étiquette `tag` s'il y en a une. Un événement illisible est laissé de côté.
    ///
    /// # Errors
    ///
    /// [`AppError::NotAnAgenda12`] si la note n'est pas un agenda 12 ; [`AppError::NoteNotFound`]
    /// si elle n'existe pas ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, agenda: &NotePath, tag: Option<&str>) -> Result<Agenda12View, AppError> {
        let files = AgendaFiles::open(self.store, agenda)?;
        let today = Day::from_moment(self.clock.now())?;
        let loaded = files.load()?;
        Ok(Agenda12View::new(
            (
                files.agenda.title.clone(),
                files.agenda.columns,
                files.agenda.layout,
            ),
            loaded,
            today.year(),
            tag,
        ))
    }
}

/// Lire un événement.
#[derive(Debug)]
pub struct ReadAgenda12Event<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> ReadAgenda12Event<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// L'événement de la note `event`, avec son agenda 12 et son état.
    ///
    /// # Errors
    ///
    /// [`AppError::EventGone`] si la note n'existe plus, [`AppError::NotAnAgenda12Event`] si elle
    /// n'est pas un événement rangé dans un dossier d'agenda 12, [`AppError::EventUnreadable`]
    /// s'il n'a pas de titre ou de mois lisible, [`AppError::StorageUnavailable`] si le stockage
    /// ne répond pas.
    pub fn execute(&self, event: &NotePath) -> Result<EventView, AppError> {
        let file = read_event(self.store, event)?;
        let today = Day::from_moment(self.clock.now())?;
        let agenda_title = match self.store.read(&file.place.agenda) {
            Ok(note) => Agenda12::parse(&note.content).map(|agenda| agenda.title),
            Err(StoreError::NotFound(_) | StoreError::FolderNotFound(_)) => None,
            Err(error) => return Err(error.into()),
        };
        Ok(EventView {
            agenda: file.place.agenda,
            agenda_title: agenda_title.ok_or(AppError::NotAnAgenda12Event)?,
            closed: file.place.closed,
            entry: EventEntry::of(
                PlacedEvent {
                    path: file.path,
                    event: file.event,
                },
                today.year(),
            ),
        })
    }
}

#[cfg(test)]
#[path = "read_tests.rs"]
mod tests;
