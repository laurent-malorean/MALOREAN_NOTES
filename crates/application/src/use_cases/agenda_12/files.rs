//! Les fichiers d'un agenda 12 : son dossier des événements, ses archives, et la lecture d'un
//! événement sur le disque.

use domain::agenda_12::{
    Agenda12, Agenda12Event, EventPlace, PlacedEvent, archives_folder, event_place, events_folder,
};
use domain::{ContentType, Folder, NotePath};

use crate::{AppError, NoteStore, StoreError};

/// L'agenda 12 ouvert : sa note, lue, et les dossiers de ses événements.
#[derive(Debug)]
pub(super) struct AgendaFiles<'a> {
    pub(super) store: &'a dyn NoteStore,
    /// Le texte de l'agenda 12, tel que lu.
    pub(super) content: String,
    pub(super) agenda: Agenda12,
    /// Le dossier des événements ouverts, qui contient `archives/`.
    pub(super) events: Folder,
    /// Le sous-dossier des événements clos.
    pub(super) archives: Folder,
}

/// Les événements lus d'un agenda 12.
#[derive(Debug, Default)]
pub(super) struct Loaded {
    /// Ceux qui sont dans la grille.
    pub(super) open: Vec<PlacedEvent>,
    /// Ceux qui sont dans les archives.
    pub(super) closed: Vec<PlacedEvent>,
    /// Les événements illisibles, laissés de côté et jamais effacés.
    pub(super) unreadable: Vec<NotePath>,
}

impl<'a> AgendaFiles<'a> {
    /// Ouvre l'agenda 12 de la note `path`.
    pub(super) fn open(store: &'a dyn NoteStore, path: &NotePath) -> Result<Self, AppError> {
        let content = store.read(path)?.content;
        let agenda = Agenda12::parse(&content).ok_or(AppError::NotAnAgenda12)?;
        let (Some(events), Some(archives)) = (events_folder(path), archives_folder(path)) else {
            return Err(AppError::NotAnAgenda12);
        };
        Ok(Self {
            store,
            content,
            agenda,
            events,
            archives,
        })
    }

    /// Tous les événements, ouverts et clos : un dossier qui n'existe pas encore n'en a aucun.
    pub(super) fn load(&self) -> Result<Loaded, AppError> {
        let mut loaded = Loaded::default();
        read_folder(
            self.store,
            &self.events,
            &mut loaded.open,
            &mut loaded.unreadable,
        )?;
        read_folder(
            self.store,
            &self.archives,
            &mut loaded.closed,
            &mut loaded.unreadable,
        )?;
        Ok(loaded)
    }
}

/// Lit les événements posés directement dans `folder` : ceux qui se lisent vont dans `read`, ceux
/// qui déclarent le type mais ne se lisent pas dans `unreadable`, le reste est laissé de côté.
fn read_folder(
    store: &dyn NoteStore,
    folder: &Folder,
    read: &mut Vec<PlacedEvent>,
    unreadable: &mut Vec<NotePath>,
) -> Result<(), AppError> {
    let notes = match store.list(folder) {
        Ok(notes) => notes,
        Err(StoreError::FolderNotFound(_)) => return Ok(()),
        Err(error) => return Err(error.into()),
    };
    for note in notes {
        if ContentType::of_file(note.path.name(), &note.content) != ContentType::Agenda12Event {
            continue;
        }
        match Agenda12Event::parse(&note.content) {
            Ok(event) => read.push(PlacedEvent {
                path: note.path,
                event,
            }),
            Err(_) => unreadable.push(note.path),
        }
    }
    Ok(())
}

/// Un événement lu sur le disque, avec ce que son chemin dit de lui.
#[derive(Debug, Clone)]
pub(super) struct EventFile {
    pub(super) path: NotePath,
    /// Son agenda 12 et s'il est clos, déduits de son chemin.
    pub(super) place: EventPlace,
    /// Son texte, tel qu'il est maintenant sur le disque.
    pub(super) content: String,
    pub(super) event: Agenda12Event,
}

/// Lit l'événement de la note `path`.
///
/// # Errors
///
/// [`AppError::EventGone`] si la note n'existe plus, [`AppError::NotAnAgenda12Event`] si elle n'est
/// pas un événement ou n'est pas rangée dans le dossier d'un agenda 12,
/// [`AppError::EventUnreadable`] s'il n'a pas de titre ou de mois lisible.
pub(super) fn read_event(store: &dyn NoteStore, path: &NotePath) -> Result<EventFile, AppError> {
    let content = match store.read(path) {
        Ok(note) => note.content,
        Err(StoreError::NotFound(_) | StoreError::FolderNotFound(_)) => {
            return Err(AppError::EventGone);
        }
        Err(error) => return Err(error.into()),
    };
    if ContentType::of_file(path.name(), &content) != ContentType::Agenda12Event {
        return Err(AppError::NotAnAgenda12Event);
    }
    let place = event_place(path).ok_or(AppError::NotAnAgenda12Event)?;
    let event = Agenda12Event::parse(&content)?;
    Ok(EventFile {
        path: path.clone(),
        place,
        content,
        event,
    })
}
