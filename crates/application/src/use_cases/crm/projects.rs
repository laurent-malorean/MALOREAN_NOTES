//! Les projets d'un CRM (spécifications §§ 5.4 et 10) : en créer un, le changer, le supprimer.

use domain::NotePath;
use domain::crm::action_write::without_project;
use domain::crm::project::with_color;
use domain::crm::{Color, CrmKind, Name, Project, Reference, file_name_of, with_name};

use super::files::CrmFiles;
use super::gesture::ApplyGesture;
use crate::{AppError, Gesture, GestureStep, NoteStore, PendingGestures};

/// Créer un projet.
#[derive(Debug)]
pub struct CreateProject<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateProject<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Écrit le projet `name` dans le CRM `crm`, de la couleur la moins utilisée du CRM (la première
    /// de la palette en cas d'égalité), et rend sa référence. Le dossier des projets naît avec le
    /// premier.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::CrmName`] si le nom est vide,
    /// sur plusieurs lignes ou déjà celui d'un autre projet ; [`AppError::StorageUnavailable`] si le
    /// stockage ne répond pas.
    pub fn execute(&self, crm: &NotePath, name: &str) -> Result<Reference, AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let fiches = files.load()?;
        let name = Name::unique(name, fiches.projects.iter().map(|(_, p)| p.name.as_str()))?;
        let color = Color::least_used(fiches.projects.iter().map(|(_, p)| p.color));
        let taken = files.names(CrmKind::Project)?;
        let file = file_name_of(&name, |candidate| taken.contains(candidate));
        files.write_new(CrmKind::Project, &file, &Project::new_content(&name, color))
    }
}

/// Un geste sur un projet.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProjectChange {
    /// Son nom ; ses actions n'en savent rien, elles le désignent par son nom de fichier.
    Rename(String),
    /// Sa couleur.
    Color(Color),
}

/// Changer un projet.
#[derive(Debug)]
pub struct ChangeProject<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ChangeProject<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Fait ce geste sur le projet `project` du CRM `crm` ; son texte est relu juste avant.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::FicheGone`] si le projet
    /// n'existe plus ; [`AppError::CrmName`] si le nouveau nom est refusé ;
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(
        &self,
        crm: &NotePath,
        project: &Reference,
        change: ProjectChange,
    ) -> Result<(), AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let fiche = files.read(CrmKind::Project, project)?;
        let content = &fiche.content;
        let written = match change {
            ProjectChange::Rename(name) => {
                let fiches = files.load()?;
                let others = fiches
                    .projects
                    .iter()
                    .filter(|(other, _)| other.name != *project)
                    .map(|(_, other)| other.name.as_str());
                with_name(content, &Name::unique(&name, others)?)
            }
            ProjectChange::Color(color) => with_color(content, color),
        };
        if written != *content {
            self.store.write(&fiche.path, &written)?;
        }
        Ok(())
    }
}

/// Supprimer un projet (spécification § 5.4).
#[derive(Debug)]
pub struct DeleteProject<'a> {
    store: &'a dyn NoteStore,
    pending: &'a dyn PendingGestures,
}

impl<'a> DeleteProject<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et ses gestes en attente.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, pending: &'a dyn PendingGestures) -> Self {
        Self { store, pending }
    }

    /// Met la fiche du projet `project` à la corbeille et fait passer ses actions à « Sans projet »,
    /// tous ensemble ou aucun. Les actions ne sont jamais supprimées ; restaurer le projet ne leur
    /// est pas rendu.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACrm`] si la note n'est pas un CRM ; [`AppError::FicheGone`] si le projet
    /// n'existe plus ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, crm: &NotePath, project: &Reference) -> Result<(), AppError> {
        let files = CrmFiles::open(self.store, crm)?;
        let fiche = files.read(CrmKind::Project, project)?;
        let mut steps: Vec<GestureStep> = files
            .load()?
            .actions
            .into_iter()
            .filter_map(|(action, _)| {
                let content = without_project(&action.content, project);
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
#[path = "projects_tests.rs"]
mod tests;
