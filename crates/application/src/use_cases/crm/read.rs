//! Lire un CRM (spécification § 7) : ses fiches et tout ce que le domaine en calcule.

use domain::NotePath;
use domain::crm::{Day, Filters, Person, email_is_known};

use super::files::CrmFiles;
use super::today_of;
use super::view::CrmView;
use crate::{AppError, Clock, NoteStore};

/// Un CRM lu, avec ses colonnes du Kanban, Ma semaine et ses compteurs.
#[derive(Debug)]
pub struct ReadCrm<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> ReadCrm<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// Le CRM de la note `crm`, avec ces `filters` pour le Kanban et Ma semaine, et la semaine qui
    /// contient `week_day` (celle d'aujourd'hui sans jour donné). Une fiche illisible est laissée de
    /// côté.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::NoteNotFound`] si elle n'existe
    /// pas ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(
        &self,
        crm: &NotePath,
        filters: &Filters,
        week_day: Option<Day>,
    ) -> Result<CrmView, AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let today = today_of(self.clock)?;
        let fiches = files.load()?;
        Ok(CrmView::new(
            (files.crm.title.clone(), files.crm.stages.clone()),
            fiches,
            (today, week_day.unwrap_or(today)),
            filters,
        ))
    }
}

/// Dit si l'e-mail saisi est déjà celui d'une autre personne du CRM : un risque de doublon, signalé
/// sans rien bloquer.
#[derive(Debug)]
pub struct CheckEmail<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CheckEmail<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Vrai si une personne du CRM `crm`, autre que `except` (la personne qu'on modifie), a déjà
    /// cet e-mail.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::StorageUnavailable`] si le
    /// stockage ne répond pas.
    pub fn execute(
        &self,
        crm: &NotePath,
        email: &str,
        except: Option<&domain::crm::Reference>,
    ) -> Result<bool, AppError> {
        let fiches = CrmFiles::open(self.store, crm)?.load()?;
        let others: Vec<&Person> = fiches
            .people
            .iter()
            .filter(|(fiche, _)| Some(&fiche.name) != except)
            .map(|(_, person)| person)
            .collect();
        Ok(email_is_known(
            email,
            others.iter().filter_map(|person| person.email.as_deref()),
        ))
    }
}

#[cfg(test)]
#[path = "read_tests.rs"]
mod tests;
