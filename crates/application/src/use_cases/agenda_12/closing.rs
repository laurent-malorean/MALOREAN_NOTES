//! Clore un événement et le rouvrir (spécification §§ 7 et 8).

use domain::NotePath;
use domain::agenda_12::{archives_folder, closed_on, events_folder, reopened, successor_content};
use domain::crm::Day;

use super::files::read_event;
use crate::use_cases::crm_fiches::ensure_folder;
use crate::use_cases::{CreateNote, MoveNote};
use crate::{AppError, Clock, NoteStore};

/// Ce que devient l'événement qu'on clôt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Closing {
    /// « Clore » : l'événement passe dans les archives, sans copie.
    Alone,
    /// « Clore et préparer le suivant » : l'événement passe dans les archives et sa copie (titre,
    /// mois, pays, ville, étiquettes) naît dans la grille.
    WithSuccessor,
}

/// Ce qu'a donné une clôture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Closed {
    /// Le chemin de l'événement dans les archives.
    pub closed: NotePath,
    /// Le chemin de la copie, si elle a été demandée.
    pub successor: Option<NotePath>,
}

/// Clore un événement.
#[derive(Debug)]
pub struct CloseAgenda12Event<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> CloseAgenda12Event<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// Clôt l'événement `event` : il retient le jour de sa clôture (celui du Mac), puis son fichier
    /// passe dans le sous-dossier `archives/` de son agenda 12 (nom suffixé s'il est déjà pris
    /// là-bas), qui naît avec la première clôture. La copie, si elle est demandée, est écrite
    /// ensuite, sous le nom de son titre. Un arrêt entre deux écritures laisse l'événement soit ouvert,
    /// soit clos, jamais abîmé.
    ///
    /// # Errors
    ///
    /// [`AppError::EventGone`] si l'événement n'existe plus ; [`AppError::NotAnAgenda12Event`] si la
    /// note n'en est pas un ; [`AppError::EventUnreadable`] s'il ne se lit pas ;
    /// [`AppError::EventAlreadyClosed`] s'il est déjà clos ; [`AppError::StorageUnavailable`] si le
    /// stockage ne répond pas.
    pub fn execute(&self, event: &NotePath, closing: Closing) -> Result<Closed, AppError> {
        let file = read_event(self.store, event)?;
        if file.place.closed {
            return Err(AppError::EventAlreadyClosed);
        }
        let (Some(archives), Some(events)) = (
            archives_folder(&file.place.agenda),
            events_folder(&file.place.agenda),
        ) else {
            return Err(AppError::NotAnAgenda12Event);
        };
        let today = Day::from_moment(self.clock.now())?;
        self.store
            .write(&file.path, &closed_on(&file.content, today))?;
        ensure_folder(self.store, &archives)?;
        let closed = MoveNote::new(self.store).execute(&file.path, &archives)?;
        let successor = match closing {
            Closing::Alone => None,
            Closing::WithSuccessor => Some(
                CreateNote::new(self.store)
                    .with_content(&events, &successor_content(&file.event))?,
            ),
        };
        Ok(Closed { closed, successor })
    }
}

/// Rouvrir un événement clos.
#[derive(Debug)]
pub struct ReopenAgenda12Event<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ReopenAgenda12Event<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Rouvre l'événement clos `event` : il perd son jour de clôture et son fichier revient dans le
    /// dossier des événements de son agenda 12 (nom suffixé s'il est déjà pris), dans la case de son
    /// mois. Rend son nouveau chemin.
    ///
    /// # Errors
    ///
    /// [`AppError::EventGone`] si l'événement n'existe plus ; [`AppError::NotAnAgenda12Event`] si la
    /// note n'en est pas un ; [`AppError::EventUnreadable`] s'il ne se lit pas ;
    /// [`AppError::EventNotClosed`] s'il n'est pas clos ; [`AppError::StorageUnavailable`] si le
    /// stockage ne répond pas.
    pub fn execute(&self, event: &NotePath) -> Result<NotePath, AppError> {
        let file = read_event(self.store, event)?;
        if !file.place.closed {
            return Err(AppError::EventNotClosed);
        }
        let events = events_folder(&file.place.agenda).ok_or(AppError::NotAnAgenda12Event)?;
        self.store.write(&file.path, &reopened(&file.content))?;
        MoveNote::new(self.store).execute(&file.path, &events)
    }
}

#[cfg(test)]
#[path = "closing_tests.rs"]
mod tests;
