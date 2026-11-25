//! Les espaces de travail connus : un nom et un dossier chacun, et celui qui est ouvert.
//!
//! Deux espaces de travail n'ont jamais le même nom (majuscules ignorées) ni le même dossier.
//! Chacun est autorisé ou non pour les IA (décoché au départ) : une IA branchée ne voit et ne vise
//! que les espaces autorisés (fiche 0074).

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
        Self {
            list,
            allowed,
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
mod tests {
    use super::*;

    fn name(text: &str) -> WorkspaceName {
        WorkspaceName::new(text).unwrap()
    }

    fn workspace(text: &str, folder: &str) -> Workspace {
        Workspace {
            name: name(text),
            location: WorkspaceLocation::new(folder).unwrap(),
        }
    }

    fn names(workspaces: &Workspaces) -> Vec<&str> {
        workspaces.list().iter().map(|w| w.name.as_str()).collect()
    }

    fn two() -> Workspaces {
        Workspaces::default()
            .added(workspace("Notes", "/notes"))
            .unwrap()
            .added(workspace("Travail", "/travail"))
            .unwrap()
    }

    #[test]
    fn a_name_is_kept_without_surrounding_spaces() {
        assert_eq!(name("  Mes notes ").as_str(), "Mes notes");
    }

    #[test]
    fn an_empty_name_is_refused() {
        assert_eq!(WorkspaceName::new("   "), Err(AppError::EmptyWorkspaceName));
    }

    #[test]
    fn names_are_compared_ignoring_case() {
        assert!(name("Notes").same_as(&name("NOTES")));
        assert!(!name("Notes").same_as(&name("Notes 2")));
    }

    #[test]
    fn nothing_is_known_at_first() {
        let workspaces = Workspaces::default();
        assert!(workspaces.list().is_empty());
        assert_eq!(workspaces.active(), None);
    }

    #[test]
    fn an_added_workspace_comes_last_and_becomes_the_open_one() {
        let workspaces = two();
        assert_eq!(names(&workspaces), ["Notes", "Travail"]);
        assert_eq!(workspaces.active(), Some(&workspace("Travail", "/travail")));
    }

    #[test]
    fn two_workspaces_never_share_a_name_or_a_folder() {
        assert_eq!(
            two().added(workspace("travail", "/autre")),
            Err(AppError::WorkspaceNameTaken("travail".into()))
        );
        assert_eq!(
            two().added(workspace("Autre", "/notes")),
            Err(AppError::WorkspaceFolderTaken("Notes".into()))
        );
    }

    #[test]
    fn a_workspace_is_found_by_its_name_ignoring_case() {
        assert_eq!(
            two().find(&name("notes")),
            Ok(&workspace("Notes", "/notes"))
        );
        assert_eq!(
            two().find(&name("Perso")),
            Err(AppError::WorkspaceNotFound("Perso".into()))
        );
    }

    #[test]
    fn opening_another_workspace_makes_it_the_open_one() {
        let workspaces = two().activated(&name("notes")).unwrap();
        assert_eq!(workspaces.active(), Some(&workspace("Notes", "/notes")));
        assert_eq!(
            two().activated(&name("Perso")),
            Err(AppError::WorkspaceNotFound("Perso".into()))
        );
    }

    #[test]
    fn renaming_changes_the_name_only() {
        let workspaces = two().renamed(&name("Notes"), name("Perso")).unwrap();
        assert_eq!(workspaces.list()[0], workspace("Perso", "/notes"));
        assert_eq!(workspaces.active(), Some(&workspace("Travail", "/travail")));
    }

    #[test]
    fn the_open_workspace_stays_open_once_renamed() {
        let workspaces = two().renamed(&name("travail"), name("Bureau")).unwrap();
        assert_eq!(workspaces.active(), Some(&workspace("Bureau", "/travail")));
    }

    #[test]
    fn a_workspace_may_be_renamed_with_other_capitals() {
        let workspaces = two().renamed(&name("Notes"), name("NOTES")).unwrap();
        assert_eq!(names(&workspaces), ["NOTES", "Travail"]);
    }

    #[test]
    fn renaming_onto_another_name_or_an_unknown_workspace_is_refused() {
        assert_eq!(
            two().renamed(&name("Notes"), name("travail")),
            Err(AppError::WorkspaceNameTaken("travail".into()))
        );
        assert_eq!(
            two().renamed(&name("Perso"), name("Autre")),
            Err(AppError::WorkspaceNotFound("Perso".into()))
        );
    }

    #[test]
    fn a_removed_workspace_leaves_the_list() {
        let workspaces = two().removed(&name("notes")).unwrap();
        assert_eq!(names(&workspaces), ["Travail"]);
        assert_eq!(workspaces.active(), Some(&workspace("Travail", "/travail")));
    }

    #[test]
    fn the_open_workspace_or_an_unknown_one_cannot_be_removed() {
        assert_eq!(
            two().removed(&name("travail")),
            Err(AppError::OpenWorkspaceKept("travail".into()))
        );
        assert_eq!(
            two().removed(&name("Perso")),
            Err(AppError::WorkspaceNotFound("Perso".into()))
        );
    }

    #[test]
    fn a_saved_list_forgets_repeated_names_and_folders_and_an_unknown_open_one() {
        let workspaces = Workspaces::from_saved(
            vec![
                workspace("Notes", "/notes"),
                workspace("notes", "/autre"),
                workspace("Copie", "/notes"),
                workspace("Travail", "/travail"),
            ],
            Some(name("Perso")),
        );
        assert_eq!(names(&workspaces), ["Notes", "Travail"]);
        assert_eq!(workspaces.active(), None);
    }

    #[test]
    fn a_saved_open_workspace_is_found_ignoring_case() {
        let workspaces =
            Workspaces::from_saved(vec![workspace("Notes", "/notes")], Some(name("NOTES")));
        assert_eq!(workspaces.active(), Some(&workspace("Notes", "/notes")));
    }

    #[test]
    fn no_workspace_is_allowed_at_first() {
        let workspaces = two();
        assert!(workspaces.allowed().is_empty());
        assert!(!workspaces.is_allowed(&name("Notes")));
        assert!(!workspaces.is_allowed(&name("Perso")));
    }

    #[test]
    fn an_allowed_workspace_is_found_ignoring_case_and_listed_in_the_order_of_the_list() {
        let workspaces = two()
            .allowing(&name("travail"))
            .unwrap()
            .allowing(&name("NOTES"))
            .unwrap();
        assert!(workspaces.is_allowed(&name("notes")));
        assert!(workspaces.is_allowed(&name("TRAVAIL")));
        let allowed: Vec<_> = workspaces
            .allowed()
            .iter()
            .map(|w| w.name.as_str())
            .collect();
        assert_eq!(allowed, ["Notes", "Travail"]);
    }

    #[test]
    fn a_forbidden_workspace_is_no_longer_allowed_and_the_others_stay() {
        let workspaces = two()
            .allowing(&name("Notes"))
            .unwrap()
            .allowing(&name("Travail"))
            .unwrap()
            .forbidding(&name("notes"))
            .unwrap();
        assert!(!workspaces.is_allowed(&name("Notes")));
        assert!(workspaces.is_allowed(&name("Travail")));
    }

    #[test]
    fn allowing_or_forbidding_an_unknown_workspace_is_refused() {
        assert_eq!(
            two().allowing(&name("Perso")),
            Err(AppError::WorkspaceNotFound("Perso".into()))
        );
        assert_eq!(
            two().forbidding(&name("Perso")),
            Err(AppError::WorkspaceNotFound("Perso".into()))
        );
    }

    #[test]
    fn an_allowed_workspace_is_found_by_name_and_another_is_refused_with_the_allowed_names() {
        let workspaces = two().allowing(&name("Travail")).unwrap();
        assert_eq!(
            workspaces.allowed_named(&name("travail")),
            Ok(&workspace("Travail", "/travail"))
        );
        let refused = AppError::WorkspaceNotAllowed {
            name: "Notes".into(),
            allowed: vec!["Travail".into()],
        };
        assert_eq!(workspaces.allowed_named(&name("Notes")), Err(refused));
        let unknown = AppError::WorkspaceNotAllowed {
            name: "Perso".into(),
            allowed: vec!["Travail".into()],
        };
        assert_eq!(workspaces.allowed_named(&name("Perso")), Err(unknown));
    }

    #[test]
    fn a_workspace_added_after_an_allowed_one_is_not_allowed() {
        let workspaces = two()
            .allowing(&name("Notes"))
            .unwrap()
            .added(workspace("Perso", "/perso"))
            .unwrap();
        assert!(workspaces.is_allowed(&name("Notes")));
        assert!(!workspaces.is_allowed(&name("Perso")));
    }

    #[test]
    fn a_renamed_workspace_keeps_its_box_and_a_removed_one_leaves_the_others_untouched() {
        let workspaces = two()
            .allowing(&name("Notes"))
            .unwrap()
            .renamed(&name("Notes"), name("Perso"))
            .unwrap();
        assert!(workspaces.is_allowed(&name("Perso")));
        assert!(!workspaces.is_allowed(&name("Notes")));
        let rest = two()
            .allowing(&name("Travail"))
            .unwrap()
            .allowing(&name("Notes"))
            .unwrap()
            .forbidding(&name("Notes"))
            .unwrap()
            .removed(&name("Notes"))
            .unwrap();
        assert!(rest.is_allowed(&name("Travail")));
        assert_eq!(rest.allowed().len(), 1);
    }

    #[test]
    fn saved_allowed_names_are_marked_ignoring_case_and_unknown_names_are_forgotten() {
        let workspaces = two().with_allowed(&[name("TRAVAIL"), name("Perso")]);
        let allowed: Vec<_> = workspaces
            .allowed()
            .iter()
            .map(|w| w.name.as_str())
            .collect();
        assert_eq!(allowed, ["Travail"]);
        assert!(!workspaces.is_allowed(&name("Notes")));
    }
}
