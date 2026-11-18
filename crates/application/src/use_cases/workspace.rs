//! Ouvrir un espace de travail, et rouvrir la dernière au lancement.

use std::sync::Arc;

use crate::{AppError, NoteStore, Preferences, WorkspaceLocation, WorkspaceOpener};

/// Ouvre l'espace de travail choisi et s'en souvient pour le prochain lancement.
#[derive(Debug)]
pub struct OpenWorkspace<'a> {
    opener: &'a dyn WorkspaceOpener,
    preferences: &'a dyn Preferences,
}

impl<'a> OpenWorkspace<'a> {
    /// Le cas d'usage, branché sur l'ouvreur d'espaces de travail et les préférences.
    #[must_use]
    pub fn new(opener: &'a dyn WorkspaceOpener, preferences: &'a dyn Preferences) -> Self {
        Self {
            opener,
            preferences,
        }
    }

    /// Les notes de l'espace de travail ouvert.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'espace de travail ne peut pas être ouvert
    /// ou si les préférences ne peuvent pas être écrites.
    pub fn execute(&self, location: &WorkspaceLocation) -> Result<Arc<dyn NoteStore>, AppError> {
        let store = self.opener.open(location)?;
        self.preferences.remember_workspace(location)?;
        Ok(store)
    }
}

/// Un espace de travail rouvert : son emplacement et ses notes.
#[derive(Debug)]
pub struct OpenedWorkspace {
    /// L'emplacement de l'espace de travail.
    pub location: WorkspaceLocation,
    /// Ses notes.
    pub store: Arc<dyn NoteStore>,
}

/// Rouvre le dernier espace de travail, s'il y en a une.
#[derive(Debug)]
pub struct ReopenLastWorkspace<'a> {
    opener: &'a dyn WorkspaceOpener,
    preferences: &'a dyn Preferences,
}

impl<'a> ReopenLastWorkspace<'a> {
    /// Le cas d'usage, branché sur l'ouvreur d'espaces de travail et les préférences.
    #[must_use]
    pub fn new(opener: &'a dyn WorkspaceOpener, preferences: &'a dyn Preferences) -> Self {
        Self {
            opener,
            preferences,
        }
    }

    /// Le dernier espace de travail, rouvert ; rien au premier lancement.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si les préférences ne peuvent pas être lues
    /// ou si l'espace de travail ne peut plus être ouvert.
    pub fn execute(&self) -> Result<Option<OpenedWorkspace>, AppError> {
        let Some(location) = self.preferences.last_workspace()? else {
            return Ok(None);
        };
        let store = self.opener.open(&location)?;
        Ok(Some(OpenedWorkspace { location, store }))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::testing::{FakeOpener, FakePreferences, InMemoryNoteStore};

    fn location(path: &str) -> WorkspaceLocation {
        WorkspaceLocation::new(path).unwrap()
    }

    #[test]
    fn opened_workspace_is_remembered() {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
        let preferences = FakePreferences::default();
        OpenWorkspace::new(&opener, &preferences)
            .execute(&location("/notes"))
            .unwrap();
        assert_eq!(
            preferences.last_workspace().unwrap(),
            Some(location("/notes"))
        );
    }

    #[test]
    fn last_workspace_is_reopened_at_launch() {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
        let preferences = FakePreferences::default();
        preferences.remember_workspace(&location("/notes")).unwrap();
        let reopened = ReopenLastWorkspace::new(&opener, &preferences)
            .execute()
            .unwrap();
        assert_eq!(
            reopened.map(|opened| opened.location),
            Some(location("/notes"))
        );
    }

    #[test]
    fn first_launch_has_no_workspace() {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
        let preferences = FakePreferences::default();
        let reopened = ReopenLastWorkspace::new(&opener, &preferences)
            .execute()
            .unwrap();
        assert!(reopened.is_none());
    }
}
