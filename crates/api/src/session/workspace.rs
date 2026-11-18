//! Ouvrir un espace de travail, et rouvrir le dernier au lancement.

use std::path::Path;

use application::WorkspaceLocation;
use application::use_cases::{OpenWorkspace, ReopenLastWorkspace};

use super::Session;
use crate::{ApiError, WorkspaceInfo};

impl Session {
    /// Rouvre le dernier espace de travail ; rien au premier lancement.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; préférences illisibles,
    /// espace de travail introuvable.
    pub fn reopen_last_workspace(&self) -> Result<Option<WorkspaceInfo>, ApiError> {
        let reopened = ReopenLastWorkspace::new(&*self.opener, &*self.preferences).execute()?;
        Ok(reopened.map(|opened| self.keep(&opened.location, opened.store)))
    }

    /// Ouvre l'espace de travail choisi et s'en souvient.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; dossier introuvable,
    /// préférences impossibles à écrire.
    pub fn open_workspace(&self, location: WorkspaceLocation) -> Result<WorkspaceInfo, ApiError> {
        let store = OpenWorkspace::new(&*self.opener, &*self.preferences).execute(&location)?;
        Ok(self.keep(&location, store))
    }

    /// Ouvre le dossier choisi dans la fenêtre de choix ; rien si l'utilisateur a annulé.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom de dossier illisible,
    /// emplacement vide, dossier introuvable, préférences impossibles à écrire.
    pub fn open_chosen_folder(
        &self,
        folder: Option<&Path>,
    ) -> Result<Option<WorkspaceInfo>, ApiError> {
        let Some(folder) = folder else {
            return Ok(None);
        };
        let location = folder
            .to_str()
            .ok_or_else(|| ApiError::unreadable_folder_name(folder))?;
        self.open_workspace(WorkspaceLocation::new(location)?)
            .map(Some)
    }
}

pub(super) fn workspace_info(location: &WorkspaceLocation) -> WorkspaceInfo {
    let path = location.as_str().to_owned();
    let name = Path::new(&path)
        .file_name()
        .map_or_else(|| path.clone(), |n| n.to_string_lossy().into_owned());
    WorkspaceInfo { name, path }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::Preferences;
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

    #[test]
    fn opening_a_workspace_tells_its_name() {
        let session = session_with(&[]);
        let info = session
            .open_workspace(WorkspaceLocation::new("/Users/moi/Notes").unwrap())
            .unwrap();
        assert_eq!(info.name, "Notes");
        assert_eq!(info.path, "/Users/moi/Notes");
    }

    #[test]
    fn cancelling_the_folder_picker_opens_nothing() {
        let session = session_with(&[]);
        assert_eq!(session.open_chosen_folder(None).unwrap(), None);
        assert!(session.list_notes("", RECENT).is_err());
    }

    #[test]
    fn the_chosen_folder_becomes_the_open_workspace() {
        let session = session_with(&[]);
        let info = session
            .open_chosen_folder(Some(Path::new("/Users/moi/Notes")))
            .unwrap();
        assert_eq!(info.map(|i| i.name), Some("Notes".into()));
    }

    #[test]
    fn a_folder_name_that_is_not_text_is_refused() {
        use std::ffi::OsStr;
        use std::os::unix::ffi::OsStrExt;
        let session = session_with(&[]);
        let folder = Path::new(OsStr::from_bytes(b"/Users/moi/\xff"));
        let error = session.open_chosen_folder(Some(folder)).unwrap_err();
        assert_eq!(
            error.message,
            "le nom du dossier « /Users/moi/\u{FFFD} » est illisible"
        );
    }

    #[test]
    fn an_empty_folder_path_is_refused() {
        let session = session_with(&[]);
        let error = session.open_chosen_folder(Some(Path::new(""))).unwrap_err();
        assert_eq!(
            error.message,
            "l'emplacement de l'espace de travail est vide"
        );
    }

    #[test]
    fn last_workspace_is_reopened() {
        let preferences = FakePreferences::default();
        preferences
            .remember_workspace(&WorkspaceLocation::new("/Users/moi/Notes").unwrap())
            .unwrap();
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
        let session = Session::new(
            Arc::new(opener),
            Arc::new(preferences),
            Arc::new(FixedClock::default()),
        );
        assert_eq!(
            session.reopen_last_workspace().unwrap().map(|i| i.name),
            Some("Notes".into())
        );
        assert!(session.list_notes("", RECENT).is_ok());
    }
}
