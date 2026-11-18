//! Les espaces de travail : en ajouter, en ouvrir un, rouvrir le dernier au lancement, en
//! renommer, en retirer. Ni renommer ni retirer ne touche aux fichiers.

use std::sync::Arc;

use crate::{
    AppError, NoteStore, Preferences, Workspace, WorkspaceLocation, WorkspaceName, WorkspaceOpener,
    Workspaces,
};

/// Un espace de travail ouvert : son nom, son dossier et ses notes.
#[derive(Debug)]
pub struct OpenedWorkspace {
    /// L'espace de travail.
    pub workspace: Workspace,
    /// Ses notes.
    pub store: Arc<dyn NoteStore>,
}

/// Les cas d'usage des espaces de travail, branchés sur l'ouvreur et les préférences.
#[derive(Debug)]
pub struct ManageWorkspaces<'a> {
    opener: &'a dyn WorkspaceOpener,
    preferences: &'a dyn Preferences,
}

impl<'a> ManageWorkspaces<'a> {
    /// Les cas d'usage, branchés sur l'ouvreur d'espaces de travail et les préférences.
    #[must_use]
    pub fn new(opener: &'a dyn WorkspaceOpener, preferences: &'a dyn Preferences) -> Self {
        Self {
            opener,
            preferences,
        }
    }

    /// Les espaces de travail connus, et celui ouvert en dernier.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si les préférences ne peuvent pas être lues.
    pub fn list(&self) -> Result<Workspaces, AppError> {
        Ok(self.preferences.workspaces()?)
    }

    /// Ajoute l'espace de travail `name` sur le dossier `location`, et l'ouvre.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNameTaken`], [`AppError::WorkspaceFolderTaken`] ; rien n'est gardé
    /// si le dossier ne s'ouvre pas ([`AppError::StorageUnavailable`]).
    pub fn add(
        &self,
        name: WorkspaceName,
        location: WorkspaceLocation,
    ) -> Result<OpenedWorkspace, AppError> {
        let workspace = Workspace { name, location };
        let next = self.list()?.added(workspace.clone())?;
        let store = self.opener.open(&workspace.location)?;
        self.preferences.save_workspaces(&next)?;
        Ok(OpenedWorkspace { workspace, store })
    }

    /// Ouvre l'espace de travail `name` ; il sera rouvert au prochain lancement.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`], ou [`AppError::StorageUnavailable`] si son dossier ne
    /// s'ouvre pas ou si les préférences ne peuvent pas être écrites.
    pub fn open(&self, name: &WorkspaceName) -> Result<OpenedWorkspace, AppError> {
        let workspaces = self.list()?;
        let workspace = workspaces.find(name)?.clone();
        let store = self.opener.open(&workspace.location)?;
        self.preferences
            .save_workspaces(&workspaces.activated(&workspace.name)?)?;
        Ok(OpenedWorkspace { workspace, store })
    }

    /// Rouvre l'espace de travail ouvert en dernier ; rien s'il n'y en a pas.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si les préférences ne peuvent pas être lues ou si son
    /// dossier ne s'ouvre plus.
    pub fn reopen_last(&self) -> Result<Option<OpenedWorkspace>, AppError> {
        let Some(workspace) = self.list()?.active().cloned() else {
            return Ok(None);
        };
        let store = self.opener.open(&workspace.location)?;
        Ok(Some(OpenedWorkspace { workspace, store }))
    }

    /// Renomme l'espace de travail `name` ; rend le nom gardé.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`], [`AppError::WorkspaceNameTaken`], ou
    /// [`AppError::StorageUnavailable`] si les préférences ne peuvent pas être écrites.
    pub fn rename(
        &self,
        name: &WorkspaceName,
        new_name: WorkspaceName,
    ) -> Result<WorkspaceName, AppError> {
        let next = self.list()?.renamed(name, new_name.clone())?;
        self.preferences.save_workspaces(&next)?;
        Ok(new_name)
    }

    /// Retire l'espace de travail `name` de la liste ; son dossier reste tel quel.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`], [`AppError::OpenWorkspaceKept`], ou
    /// [`AppError::StorageUnavailable`] si les préférences ne peuvent pas être écrites.
    pub fn remove(&self, name: &WorkspaceName) -> Result<(), AppError> {
        let next = self.list()?.removed(name)?;
        Ok(self.preferences.save_workspaces(&next)?)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::StoreError;
    use crate::testing::{FakeOpener, FakePreferences, InMemoryNoteStore};

    /// Un ouvreur qui ne trouve rien au dossier `/absent`.
    #[derive(Debug)]
    struct Opener(FakeOpener);

    impl WorkspaceOpener for Opener {
        fn open(&self, location: &WorkspaceLocation) -> Result<Arc<dyn NoteStore>, StoreError> {
            if location.as_str() == "/absent" {
                Err(StoreError::Unavailable("dossier absent".into()))
            } else {
                self.0.open(location)
            }
        }
    }

    fn opener() -> Opener {
        Opener(FakeOpener::new(Arc::new(InMemoryNoteStore::default())))
    }

    fn name(text: &str) -> WorkspaceName {
        WorkspaceName::new(text).unwrap()
    }

    fn location(path: &str) -> WorkspaceLocation {
        WorkspaceLocation::new(path).unwrap()
    }

    fn names(preferences: &FakePreferences) -> Vec<String> {
        let workspaces = preferences.workspaces().unwrap();
        workspaces
            .list()
            .iter()
            .map(|w| w.name.as_str().to_owned())
            .collect()
    }

    fn active(preferences: &FakePreferences) -> Option<String> {
        let workspaces = preferences.workspaces().unwrap();
        workspaces.active().map(|w| w.name.as_str().to_owned())
    }

    /// « Notes » puis « Travail », ouvert en dernier.
    fn two(opener: &Opener, preferences: &FakePreferences) {
        let manage = ManageWorkspaces::new(opener, preferences);
        manage.add(name("Notes"), location("/notes")).unwrap();
        manage.add(name("Travail"), location("/travail")).unwrap();
    }

    #[test]
    fn an_added_workspace_is_opened_and_remembered() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        let opened = ManageWorkspaces::new(&opener, &preferences)
            .add(name("Notes"), location("/notes"))
            .unwrap();
        assert_eq!(opened.workspace.name, name("Notes"));
        assert_eq!(opened.workspace.location, location("/notes"));
        assert_eq!(names(&preferences), ["Notes"]);
        assert_eq!(active(&preferences), Some("Notes".into()));
    }

    #[test]
    fn a_folder_that_does_not_open_is_not_added() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        let manage = ManageWorkspaces::new(&opener, &preferences);
        assert!(matches!(
            manage.add(name("Absent"), location("/absent")),
            Err(AppError::StorageUnavailable(_))
        ));
        assert!(names(&preferences).is_empty());
    }

    #[test]
    fn a_taken_name_or_folder_is_refused() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let manage = ManageWorkspaces::new(&opener, &preferences);
        assert!(matches!(
            manage.add(name("notes"), location("/autre")),
            Err(AppError::WorkspaceNameTaken(_))
        ));
        assert!(matches!(
            manage.add(name("Autre"), location("/travail")),
            Err(AppError::WorkspaceFolderTaken(_))
        ));
    }

    #[test]
    fn opening_a_workspace_by_name_makes_it_the_one_reopened() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let manage = ManageWorkspaces::new(&opener, &preferences);
        let opened = manage.open(&name("notes")).unwrap();
        assert_eq!(opened.workspace.location, location("/notes"));
        assert_eq!(active(&preferences), Some("Notes".into()));
        let reopened = manage.reopen_last().unwrap().unwrap();
        assert_eq!(reopened.workspace.name, name("Notes"));
    }

    #[test]
    fn a_workspace_whose_folder_does_not_open_stays_closed() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let workspaces = preferences
            .workspaces()
            .unwrap()
            .added(Workspace {
                name: name("Absent"),
                location: location("/absent"),
            })
            .unwrap()
            .activated(&name("Travail"))
            .unwrap();
        preferences.save_workspaces(&workspaces).unwrap();
        let manage = ManageWorkspaces::new(&opener, &preferences);
        assert!(manage.open(&name("Absent")).is_err());
        assert_eq!(active(&preferences), Some("Travail".into()));
        assert!(matches!(
            manage.open(&name("Perso")),
            Err(AppError::WorkspaceNotFound(_))
        ));
    }

    #[test]
    fn nothing_is_reopened_at_first_launch() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        let manage = ManageWorkspaces::new(&opener, &preferences);
        assert!(manage.reopen_last().unwrap().is_none());
        assert!(manage.list().unwrap().list().is_empty());
    }

    #[test]
    fn renaming_keeps_the_folder_and_gives_back_the_new_name() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let manage = ManageWorkspaces::new(&opener, &preferences);
        let kept = manage.rename(&name("travail"), name(" Bureau ")).unwrap();
        assert_eq!(kept, name("Bureau"));
        assert_eq!(names(&preferences), ["Notes", "Bureau"]);
        let reopened = manage.reopen_last().unwrap().unwrap();
        assert_eq!(reopened.workspace.location, location("/travail"));
        assert!(manage.rename(&name("Bureau"), name("notes")).is_err());
    }

    #[test]
    fn a_removed_workspace_is_forgotten_but_not_the_open_one() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let manage = ManageWorkspaces::new(&opener, &preferences);
        manage.remove(&name("Notes")).unwrap();
        assert_eq!(names(&preferences), ["Travail"]);
        assert!(matches!(
            manage.remove(&name("Travail")),
            Err(AppError::OpenWorkspaceKept(_))
        ));
        assert_eq!(names(&preferences), ["Travail"]);
    }
}
