//! Les espaces de travail connus : un nom et un dossier chacun, et celui qui est ouvert.
//!
//! Deux espaces de travail n'ont jamais le même nom (majuscules ignorées) ni le même dossier.
//! Chacun est autorisé ou non pour les IA (décoché au départ) : une IA branchée ne voit et ne vise
//! que les espaces autorisés (fiche 0074). Chacun a aussi son dossier des modèles, s'il en a choisi un
//! (fiche 0077) : gardé ici, là où l'interface, les IA branchées et la colonne Claude Code le lisent.

use domain::Folder;

use crate::{AppError, WorkspaceLocation};

/// Le nom d'un espace de travail, tel que l'utilisateur l'a écrit, sans espaces autour.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceName(String);

impl WorkspaceName {
    /// Le nom écrit, débarrassé des espaces autour.
    ///
    /// # Errors
    ///
    /// [`AppError::EmptyWorkspaceName`] s'il ne reste rien.
    pub fn new(name: &str) -> Result<Self, AppError> {
        let name = name.trim();
        if name.is_empty() {
            Err(AppError::EmptyWorkspaceName)
        } else {
            Ok(Self(name.to_owned()))
        }
    }

    /// Le nom, tel qu'il est gardé.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Les deux noms désignent-ils le même espace de travail (majuscules ignorées) ?
    #[must_use]
    pub fn same_as(&self, other: &Self) -> bool {
        self.0.to_lowercase() == other.0.to_lowercase()
    }
}

/// Un espace de travail : un nom, et le dossier de ses notes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Workspace {
    /// Le nom choisi par l'utilisateur, par défaut celui du dossier.
    pub name: WorkspaceName,
    /// Le dossier de ses notes.
    pub location: WorkspaceLocation,
}

/// La liste des espaces de travail, dans l'ordre où on les a ajoutés, et celui qui est ouvert.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Workspaces {
    list: Vec<Workspace>,
    /// Pour chaque espace de la liste, dans le même ordre : l'utilisateur l'a-t-il autorisé pour
    /// les IA ? Décoché au départ.
    allowed: Vec<bool>,
    /// Pour chaque espace de la liste, dans le même ordre : son dossier des modèles, s'il en a
    /// choisi un (fiche 0077).
    templates: Vec<Option<Folder>>,
    active: Option<WorkspaceName>,
}

impl Workspaces {
    /// La liste telle qu'elle a été gardée. Un espace de travail dont le nom ou le dossier est
    /// déjà pris par un précédent est oublié ; un espace ouvert inconnu de la liste aussi.
    #[must_use]
    pub fn from_saved(saved: Vec<Workspace>, active: Option<WorkspaceName>) -> Self {
        let mut list: Vec<Workspace> = Vec::new();
        for workspace in saved {
            let taken = list.iter().any(|kept| {
                kept.name.same_as(&workspace.name) || kept.location == workspace.location
            });
            if !taken {
                list.push(workspace);
            }
        }
        let active = active
            .and_then(|name| list.iter().find(|w| w.name.same_as(&name)))
            .map(|w| w.name.clone());
        let allowed = vec![false; list.len()];
        let templates = vec![None; list.len()];
        Self {
            list,
            allowed,
            templates,
            active,
        }
    }

    /// Les espaces de travail, dans l'ordre où on les a ajoutés.
    #[must_use]
    pub fn list(&self) -> &[Workspace] {
        &self.list
    }

    /// L'espace de travail ouvert en dernier, s'il y en a un.
    #[must_use]
    pub fn active(&self) -> Option<&Workspace> {
        let name = self.active.as_ref()?;
        self.list.iter().find(|w| w.name.same_as(name))
    }

    /// L'espace de travail qui porte ce nom.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`] si aucun ne le porte.
    pub fn find(&self, name: &WorkspaceName) -> Result<&Workspace, AppError> {
        self.list
            .iter()
            .find(|w| w.name.same_as(name))
            .ok_or_else(|| AppError::WorkspaceNotFound(name.as_str().to_owned()))
    }

    /// La liste avec `workspace` en plus, qui devient l'espace ouvert.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNameTaken`] si un autre porte déjà ce nom,
    /// [`AppError::WorkspaceFolderTaken`] si un autre a déjà ce dossier.
    pub fn added(mut self, workspace: Workspace) -> Result<Self, AppError> {
        if let Some(owner) = self.list.iter().find(|w| w.location == workspace.location) {
            return Err(AppError::WorkspaceFolderTaken(
                owner.name.as_str().to_owned(),
            ));
        }
        self.refuse_taken_name(&workspace.name, None)?;
        self.active = Some(workspace.name.clone());
        self.list.push(workspace);
        self.allowed.push(false);
        self.templates.push(None);
        Ok(self)
    }

    /// La même liste, l'espace de travail `name` devenu l'espace ouvert.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`] si aucun ne porte ce nom.
    pub fn activated(mut self, name: &WorkspaceName) -> Result<Self, AppError> {
        self.active = Some(self.find(name)?.name.clone());
        Ok(self)
    }

    /// La même liste, l'espace de travail `name` renommé `new_name` ; son dossier ne change pas.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`] si aucun ne porte `name`,
    /// [`AppError::WorkspaceNameTaken`] si un autre porte déjà `new_name`.
    pub fn renamed(
        mut self,
        name: &WorkspaceName,
        new_name: WorkspaceName,
    ) -> Result<Self, AppError> {
        let index = self.index_of(name)?;
        self.refuse_taken_name(&new_name, Some(index))?;
        if self
            .active
            .as_ref()
            .is_some_and(|active| active.same_as(name))
        {
            self.active = Some(new_name.clone());
        }
        self.list[index].name = new_name;
        Ok(self)
    }

    /// La liste sans l'espace de travail `name` ; son dossier n'est pas touché.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`] si aucun ne porte ce nom,
    /// [`AppError::OpenWorkspaceKept`] si c'est l'espace ouvert.
    pub fn removed(mut self, name: &WorkspaceName) -> Result<Self, AppError> {
        let index = self.index_of(name)?;
        if self
            .active
            .as_ref()
            .is_some_and(|active| active.same_as(name))
        {
            return Err(AppError::OpenWorkspaceKept(name.as_str().to_owned()));
        }
        self.list.remove(index);
        self.allowed.remove(index);
        self.templates.remove(index);
        Ok(self)
    }

    /// La même liste, où les espaces qui portent ces noms sont autorisés pour les IA ; un nom
    /// inconnu est oublié. Sert à relire ce qui a été gardé.
    #[must_use]
    pub fn with_allowed(mut self, names: &[WorkspaceName]) -> Self {
        for (workspace, allowed) in self.list.iter().zip(&mut self.allowed) {
            *allowed = names.iter().any(|name| name.same_as(&workspace.name));
        }
        self
    }

    /// La même liste, où les espaces qui portent ces noms ont ces dossiers des modèles ; un nom
    /// inconnu est oublié. Sert à relire ce qui a été gardé.
    #[must_use]
    pub fn with_templates_folders(mut self, saved: &[(WorkspaceName, Folder)]) -> Self {
        for (workspace, templates) in self.list.iter().zip(&mut self.templates) {
            *templates = saved
                .iter()
                .find(|(name, _)| name.same_as(&workspace.name))
                .map(|(_, folder)| folder.clone());
        }
        self
    }

    /// Le dossier des modèles de l'espace de travail `name` ; rien s'il n'en a pas choisi, ou s'il
    /// est inconnu.
    #[must_use]
    pub fn templates_folder(&self, name: &WorkspaceName) -> Option<&Folder> {
        let index = self.index_of(name).ok()?;
        self.templates[index].as_ref()
    }

    /// La même liste, le dossier des modèles de l'espace de travail `name` devenu `folder` (aucun
    /// pour `None`).
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`] si aucun ne porte ce nom.
    pub fn choosing_templates_folder(
        mut self,
        name: &WorkspaceName,
        folder: Option<Folder>,
    ) -> Result<Self, AppError> {
        let index = self.index_of(name)?;
        self.templates[index] = folder;
        Ok(self)
    }

    /// L'espace de travail `name` est-il autorisé pour les IA ? Faux s'il est inconnu.
    #[must_use]
    pub fn is_allowed(&self, name: &WorkspaceName) -> bool {
        self.list
            .iter()
            .zip(&self.allowed)
            .any(|(workspace, allowed)| *allowed && workspace.name.same_as(name))
    }

    /// Les espaces de travail autorisés pour les IA, dans l'ordre de la liste.
    #[must_use]
    pub fn allowed(&self) -> Vec<&Workspace> {
        self.list
            .iter()
            .zip(&self.allowed)
            .filter_map(|(workspace, allowed)| allowed.then_some(workspace))
            .collect()
    }

    /// L'espace de travail autorisé pour les IA qui porte ce nom. Un nom inconnu et un nom non
    /// autorisé donnent la même erreur : elle ne dit pas qu'un espace non autorisé existe.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotAllowed`] avec les noms des espaces autorisés.
    pub fn allowed_named(&self, name: &WorkspaceName) -> Result<&Workspace, AppError> {
        self.allowed()
            .into_iter()
            .find(|workspace| workspace.name.same_as(name))
            .ok_or_else(|| AppError::WorkspaceNotAllowed {
                name: name.as_str().to_owned(),
                allowed: self
                    .allowed()
                    .iter()
                    .map(|workspace| workspace.name.as_str().to_owned())
                    .collect(),
            })
    }

    /// La même liste, l'espace de travail `name` autorisé pour les IA.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`] si aucun ne porte ce nom.
    pub fn allowing(mut self, name: &WorkspaceName) -> Result<Self, AppError> {
        let index = self.index_of(name)?;
        self.allowed[index] = true;
        Ok(self)
    }

    /// La même liste, l'espace de travail `name` plus autorisé pour les IA.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`] si aucun ne porte ce nom.
    pub fn forbidding(mut self, name: &WorkspaceName) -> Result<Self, AppError> {
        let index = self.index_of(name)?;
        self.allowed[index] = false;
        Ok(self)
    }

    fn index_of(&self, name: &WorkspaceName) -> Result<usize, AppError> {
        self.list
            .iter()
            .position(|w| w.name.same_as(name))
            .ok_or_else(|| AppError::WorkspaceNotFound(name.as_str().to_owned()))
    }

    fn refuse_taken_name(
        &self,
        name: &WorkspaceName,
        except: Option<usize>,
    ) -> Result<(), AppError> {
        let taken = self
            .list
            .iter()
            .enumerate()
            .any(|(index, w)| Some(index) != except && w.name.same_as(name));
        if taken {
            Err(AppError::WorkspaceNameTaken(name.as_str().to_owned()))
        } else {
            Ok(())
        }
    }
}

#[cfg(test)]
#[path = "workspaces_tests.rs"]
mod tests;
