//! Le CRM (spécification `doc/specs/crm.md`, fiche 0058) : le créer, le lire, et changer ses fiches
//! geste par geste. Chaque cas d'usage lit le fichier le plus récent, décide avec les règles pures du
//! domaine, puis écrit ; un geste qui change plusieurs fichiers les écrit tous ensemble ou aucun.

mod actions;
mod companies;
mod files;
mod gesture;
mod people;
mod projects;
mod read;
mod stages;
mod view;

use domain::Folder;
use domain::NotePath;
use domain::crm::{Crm, Day, Name};

use crate::use_cases::CreateNote;
use crate::{AppError, Clock, NoteStore};

pub use actions::{
    ActionChange, ActionDraft, ChangeAction, CreateAction, DeleteAction, MoveAction, Placement,
};
pub use companies::{ChangeCompany, CompanyChange, CreateCompany, DeleteCompany};
pub use gesture::{ApplyGesture, RecoverGestures};
pub use people::{ChangePerson, CreatePerson, DeletePerson, PersonChange};
pub use projects::{ChangeProject, CreateProject, DeleteProject, ProjectChange};
pub use read::{CheckEmail, ReadCrm};
pub use stages::{ChangeStages, StageChange};
pub use view::{
    ColumnView, CompanyEntry, CrmView, NoDataEntry, PersonEntry, ProjectEntry, WeekView,
};

/// Le jour du Mac, donné par l'horloge.
fn today_of(clock: &dyn Clock) -> Result<Day, AppError> {
    Ok(Day::from_moment(clock.now())?)
}

/// Un nouveau CRM, sans étapes écrites, qui n'écrase aucune autre note.
#[derive(Debug)]
pub struct CreateCrm<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateCrm<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le chemin du CRM titré `title` créé dans `folder`, sous le nom tiré de son titre.
    ///
    /// # Errors
    ///
    /// [`AppError::CrmName`] si le titre est vide ou sur plusieurs lignes ;
    /// [`AppError::StorageUnavailable`] si le dossier ne peut pas être lu ou écrit.
    pub fn execute(&self, folder: &Folder, title: &str) -> Result<NotePath, AppError> {
        let title = Name::parse(title)?;
        CreateNote::new(self.store).with_content(folder, &Crm::new_content(title.as_str()))
    }
}

#[cfg(test)]
mod tests {
    use domain::crm::NameError;

    use super::*;
    use crate::testing::InMemoryNoteStore;

    #[test]
    fn a_crm_is_created_under_the_name_of_its_title_without_written_stages() {
        let store = InMemoryNoteStore::with_notes(&[("Ventes/clients.md", "# Autre")]);
        let created = CreateCrm::new(&store)
            .execute(&Folder::parse("Ventes").unwrap(), "  Mes   clients ")
            .unwrap();
        assert_eq!(created, NotePath::parse("Ventes/mes-clients.md").unwrap());
        assert_eq!(
            store.read(&created).unwrap().content,
            "---\ntype: crm\n---\n# Mes clients\n"
        );
        let again = CreateCrm::new(&store)
            .execute(&Folder::parse("Ventes").unwrap(), "Clients")
            .unwrap();
        assert_eq!(again, NotePath::parse("Ventes/clients-2.md").unwrap());
    }

    #[test]
    fn an_empty_name_is_refused() {
        let store = InMemoryNoteStore::default();
        assert_eq!(
            CreateCrm::new(&store).execute(&Folder::root(), "  "),
            Err(AppError::CrmName(NameError::Empty))
        );
        assert!(store.names(&Folder::root()).unwrap().is_empty());
    }
}

#[cfg(test)]
mod fixture;
