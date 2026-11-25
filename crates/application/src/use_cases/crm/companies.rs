//! Les entreprises d'un CRM (spécifications §§ 5.1, 9.1 et 10) : en créer une, la changer, la
//! supprimer.

use domain::NotePath;
use domain::crm::company::{with_field, with_notes};
use domain::crm::person::with_company;
use domain::crm::{Company, CompanyField, CrmKind, Name, Reference, file_name_of, with_name};

use super::files::CrmFiles;
use super::gesture::ApplyGesture;
use super::today_of;
use crate::{AppError, Clock, Gesture, GestureStep, NoteStore, PendingGestures};

/// Créer une entreprise.
#[derive(Debug)]
pub struct CreateCompany<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateCompany<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Écrit l'entreprise `name` dans le CRM `crm` et rend sa référence. Le dossier des entreprises
    /// naît avec la première.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::CrmName`] si le nom est vide,
    /// sur plusieurs lignes ou déjà celui d'une autre entreprise ; [`AppError::StorageUnavailable`]
    /// si le stockage ne répond pas.
    pub fn execute(&self, crm: &NotePath, name: &str) -> Result<Reference, AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let fiches = files.load()?;
        let name = Name::unique(name, fiches.companies.iter().map(|(_, c)| c.name.as_str()))?;
        let taken = files.names(CrmKind::Company)?;
        let file = file_name_of(&name, |candidate| taken.contains(candidate));
        files.write_new(CrmKind::Company, &file, &Company::new_content(&name))
    }
}

/// Un geste sur une entreprise.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompanyChange {
    /// Son nom (son titre, jamais son nom de fichier).
    Rename(String),
    /// Un de ses champs ; vide, il est retiré.
    Field(CompanyField, String),
    /// Ses notes libres.
    Notes(String),
}

/// Changer une entreprise.
#[derive(Debug)]
pub struct ChangeCompany<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ChangeCompany<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Fait ce geste sur l'entreprise `company` du CRM `crm` ; son texte est relu juste avant.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::FicheGone`] si l'entreprise
    /// n'existe plus ; [`AppError::CrmName`] si le nouveau nom est refusé ;
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(
        &self,
        crm: &NotePath,
        company: &Reference,
        change: CompanyChange,
    ) -> Result<(), AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let fiche = files.read(CrmKind::Company, company)?;
        let content = &fiche.content;
        let written = match change {
            CompanyChange::Rename(name) => {
                let fiches = files.load()?;
                let others = fiches
                    .companies
                    .iter()
                    .filter(|(other, _)| other.name != *company)
                    .map(|(_, other)| other.name.as_str());
                with_name(content, &Name::unique(&name, others)?)
            }
            CompanyChange::Field(field, value) => with_field(content, field, &value),
            CompanyChange::Notes(notes) => with_notes(content, &notes),
        };
        if written != *content {
            self.store.write(&fiche.path, &written)?;
        }
        Ok(())
    }
}

/// Supprimer une entreprise (spécification § 5.1).
#[derive(Debug)]
pub struct DeleteCompany<'a> {
    store: &'a dyn NoteStore,
    pending: &'a dyn PendingGestures,
    clock: &'a dyn Clock,
}

impl<'a> DeleteCompany<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert, ses gestes en attente et l'horloge.
    #[must_use]
    pub fn new(
        store: &'a dyn NoteStore,
        pending: &'a dyn PendingGestures,
        clock: &'a dyn Clock,
    ) -> Self {
        Self {
            store,
            pending,
            clock,
        }
    }

    /// Met la fiche de l'entreprise `company` à la corbeille et fait passer chacune de ses personnes
    /// à NODATA (son parcours garde l'ancienne entreprise, fermée aujourd'hui), tous ensemble ou
    /// aucun. Les actions gardent l'entreprise du moment ; restaurer l'entreprise ne rattache pas ses
    /// anciennes personnes.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::FicheGone`] si l'entreprise
    /// n'existe plus ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, crm: &NotePath, company: &Reference) -> Result<(), AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let today = today_of(self.clock)?;
        let fiche = files.read(CrmKind::Company, company)?;
        let mut steps: Vec<GestureStep> = files
            .load()?
            .people
            .into_iter()
            .filter(|(_, person)| person.company.as_ref() == Some(company))
            .map(|(person, _)| GestureStep::Rewrite {
                content: with_company(&person.content, None, today),
                note: person.path,
            })
            .collect();
        steps.push(GestureStep::Trash { note: fiche.path });
        ApplyGesture::new(self.store, self.pending).execute(&Gesture::new(steps))
    }
}

#[cfg(test)]
#[path = "companies_tests.rs"]
mod tests;
