//! Les espaces de travail : en ajouter, en ouvrir un, rouvrir le dernier au lancement, en
//! renommer, en retirer. Ni renommer ni retirer ne touche aux fichiers.

use std::sync::Arc;

use domain::Folder;

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

    /// Ouvre l'espace de travail `name`, **autorisé pour les IA**, sans en faire l'espace ouvert :
    /// les préférences ne changent pas, l'espace ouvert en dernier reste celui de l'utilisateur
    /// (fiche 0074). L'autorisation est relue à chaque appel.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotAllowed`] si aucun espace autorisé ne porte ce nom (inconnu ou non
    /// autorisé : la même erreur), ou [`AppError::StorageUnavailable`] si son dossier ne s'ouvre
    /// pas.
    pub fn open_in_background(&self, name: &WorkspaceName) -> Result<OpenedWorkspace, AppError> {
        let workspace = self.list()?.allowed_named(name)?.clone();
        let store = self.opener.open(&workspace.location)?;
        Ok(OpenedWorkspace { workspace, store })
    }

    /// Autorise les IA à se servir de l'espace de travail `name` (fiche 0074).
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`], ou [`AppError::StorageUnavailable`] si les préférences ne
    /// peuvent pas être écrites.
    pub fn allow(&self, name: &WorkspaceName) -> Result<(), AppError> {
        let next = self.list()?.allowing(name)?;
        Ok(self.preferences.save_workspaces(&next)?)
    }

    /// Le dossier des modèles de l'espace de travail `name`, s'il en a choisi un (fiche 0077).
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`], ou [`AppError::StorageUnavailable`] si les préférences ne
    /// peuvent pas être lues.
    pub fn templates_folder(&self, name: &WorkspaceName) -> Result<Option<Folder>, AppError> {
        let workspaces = self.list()?;
        let workspace = workspaces.find(name)?;
        Ok(workspaces.templates_folder(&workspace.name).cloned())
    }

    /// Choisit le dossier des modèles de l'espace de travail `name` (aucun pour `None`), gardé
    /// avec les préférences (fiche 0077).
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`], ou [`AppError::StorageUnavailable`] si les préférences ne
    /// peuvent pas être écrites.
    pub fn choose_templates_folder(
        &self,
        name: &WorkspaceName,
        folder: Option<Folder>,
    ) -> Result<(), AppError> {
        let next = self.list()?.choosing_templates_folder(name, folder)?;
        Ok(self.preferences.save_workspaces(&next)?)
    }

    /// Reprend les dossiers des modèles que l'interface gardait avant la fiche 0077, chacun pour
    /// l'espace de travail qui a ce dossier (`location`). Un espace qui a déjà son dossier des
    /// modèles le garde ; un dossier d'un espace inconnu est oublié. Rien n'est écrit s'il n'y a
    /// rien à reprendre. Rend le nombre d'espaces repris.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si les préférences ne peuvent pas être lues ou écrites.
    pub fn import_templates_folders(
        &self,
        chosen: &[(WorkspaceLocation, Folder)],
    ) -> Result<usize, AppError> {
        let mut workspaces = self.list()?;
        let mut imported = 0;
        for workspace in workspaces.list().to_vec() {
            if workspaces.templates_folder(&workspace.name).is_some() {
                continue;
            }
            let Some((_, folder)) = chosen.iter().find(|(at, _)| *at == workspace.location) else {
                continue;
            };
            workspaces =
                workspaces.choosing_templates_folder(&workspace.name, Some(folder.clone()))?;
            imported += 1;
        }
        if imported > 0 {
            self.preferences.save_workspaces(&workspaces)?;
        }
        Ok(imported)
    }

    /// N'autorise plus les IA à se servir de l'espace de travail `name`.
    ///
    /// # Errors
    ///
    /// [`AppError::WorkspaceNotFound`], ou [`AppError::StorageUnavailable`] si les préférences ne
    /// peuvent pas être écrites.
    pub fn forbid(&self, name: &WorkspaceName) -> Result<(), AppError> {
        let next = self.list()?.forbidding(name)?;
        Ok(self.preferences.save_workspaces(&next)?)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use domain::external_servers::ServerName;
    use domain::voice_shortcut::VoiceShortcut;

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

    #[test]
    fn allowing_and_forbidding_a_workspace_is_remembered_and_leaves_the_rest_alone() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let manage = ManageWorkspaces::new(&opener, &preferences);
        manage.allow(&name("notes")).unwrap();
        let workspaces = manage.list().unwrap();
        assert!(workspaces.is_allowed(&name("Notes")));
        assert!(!workspaces.is_allowed(&name("Travail")));
        assert_eq!(active(&preferences), Some("Travail".into()));
        manage.forbid(&name("Notes")).unwrap();
        assert!(manage.list().unwrap().allowed().is_empty());
        assert!(matches!(
            manage.allow(&name("Perso")),
            Err(AppError::WorkspaceNotFound(_))
        ));
        assert!(matches!(
            manage.forbid(&name("Perso")),
            Err(AppError::WorkspaceNotFound(_))
        ));
    }

    #[test]
    fn an_allowed_workspace_opens_in_the_background_without_becoming_the_open_one() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let manage = ManageWorkspaces::new(&opener, &preferences);
        manage.allow(&name("notes")).unwrap();
        let before = preferences.workspaces().unwrap();
        let opened = manage.open_in_background(&name("NOTES")).unwrap();
        assert_eq!(opened.workspace.name, name("Notes"));
        assert_eq!(opened.workspace.location, location("/notes"));
        assert_eq!(preferences.workspaces().unwrap(), before);
        assert_eq!(active(&preferences), Some("Travail".into()));
    }

    #[test]
    fn a_workspace_that_is_not_allowed_or_unknown_does_not_open_in_the_background() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let manage = ManageWorkspaces::new(&opener, &preferences);
        manage.allow(&name("Travail")).unwrap();
        for refused in ["Notes", "Perso"] {
            assert_eq!(
                manage.open_in_background(&name(refused)).unwrap_err(),
                AppError::WorkspaceNotAllowed {
                    name: refused.into(),
                    allowed: vec!["Travail".into()],
                }
            );
        }
    }

    #[test]
    fn an_allowed_workspace_whose_folder_does_not_open_is_an_error() {
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
            .allowing(&name("Absent"))
            .unwrap();
        preferences.save_workspaces(&workspaces).unwrap();
        let manage = ManageWorkspaces::new(&opener, &preferences);
        assert!(matches!(
            manage.open_in_background(&name("Absent")),
            Err(AppError::StorageUnavailable(_))
        ));
    }

    fn folder(path: &str) -> Folder {
        Folder::parse(path).unwrap()
    }

    #[test]
    fn a_chosen_templates_folder_is_remembered_for_that_workspace_only() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let manage = ManageWorkspaces::new(&opener, &preferences);
        assert_eq!(manage.templates_folder(&name("notes")).unwrap(), None);
        manage
            .choose_templates_folder(&name("NOTES"), Some(folder("Modèles")))
            .unwrap();
        assert_eq!(
            manage.templates_folder(&name("Notes")).unwrap(),
            Some(folder("Modèles"))
        );
        assert_eq!(manage.templates_folder(&name("Travail")).unwrap(), None);
        assert_eq!(active(&preferences), Some("Travail".into()));
        manage
            .choose_templates_folder(&name("Notes"), None)
            .unwrap();
        assert_eq!(manage.templates_folder(&name("Notes")).unwrap(), None);
    }

    #[test]
    fn the_templates_folder_of_an_unknown_workspace_is_refused() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let manage = ManageWorkspaces::new(&opener, &preferences);
        let unknown = AppError::WorkspaceNotFound("Perso".into());
        assert_eq!(
            manage.templates_folder(&name("Perso")),
            Err(unknown.clone())
        );
        assert_eq!(
            manage.choose_templates_folder(&name("Perso"), Some(folder("A"))),
            Err(unknown)
        );
    }

    #[test]
    fn the_folders_the_interface_kept_are_taken_for_the_workspace_that_has_that_folder() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let manage = ManageWorkspaces::new(&opener, &preferences);
        let imported = manage
            .import_templates_folders(&[
                (location("/travail"), folder("Gabarits")),
                (location("/ailleurs"), folder("X")),
            ])
            .unwrap();
        assert_eq!(imported, 1);
        assert_eq!(
            manage.templates_folder(&name("Travail")).unwrap(),
            Some(folder("Gabarits"))
        );
        assert_eq!(manage.templates_folder(&name("Notes")).unwrap(), None);
    }

    #[test]
    fn a_workspace_that_already_has_its_templates_folder_keeps_it_when_the_interface_brings_one() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let manage = ManageWorkspaces::new(&opener, &preferences);
        manage
            .choose_templates_folder(&name("Notes"), Some(folder("Modèles")))
            .unwrap();
        let imported = manage
            .import_templates_folders(&[(location("/notes"), folder("Vieux"))])
            .unwrap();
        assert_eq!(imported, 0);
        assert_eq!(
            manage.templates_folder(&name("Notes")).unwrap(),
            Some(folder("Modèles"))
        );
    }

    /// Des préférences qui se lisent mais ne s'écrivent plus.
    #[derive(Debug)]
    struct Unwritable(FakePreferences);

    impl Preferences for Unwritable {
        fn workspaces(&self) -> Result<Workspaces, StoreError> {
            self.0.workspaces()
        }
        fn save_workspaces(&self, _: &Workspaces) -> Result<(), StoreError> {
            Err(StoreError::Unavailable("lecture seule".into()))
        }
        fn meaning_model(&self) -> Result<domain::MeaningModel, StoreError> {
            self.0.meaning_model()
        }
        fn save_meaning_model(&self, model: domain::MeaningModel) -> Result<(), StoreError> {
            self.0.save_meaning_model(model)
        }
        fn voice_language(&self) -> Result<Option<String>, StoreError> {
            self.0.voice_language()
        }
        fn save_voice_language(&self, language: Option<&str>) -> Result<(), StoreError> {
            self.0.save_voice_language(language)
        }
        fn voice_shortcut(&self) -> Result<VoiceShortcut, StoreError> {
            self.0.voice_shortcut()
        }
        fn save_voice_shortcut(&self, shortcut: &VoiceShortcut) -> Result<(), StoreError> {
            self.0.save_voice_shortcut(shortcut)
        }
        fn voice_beeps(&self) -> Result<bool, StoreError> {
            self.0.voice_beeps()
        }
        fn save_voice_beeps(&self, beeps: bool) -> Result<(), StoreError> {
            self.0.save_voice_beeps(beeps)
        }
        fn allowed_servers(&self) -> Result<Vec<ServerName>, StoreError> {
            self.0.allowed_servers()
        }
        fn save_allowed_servers(&self, servers: &[ServerName]) -> Result<(), StoreError> {
            self.0.save_allowed_servers(servers)
        }
    }

    #[test]
    fn nothing_is_written_when_there_is_nothing_to_take() {
        let (opener, preferences) = (opener(), FakePreferences::default());
        two(&opener, &preferences);
        let unwritable = Unwritable(preferences);
        let manage = ManageWorkspaces::new(&opener, &unwritable);
        assert_eq!(manage.import_templates_folders(&[]).unwrap(), 0);
        assert_eq!(
            manage
                .import_templates_folders(&[(location("/ailleurs"), folder("X"))])
                .unwrap(),
            0
        );
        assert!(matches!(
            manage.import_templates_folders(&[(location("/notes"), folder("X"))]),
            Err(AppError::StorageUnavailable(_))
        ));
    }
}
