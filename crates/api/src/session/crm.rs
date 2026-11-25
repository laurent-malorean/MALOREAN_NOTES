//! Le CRM de l'espace de travail ouvert, vu depuis l'interface (fiche 0058) : le créer, le lire, et
//! changer ses fiches geste par geste.

use application::use_cases::{
    ActionChange, ActionDraft, ChangeAction, ChangeCompany, ChangePerson, ChangeProject,
    ChangeStages, CheckEmail, CreateAction, CreateCompany, CreateCrm, CreatePerson, CreateProject,
    DeleteAction, DeleteCompany, DeletePerson, DeleteProject, MoveAction, ReadCrm,
};
use application::{AppError, NoteStore, PendingGestures};
use domain::crm::{Filters, Reference};
use domain::{Folder, NotePath};

use std::sync::Arc;

use super::Session;
use crate::dto::crm_day;
use crate::{
    ApiError, CrmActionChangeItem, CrmActionDraftItem, CrmCompanyChangeItem, CrmFiltersItem,
    CrmItem, CrmPersonChangeItem, CrmProjectChangeItem, PlacementItem, SavedNote, StageChangeItem,
};

fn reference(text: &str) -> Result<Reference, AppError> {
    Reference::to(text).ok_or_else(|| AppError::InvalidReference(text.to_owned()))
}

/// L'espace de travail ouvert, vu par un cas d'usage du CRM : son stockage, ses gestes en attente et
/// le chemin du CRM visé.
struct Opened {
    store: Arc<dyn NoteStore>,
    pending: Arc<dyn PendingGestures>,
    crm: NotePath,
}

impl Session {
    /// L'espace de travail ouvert et le CRM `crm`.
    fn crm(&self, crm: &str) -> Result<Opened, ApiError> {
        let opened = self.opened()?;
        Ok(Opened {
            store: opened.store,
            pending: opened.gestures,
            crm: NotePath::parse(crm)?,
        })
    }

    /// Crée dans `folder` un CRM titré `title` ; rend son chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; titre vide, dossier invalide,
    /// stockage indisponible, aucun espace de travail ouvert.
    pub fn create_crm(&self, folder: &str, title: &str) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let created = CreateCrm::new(&*store).execute(&Folder::parse(folder)?, title)?;
        Ok(SavedNote {
            path: created.to_path(),
        })
    }

    /// Le CRM de la note `path`, avec ces filtres pour le Kanban et Ma semaine, et la semaine qui
    /// contient `week_day` (`2026-11-24`) ; celle d'aujourd'hui sans jour.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; note qui n'est pas un CRM, filtre ou
    /// jour invalide, stockage indisponible, aucun espace de travail ouvert.
    pub fn read_crm(
        &self,
        path: &str,
        filters: CrmFiltersItem,
        week_day: Option<&str>,
    ) -> Result<CrmItem, ApiError> {
        let store = self.store()?;
        let filters = Filters::try_from(filters)?;
        let week_day = week_day.map(crm_day).transpose()?;
        let view = ReadCrm::new(&*store, &*self.clock).execute(
            &NotePath::parse(path)?,
            &filters,
            week_day,
        )?;
        Ok(view.into())
    }

    /// Dit si cet e-mail est déjà celui d'une autre personne du CRM (`except` : la personne qu'on
    /// modifie).
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; note qui n'est pas un CRM, référence
    /// invalide, stockage indisponible, aucun espace de travail ouvert.
    pub fn crm_email_is_known(
        &self,
        crm: &str,
        email: &str,
        except: Option<&str>,
    ) -> Result<bool, ApiError> {
        let store = self.store()?;
        let except = except.map(reference).transpose()?;
        Ok(CheckEmail::new(&*store).execute(&NotePath::parse(crm)?, email, except.as_ref())?)
    }

    /// Crée l'action `draft` dans le CRM `crm` ; rend sa référence.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; titre vide, colonne inconnue, fiche
    /// disparue, valeur invalide, stockage indisponible, aucun espace de travail ouvert.
    pub fn create_crm_action(
        &self,
        crm: &str,
        draft: CrmActionDraftItem,
    ) -> Result<String, ApiError> {
        let store = self.store()?;
        let draft = ActionDraft::try_from(draft)?;
        let created =
            CreateAction::new(&*store, &*self.clock).execute(&NotePath::parse(crm)?, draft)?;
        Ok(created.as_str().to_owned())
    }

    /// Fait ce geste sur l'action `action` du CRM `crm`.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; « Cette fiche n'existe plus. », geste
    /// refusé, valeur invalide, stockage indisponible, aucun espace de travail ouvert.
    pub fn change_crm_action(
        &self,
        crm: &str,
        action: &str,
        change: CrmActionChangeItem,
    ) -> Result<(), ApiError> {
        let store = self.store()?;
        let change = ActionChange::try_from(change)?;
        ChangeAction::new(&*store, &*self.clock).execute(
            &NotePath::parse(crm)?,
            &reference(action)?,
            change,
        )?;
        Ok(())
    }

    /// Lâche la carte `action` du CRM `crm` dans la colonne `status`, à cette place.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; fiche disparue, colonne inconnue,
    /// stockage indisponible, aucun espace de travail ouvert.
    pub fn move_crm_action(
        &self,
        crm: &str,
        action: &str,
        status: &str,
        placement: PlacementItem,
    ) -> Result<(), ApiError> {
        let Opened {
            store,
            pending,
            crm,
        } = self.crm(crm)?;
        MoveAction::new(&*store, &*pending).execute(
            &crm,
            &reference(action)?,
            status,
            &placement.try_into()?,
        )?;
        Ok(())
    }

    /// Met l'action `action` du CRM `crm` à la corbeille.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; fiche disparue, stockage indisponible,
    /// aucun espace de travail ouvert.
    pub fn delete_crm_action(&self, crm: &str, action: &str) -> Result<(), ApiError> {
        let store = self.store()?;
        DeleteAction::new(&*store).execute(&NotePath::parse(crm)?, &reference(action)?)?;
        Ok(())
    }

    /// Crée la personne `name` dans le CRM `crm`, dans l'entreprise `company` ou dans NODATA ; rend
    /// sa référence.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom refusé, fiche disparue, stockage
    /// indisponible, aucun espace de travail ouvert.
    pub fn create_crm_person(
        &self,
        crm: &str,
        name: &str,
        company: Option<&str>,
    ) -> Result<String, ApiError> {
        let store = self.store()?;
        let company = company.map(reference).transpose()?;
        let created = CreatePerson::new(&*store, &*self.clock).execute(
            &NotePath::parse(crm)?,
            name,
            company.as_ref(),
        )?;
        Ok(created.as_str().to_owned())
    }

    /// Fait ce geste sur la personne `person` du CRM `crm`.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; fiche disparue, nom refusé, valeur
    /// invalide, stockage indisponible, aucun espace de travail ouvert.
    pub fn change_crm_person(
        &self,
        crm: &str,
        person: &str,
        change: CrmPersonChangeItem,
    ) -> Result<(), ApiError> {
        let store = self.store()?;
        ChangePerson::new(&*store).execute(
            &NotePath::parse(crm)?,
            &reference(person)?,
            change.try_into()?,
        )?;
        Ok(())
    }

    /// Met la personne `person` du CRM `crm` à la corbeille et la retire de ses actions.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; fiche disparue, stockage indisponible,
    /// aucun espace de travail ouvert.
    pub fn delete_crm_person(&self, crm: &str, person: &str) -> Result<(), ApiError> {
        let Opened {
            store,
            pending,
            crm,
        } = self.crm(crm)?;
        DeletePerson::new(&*store, &*pending).execute(&crm, &reference(person)?)?;
        Ok(())
    }

    /// Crée l'entreprise `name` dans le CRM `crm` ; rend sa référence.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom refusé, stockage indisponible,
    /// aucun espace de travail ouvert.
    pub fn create_crm_company(&self, crm: &str, name: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        let created = CreateCompany::new(&*store).execute(&NotePath::parse(crm)?, name)?;
        Ok(created.as_str().to_owned())
    }

    /// Fait ce geste sur l'entreprise `company` du CRM `crm`.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; fiche disparue, nom refusé, valeur
    /// invalide, stockage indisponible, aucun espace de travail ouvert.
    pub fn change_crm_company(
        &self,
        crm: &str,
        company: &str,
        change: CrmCompanyChangeItem,
    ) -> Result<(), ApiError> {
        let store = self.store()?;
        ChangeCompany::new(&*store).execute(
            &NotePath::parse(crm)?,
            &reference(company)?,
            change.try_into()?,
        )?;
        Ok(())
    }

    /// Met l'entreprise `company` du CRM `crm` à la corbeille ; ses personnes passent à NODATA.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; fiche disparue, stockage indisponible,
    /// aucun espace de travail ouvert.
    pub fn delete_crm_company(&self, crm: &str, company: &str) -> Result<(), ApiError> {
        let Opened {
            store,
            pending,
            crm,
        } = self.crm(crm)?;
        DeleteCompany::new(&*store, &*pending, &*self.clock).execute(&crm, &reference(company)?)?;
        Ok(())
    }

    /// Crée le projet `name` dans le CRM `crm` ; rend sa référence.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom refusé, stockage indisponible,
    /// aucun espace de travail ouvert.
    pub fn create_crm_project(&self, crm: &str, name: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        let created = CreateProject::new(&*store).execute(&NotePath::parse(crm)?, name)?;
        Ok(created.as_str().to_owned())
    }

    /// Fait ce geste sur le projet `project` du CRM `crm`.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; fiche disparue, nom refusé, couleur
    /// inconnue, stockage indisponible, aucun espace de travail ouvert.
    pub fn change_crm_project(
        &self,
        crm: &str,
        project: &str,
        change: CrmProjectChangeItem,
    ) -> Result<(), ApiError> {
        let store = self.store()?;
        ChangeProject::new(&*store).execute(
            &NotePath::parse(crm)?,
            &reference(project)?,
            change.try_into()?,
        )?;
        Ok(())
    }

    /// Met le projet `project` du CRM `crm` à la corbeille ; ses actions passent à « Sans projet ».
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; fiche disparue, stockage indisponible,
    /// aucun espace de travail ouvert.
    pub fn delete_crm_project(&self, crm: &str, project: &str) -> Result<(), ApiError> {
        let Opened {
            store,
            pending,
            crm,
        } = self.crm(crm)?;
        DeleteProject::new(&*store, &*pending).execute(&crm, &reference(project)?)?;
        Ok(())
    }

    /// Change les étapes du CRM `crm` ; rend les nouvelles.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom d'étape refusé ou inconnu,
    /// stockage indisponible, aucun espace de travail ouvert.
    pub fn change_crm_stages(
        &self,
        crm: &str,
        change: StageChangeItem,
    ) -> Result<Vec<String>, ApiError> {
        let Opened {
            store,
            pending,
            crm,
        } = self.crm(crm)?;
        let stages = ChangeStages::new(&*store, &*pending).execute(&crm, &change.into())?;
        Ok(stages.names())
    }
}

#[cfg(test)]
#[path = "crm_tests.rs"]
mod tests;
