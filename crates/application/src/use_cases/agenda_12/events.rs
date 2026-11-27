//! Les événements d'un agenda 12 (spécification §§ 4, 6 et 9) : en créer un, le changer champ par
//! champ, le mettre à la corbeille ; et créer un agenda 12, choisir ses colonnes.

use domain::agenda_12::{
    Agenda12, Columns, Country, DateChange, EventDate, EventEnd, Month, change_date, clean_title,
    new_event_content, with_city, with_columns, with_country, with_day, with_end, with_tags,
    with_title, with_year,
};
use domain::title::UNTITLED;
use domain::{Folder, NotePath};

use super::files::{AgendaFiles, read_event};
use crate::use_cases::crm_fiches::ensure_folder;
use crate::use_cases::{CreateNote, Trash};
use crate::{AppError, NoteStore};

/// Créer un agenda 12 vide.
#[derive(Debug)]
pub struct CreateAgenda12<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateAgenda12<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le chemin de l'agenda 12 titré `title` créé dans `folder`, sous le nom tiré de son titre ;
    /// il naît sans événement, donc sans dossier des événements.
    ///
    /// # Errors
    ///
    /// [`AppError::EventTitle`] si le titre est vide ou sur plusieurs lignes ;
    /// [`AppError::StorageUnavailable`] si le dossier ne peut pas être lu ou écrit.
    pub fn execute(&self, folder: &Folder, title: &str) -> Result<NotePath, AppError> {
        let title = clean_title(title)?;
        CreateNote::new(self.store).with_content(folder, &Agenda12::new_content(&title))
    }
}

/// Choisir le nombre de colonnes de la grille d'un agenda 12.
#[derive(Debug)]
pub struct ChangeColumns<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ChangeColumns<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Écrit ce nombre de colonnes dans l'agenda 12 `agenda`, sans rien changer d'autre ; un agenda
    /// qui a déjà ce nombre n'est pas réécrit.
    ///
    /// # Errors
    ///
    /// [`AppError::NotAnAgenda12`] si la note n'est pas un agenda 12 ;
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, agenda: &NotePath, columns: Columns) -> Result<(), AppError> {
        let files = AgendaFiles::open(self.store, agenda)?;
        let written = with_columns(&files.content, columns);
        if written != files.content {
            self.store.write(agenda, &written)?;
        }
        Ok(())
    }
}

/// Ce que l'utilisateur ou une IA donne pour créer un événement : un titre et un mois, et le reste
/// facultatif.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventDraft {
    /// Son titre ; « Sans titre » pour le « + » d'une case.
    pub title: String,
    /// Son mois : sa case.
    pub month: Month,
    /// Son jour de début.
    pub day: Option<u32>,
    /// Son année de début.
    pub year: Option<i32>,
    /// Sa fin.
    pub end: Option<EventEnd>,
    /// Son pays.
    pub country: Option<Country>,
    /// Sa ville.
    pub city: Option<String>,
    /// Ses étiquettes.
    pub tags: Vec<String>,
}

impl EventDraft {
    /// L'événement du « + » d'une case : « Sans titre », de ce mois, rien d'autre.
    #[must_use]
    pub fn untitled(month: Month) -> Self {
        Self {
            title: UNTITLED.to_owned(),
            month,
            day: None,
            year: None,
            end: None,
            country: None,
            city: None,
            tags: Vec::new(),
        }
    }
}

/// Créer un événement.
#[derive(Debug)]
pub struct CreateAgenda12Event<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateAgenda12Event<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Écrit l'événement décrit par `draft` dans l'agenda 12 `agenda`, sous le nom tiré de son titre
    /// (premier suffixe libre si ce nom est pris), et rend son chemin. Le dossier des événements
    /// naît avec le premier.
    ///
    /// # Errors
    ///
    /// [`AppError::NotAnAgenda12`] si la note n'est pas un agenda 12 ; [`AppError::EventTitle`] si
    /// le titre est vide ou sur plusieurs lignes ; [`AppError::EventDate`] si la date n'existe pas ;
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, agenda: &NotePath, draft: EventDraft) -> Result<NotePath, AppError> {
        let files = AgendaFiles::open(self.store, agenda)?;
        let title = clean_title(&draft.title)?;
        let date = EventDate::new(draft.month, draft.day, draft.year, draft.end)?;
        let content = new_event_content(&title, date.month());
        let content = with_day(&content, date.day());
        let content = with_year(&content, date.year());
        let content = with_end(&content, date.month(), date.end());
        let content = with_country(&content, draft.country);
        let content = with_city(&content, draft.city.as_deref());
        let content = with_tags(&content, &draft.tags);
        ensure_folder(self.store, &files.events)?;
        CreateNote::new(self.store).with_content(&files.events, &content)
    }
}

/// Un geste sur un événement : un seul champ change, sur la version la plus récente du fichier.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EventChange {
    /// Son titre ; son nom de fichier ne change jamais.
    Title(String),
    /// Un champ de sa date.
    Date(DateChange),
    /// Son pays ; sans pays, la clé est retirée.
    Country(Option<Country>),
    /// Sa ville ; sans ville, la clé est retirée.
    City(Option<String>),
    /// Ses étiquettes : nettoyées, sans doublon ; sans étiquette, la propriété est retirée.
    Tags(Vec<String>),
}

/// Changer un événement.
#[derive(Debug)]
pub struct ChangeAgenda12Event<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ChangeAgenda12Event<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Fait ce geste sur l'événement `event`, ouvert ou clos ; son texte est relu juste avant. Rien
    /// n'est écrit si le geste ne change rien.
    ///
    /// # Errors
    ///
    /// [`AppError::EventGone`] si l'événement n'existe plus ; [`AppError::NotAnAgenda12Event`] si la
    /// note n'en est pas un ; [`AppError::EventUnreadable`] s'il ne se lit pas ;
    /// [`AppError::EventTitle`] si le nouveau titre est refusé ; [`AppError::EventDate`] si la
    /// nouvelle date n'existe pas ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, event: &NotePath, change: EventChange) -> Result<(), AppError> {
        let file = read_event(self.store, event)?;
        let content = &file.content;
        let written = match change {
            EventChange::Title(title) => with_title(content, &clean_title(&title)?),
            EventChange::Date(change) => change_date(content, &file.event, change)?.1,
            EventChange::Country(country) => with_country(content, country),
            EventChange::City(city) => with_city(content, city.as_deref()),
            EventChange::Tags(tags) => with_tags(content, &tags),
        };
        if written != *content {
            self.store.write(&file.path, &written)?;
        }
        Ok(())
    }
}

/// Mettre un événement à la corbeille.
#[derive(Debug)]
pub struct DeleteAgenda12Event<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> DeleteAgenda12Event<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Met la note de l'événement `event`, ouvert ou clos, à la corbeille ; restaurée, elle revient
    /// dans la grille ou dans les archives, selon son état. Rend son chemin dans la corbeille.
    ///
    /// # Errors
    ///
    /// [`AppError::EventGone`] si l'événement n'existe plus ; [`AppError::NotAnAgenda12Event`] si la
    /// note n'en est pas un ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, event: &NotePath) -> Result<NotePath, AppError> {
        match read_event(self.store, event) {
            Ok(_) | Err(AppError::EventUnreadable(_)) => Trash::new(self.store).put_note(event),
            Err(error) => Err(error),
        }
    }
}

#[cfg(test)]
#[path = "events_tests.rs"]
mod tests;
