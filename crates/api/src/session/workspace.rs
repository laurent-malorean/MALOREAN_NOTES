//! Les espaces de travail : en ajouter, en ouvrir un par son nom, rouvrir le dernier au lancement,
//! en renommer, en retirer. La page désigne un espace par son nom ; seul l'ajout reçoit un dossier.

use std::path::Path;

use application::use_cases::{ManageWorkspaces, OpenedWorkspace};
use application::{WorkspaceLocation, WorkspaceName};

use super::Session;
use crate::{ApiError, ChosenFolder, WorkspaceInfo, WorkspaceItem};

impl Session {
    fn manage(&self) -> ManageWorkspaces<'_> {
        ManageWorkspaces::new(&*self.opener, &*self.preferences)
    }

    /// Rouvre l'espace de travail ouvert en dernier ; rien au premier lancement.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; préférences illisibles,
    /// dossier introuvable.
    pub fn reopen_last_workspace(&self) -> Result<Option<WorkspaceInfo>, ApiError> {
        let reopened = self.manage().reopen_last()?;
        Ok(reopened.map(|opened| self.keep(opened)))
    }

    /// Les espaces de travail, dans l'ordre où on les a ajoutés ; l'ouvert est marqué.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; préférences illisibles.
    pub fn list_workspaces(&self) -> Result<Vec<WorkspaceItem>, ApiError> {
        let workspaces = self.manage().list()?;
        let active = workspaces.active().map(|w| w.name.clone());
        Ok(workspaces
            .list()
            .iter()
            .map(|w| WorkspaceItem {
                name: w.name.as_str().to_owned(),
                active: active.as_ref() == Some(&w.name),
            })
            .collect())
    }

    /// Le dossier choisi dans la fenêtre de choix, avec son nom, proposé pour l'espace de
    /// travail ; rien si l'utilisateur a annulé.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] si le nom du dossier n'est pas du texte.
    pub fn chosen_folder(&self, folder: Option<&Path>) -> Result<Option<ChosenFolder>, ApiError> {
        let Some(folder) = folder else {
            return Ok(None);
        };
        let path = folder
            .to_str()
            .ok_or_else(|| ApiError::unreadable_folder_name(folder))?;
        Ok(Some(ChosenFolder {
            name: folder_name(path),
            path: path.to_owned(),
        }))
    }

    /// Ajoute l'espace de travail `name` sur le dossier `folder`, et l'ouvre.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom vide ou pris, dossier vide,
    /// déjà pris ou introuvable, préférences impossibles à écrire.
    pub fn add_workspace(&self, name: &str, folder: &str) -> Result<WorkspaceInfo, ApiError> {
        let opened = self
            .manage()
            .add(WorkspaceName::new(name)?, WorkspaceLocation::new(folder)?)?;
        Ok(self.keep(opened))
    }

    /// Ouvre l'espace de travail `name` à la place de celui qui l'était.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom inconnu, dossier introuvable,
    /// préférences impossibles à écrire.
    pub fn open_workspace(&self, name: &str) -> Result<WorkspaceInfo, ApiError> {
        let opened = self.manage().open(&WorkspaceName::new(name)?)?;
        Ok(self.keep(opened))
    }

    /// Renomme l'espace de travail `name` ; son dossier ne change pas. Rend le nom gardé.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom inconnu, nouveau nom vide ou
    /// pris, préférences impossibles à écrire.
    pub fn rename_workspace(&self, name: &str, new_name: &str) -> Result<String, ApiError> {
        let name = WorkspaceName::new(name)?;
        let kept = self.manage().rename(&name, WorkspaceName::new(new_name)?)?;
        self.renamed(&name, &kept);
        Ok(kept.as_str().to_owned())
    }

    /// Retire l'espace de travail `name` de la liste ; ses fichiers ne sont pas touchés.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom inconnu, espace ouvert,
    /// préférences impossibles à écrire.
    pub fn remove_workspace(&self, name: &str) -> Result<(), ApiError> {
        Ok(self.manage().remove(&WorkspaceName::new(name)?)?)
    }
}

/// Ce que la page apprend de l'espace de travail ouvert : son nom, et son dossier pour les images.
pub(super) fn workspace_info(opened: &OpenedWorkspace) -> WorkspaceInfo {
    WorkspaceInfo {
        name: opened.workspace.name.as_str().to_owned(),
        path: opened.workspace.location.as_str().to_owned(),
    }
}

/// Le nom du dossier, dernier élément de son emplacement.
fn folder_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map_or_else(|| path.to_owned(), |n| n.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;
    use crate::NoteOrderItem;

    const RECENT: NoteOrderItem = NoteOrderItem::Modified;

    fn session_with(notes: &[(&str, &str)]) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
        Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        )
    }

    /// Une session qui connaît « Notes » puis « Travail », ouvert.
    fn two() -> Session {
        let session = session_with(&[]);
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        session
            .add_workspace("Travail", "/Users/moi/Travail")
            .unwrap();
        session
    }

    fn listed(session: &Session) -> Vec<(String, bool)> {
        session
            .list_workspaces()
            .unwrap()
            .into_iter()
            .map(|w| (w.name, w.active))
            .collect()
    }

    #[test]
    fn adding_a_workspace_opens_it_under_its_name() {
        let session = session_with(&[]);
        let info = session
            .add_workspace(" Mes notes ", "/Users/moi/Notes")
            .unwrap();
        assert_eq!(info.name, "Mes notes");
        assert_eq!(info.path, "/Users/moi/Notes");
        assert!(session.list_notes("", RECENT).is_ok());
    }

    #[test]
    fn workspaces_are_listed_in_order_with_the_open_one_marked() {
        assert_eq!(
            listed(&two()),
            [("Notes".into(), false), ("Travail".into(), true)]
        );
    }

    #[test]
    fn a_workspace_is_opened_by_its_name() {
        let session = two();
        let info = session.open_workspace("notes").unwrap();
        assert_eq!(info.name, "Notes");
        assert_eq!(info.path, "/Users/moi/Notes");
        assert_eq!(
            listed(&session),
            [("Notes".into(), true), ("Travail".into(), false)]
        );
    }

    #[test]
    fn the_last_opened_workspace_is_reopened() {
        let session = two();
        session.open_workspace("Notes").unwrap();
        assert_eq!(
            session.reopen_last_workspace().unwrap().map(|i| i.name),
            Some("Notes".into())
        );
    }

    #[test]
    fn nothing_is_reopened_at_first_launch() {
        let session = session_with(&[]);
        assert_eq!(session.reopen_last_workspace().unwrap(), None);
        assert!(session.list_workspaces().unwrap().is_empty());
        assert!(session.list_notes("", RECENT).is_err());
    }

    #[test]
    fn renaming_the_open_workspace_renames_it_on_screen_too() {
        let session = two();
        let kept = session.rename_workspace("travail", " Bureau ").unwrap();
        assert_eq!(kept, "Bureau");
        assert_eq!(
            listed(&session),
            [("Notes".into(), false), ("Bureau".into(), true)]
        );
        assert_eq!(session.opened().unwrap().name.as_str(), "Bureau");
    }

    #[test]
    fn renaming_another_workspace_leaves_the_open_one_as_it_is() {
        let session = two();
        session.rename_workspace("Notes", "Perso").unwrap();
        assert_eq!(session.opened().unwrap().name.as_str(), "Travail");
    }

    #[test]
    fn a_removed_workspace_leaves_the_list_but_not_the_open_one() {
        let session = two();
        session.remove_workspace("Notes").unwrap();
        assert_eq!(listed(&session), [("Travail".into(), true)]);
        assert_eq!(
            session.remove_workspace("Travail").unwrap_err().message,
            "l'espace de travail « Travail » est ouvert : passez à un autre avant de le retirer"
        );
    }

    #[test]
    fn bad_names_and_folders_from_the_page_are_refused() {
        let session = two();
        assert_eq!(
            session
                .add_workspace("Autre", "/Users/moi/Notes")
                .unwrap_err()
                .message,
            "ce dossier est déjà l'espace de travail « Notes »"
        );
        assert_eq!(
            session
                .add_workspace(" ", "/Users/moi/Autre")
                .unwrap_err()
                .message,
            "le nom de l'espace de travail est vide"
        );
        assert_eq!(
            session.add_workspace("Autre", "").unwrap_err().message,
            "l'emplacement de l'espace de travail est vide"
        );
        assert_eq!(
            session.open_workspace("Perso").unwrap_err().message,
            "aucun espace de travail ne s'appelle « Perso »"
        );
        assert!(session.rename_workspace("Notes", "travail").is_err());
        assert!(session.rename_workspace("Notes", "").is_err());
        assert!(session.remove_workspace("").is_err());
    }

    #[test]
    fn the_chosen_folder_is_proposed_under_its_name() {
        let session = session_with(&[]);
        assert_eq!(session.chosen_folder(None).unwrap(), None);
        let chosen = session
            .chosen_folder(Some(Path::new("/Users/moi/Notes")))
            .unwrap()
            .unwrap();
        assert_eq!(
            (chosen.name.as_str(), chosen.path.as_str()),
            ("Notes", "/Users/moi/Notes")
        );
        let root = session
            .chosen_folder(Some(Path::new("/")))
            .unwrap()
            .unwrap();
        assert_eq!(root.name, "/");
    }

    #[test]
    fn a_folder_name_that_is_not_text_is_refused() {
        use std::ffi::OsStr;
        use std::os::unix::ffi::OsStrExt;
        let session = session_with(&[]);
        let folder = Path::new(OsStr::from_bytes(b"/Users/moi/\xff"));
        let error = session.chosen_folder(Some(folder)).unwrap_err();
        assert_eq!(
            error.message,
            "le nom du dossier « /Users/moi/\u{FFFD} » est illisible"
        );
    }
}
