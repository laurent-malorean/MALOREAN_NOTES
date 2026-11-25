//! Les personnes d'un CRM (spécifications §§ 5.2, 9.2 et 10) : en créer une, la changer, la
//! supprimer.

use domain::NotePath;
use domain::crm::action_write::without_person;
use domain::crm::person::{with_company, with_field, with_notes};
use domain::crm::{CrmKind, Day, Name, Person, PersonField, Reference, file_name_of, with_name};

use super::files::CrmFiles;
use super::gesture::ApplyGesture;
use super::today_of;
use crate::{AppError, Clock, Gesture, GestureStep, NoteStore, PendingGestures};

/// Créer une personne.
#[derive(Debug)]
pub struct CreatePerson<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> CreatePerson<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// Écrit la personne `name` dans le CRM `crm` et rend sa référence. Créée depuis la fiche d'une
    /// entreprise (`company`), elle y entre aujourd'hui et son parcours le dit ; créée ailleurs, elle
    /// est dans NODATA. Le dossier des personnes naît avec la première.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::CrmName`] si le nom est vide,
    /// sur plusieurs lignes ou déjà celui d'une autre personne ; [`AppError::FicheGone`] si
    /// l'entreprise n'existe plus ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(
        &self,
        crm: &NotePath,
        name: &str,
        company: Option<&Reference>,
    ) -> Result<Reference, AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let today = today_of(self.clock)?;
        let fiches = files.load()?;
        let name = Name::unique(name, fiches.people.iter().map(|(_, p)| p.name.as_str()))?;
        if let Some(company) = company {
            files.read(CrmKind::Company, company)?;
        }
        let taken = files.names(CrmKind::Person)?;
        let file = file_name_of(&name, |candidate| taken.contains(candidate));
        let content = Person::new_content(&name, company, today);
        files.write_new(CrmKind::Person, &file, &content)
    }
}

/// Un geste sur une personne.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PersonChange {
    /// Son nom entier.
    Rename(String),
    /// Un de ses champs ; vide, il est retiré.
    Field(PersonField, String),
    /// Ses notes libres.
    Notes(String),
    /// « Changer d'entreprise » : la nouvelle entreprise (NODATA sans) et le jour du changement.
    Company(Option<Reference>, Day),
}

/// Changer une personne.
#[derive(Debug)]
pub struct ChangePerson<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ChangePerson<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Fait ce geste sur la personne `person` du CRM `crm` ; son texte est relu juste avant. Changer
    /// pour l'entreprise où elle est déjà ne change rien.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::FicheGone`] si la personne (ou
    /// l'entreprise donnée) n'existe plus ; [`AppError::CrmName`] si le nouveau nom est refusé ;
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(
        &self,
        crm: &NotePath,
        person: &Reference,
        change: PersonChange,
    ) -> Result<(), AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let fiche = files.read(CrmKind::Person, person)?;
        let content = &fiche.content;
        let written = match change {
            PersonChange::Rename(name) => {
                let fiches = files.load()?;
                let others = fiches
                    .people
                    .iter()
                    .filter(|(other, _)| other.name != *person)
                    .map(|(_, other)| other.name.as_str());
                with_name(content, &Name::unique(&name, others)?)
            }
            PersonChange::Field(field, value) => with_field(content, field, &value),
            PersonChange::Notes(notes) => with_notes(content, &notes),
            PersonChange::Company(company, day) => {
                if let Some(company) = &company {
                    files.read(CrmKind::Company, company)?;
                }
                with_company(content, company.as_ref(), day)
            }
        };
        if written != *content {
            self.store.write(&fiche.path, &written)?;
        }
        Ok(())
    }
}

/// Supprimer une personne (spécification § 5.2).
#[derive(Debug)]
pub struct DeletePerson<'a> {
    store: &'a dyn NoteStore,
    pending: &'a dyn PendingGestures,
}

impl<'a> DeletePerson<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et ses gestes en attente.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, pending: &'a dyn PendingGestures) -> Self {
        Self { store, pending }
    }

    /// Met la fiche de la personne `person` à la corbeille et la retire de la liste des personnes de
    /// chacune de ses actions, tous ensemble ou aucun. Les actions restent ; restaurer la personne ne
    /// la remet pas dans ses actions.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::FicheGone`] si la personne
    /// n'existe plus ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, crm: &NotePath, person: &Reference) -> Result<(), AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let fiche = files.read(CrmKind::Person, person)?;
        let mut steps: Vec<GestureStep> = files
            .load()?
            .actions
            .into_iter()
            .filter_map(|(action, _)| {
                let content = without_person(&action.content, person);
                (content != action.content).then_some(GestureStep::Rewrite {
                    note: action.path,
                    content,
                })
            })
            .collect();
        steps.push(GestureStep::Trash { note: fiche.path });
        ApplyGesture::new(self.store, self.pending).execute(&Gesture::new(steps))
    }
}

#[cfg(test)]
#[path = "people_tests.rs"]
mod tests;
