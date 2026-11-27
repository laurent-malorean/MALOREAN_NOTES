//! L'agenda 12 de l'espace de travail ouvert, vu depuis l'interface et les outils (fiche 0104) : le
//! créer, lire sa grille, changer ses colonnes, et créer, changer, clore, rouvrir, supprimer ses
//! événements.

use application::use_cases::{
    ChangeAgenda12Event, ChangeColumns, CloseAgenda12Event, CreateAgenda12, CreateAgenda12Event,
    DeleteAgenda12Event, EventChange, EventDraft, ReadAgenda12, ReadAgenda12Event,
    ReopenAgenda12Event,
};
use domain::agenda_12::Country;
use domain::{Folder, NotePath};

use super::Session;
use crate::dto::{agenda_12_columns, agenda_12_month};
use crate::{
    Agenda12ClosedItem, Agenda12ClosingItem, Agenda12EventChangeItem, Agenda12EventDetailItem,
    Agenda12Item, ApiError, CountryItem, SavedNote,
};

impl Session {
    /// Crée dans `folder` un agenda 12 titré `title` ; rend son chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; titre vide ou sur plusieurs lignes,
    /// dossier invalide, stockage indisponible, aucun espace de travail ouvert.
    pub fn create_agenda_12(&self, folder: &str, title: &str) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let created = CreateAgenda12::new(&*store).execute(&Folder::parse(folder)?, title)?;
        Ok(SavedNote {
            path: created.to_path(),
        })
    }

    /// L'agenda 12 de la note `path` : ses douze cases (filtrées par l'étiquette `tag` s'il y en a
    /// une), ses archives et la liste de son filtre.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; note qui n'est pas un agenda 12,
    /// stockage indisponible, aucun espace de travail ouvert.
    pub fn read_agenda_12(&self, path: &str, tag: Option<&str>) -> Result<Agenda12Item, ApiError> {
        let store = self.store()?;
        let view =
            ReadAgenda12::new(&*store, &*self.clock).execute(&NotePath::parse(path)?, tag)?;
        Ok(view.into())
    }

    /// Garde ce nombre de colonnes (3, 4 ou 6) dans l'agenda 12 `path`.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nombre de colonnes refusé, note qui
    /// n'est pas un agenda 12, stockage indisponible, aucun espace de travail ouvert.
    pub fn change_agenda_12_columns(&self, path: &str, columns: u32) -> Result<(), ApiError> {
        let store = self.store()?;
        ChangeColumns::new(&*store)
            .execute(&NotePath::parse(path)?, agenda_12_columns(columns)?)?;
        Ok(())
    }

    /// Crée l'événement « Sans titre » du mois `month` (de 1 à 12) dans l'agenda 12 `agenda` ; rend
    /// le chemin de sa note.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; mois refusé, note qui n'est pas un
    /// agenda 12, stockage indisponible, aucun espace de travail ouvert.
    pub fn create_agenda_12_event(&self, agenda: &str, month: u32) -> Result<SavedNote, ApiError> {
        self.add_agenda_12_event(agenda, EventDraft::untitled(agenda_12_month(month)?))
    }

    /// Crée l'événement décrit par `draft` dans l'agenda 12 `agenda` ; rend le chemin de sa note.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; titre ou date refusés, note qui n'est
    /// pas un agenda 12, stockage indisponible, aucun espace de travail ouvert.
    pub fn add_agenda_12_event(
        &self,
        agenda: &str,
        draft: EventDraft,
    ) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let created =
            CreateAgenda12Event::new(&*store).execute(&NotePath::parse(agenda)?, draft)?;
        Ok(SavedNote {
            path: created.to_path(),
        })
    }

    /// L'événement de la note `path`, avec son agenda 12 et son état.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; « Cet événement n'existe plus. », note
    /// qui n'est pas un événement, événement illisible, stockage indisponible, aucun espace de
    /// travail ouvert.
    pub fn read_agenda_12_event(&self, path: &str) -> Result<Agenda12EventDetailItem, ApiError> {
        let store = self.store()?;
        let view =
            ReadAgenda12Event::new(&*store, &*self.clock).execute(&NotePath::parse(path)?)?;
        Ok(view.into())
    }

    /// Fait ce geste sur l'événement `path`, ouvert ou clos.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; événement disparu, titre, mois, pays
    /// ou date refusés, stockage indisponible, aucun espace de travail ouvert.
    pub fn change_agenda_12_event(
        &self,
        path: &str,
        change: Agenda12EventChangeItem,
    ) -> Result<(), ApiError> {
        let store = self.store()?;
        let change = EventChange::try_from(change)?;
        ChangeAgenda12Event::new(&*store).execute(&NotePath::parse(path)?, change)?;
        Ok(())
    }

    /// Clôt l'événement `path` : il passe dans les archives de son agenda 12, avec ou sans copie.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; événement disparu ou déjà clos,
    /// stockage indisponible, aucun espace de travail ouvert.
    pub fn close_agenda_12_event(
        &self,
        path: &str,
        closing: Agenda12ClosingItem,
    ) -> Result<Agenda12ClosedItem, ApiError> {
        let store = self.store()?;
        let closed = CloseAgenda12Event::new(&*store, &*self.clock)
            .execute(&NotePath::parse(path)?, closing.into())?;
        Ok(closed.into())
    }

    /// Rouvre l'événement clos `path` : il revient dans la grille ; rend le chemin de sa note.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; événement disparu ou pas clos,
    /// stockage indisponible, aucun espace de travail ouvert.
    pub fn reopen_agenda_12_event(&self, path: &str) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let reopened = ReopenAgenda12Event::new(&*store).execute(&NotePath::parse(path)?)?;
        Ok(SavedNote {
            path: reopened.to_path(),
        })
    }

    /// Met l'événement `path`, ouvert ou clos, à la corbeille ; rend son chemin dans la corbeille.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; événement disparu, note qui n'est pas
    /// un événement, stockage indisponible, aucun espace de travail ouvert.
    pub fn delete_agenda_12_event(&self, path: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        let trashed = DeleteAgenda12Event::new(&*store).execute(&NotePath::parse(path)?)?;
        Ok(trashed.to_path())
    }
}

/// Les pays de la norme, rangés par nom en français : la liste où l'on choisit.
#[must_use]
pub(crate) fn agenda_12_countries() -> Vec<CountryItem> {
    Country::all().into_iter().map(CountryItem::from).collect()
}
