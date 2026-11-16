//! Ouvrir une bibliothèque, et rouvrir la dernière au lancement.

use std::sync::Arc;

use crate::{AppError, LibraryLocation, LibraryOpener, NoteStore, Preferences};

/// Ouvre la bibliothèque choisie et s'en souvient pour le prochain lancement.
#[derive(Debug)]
pub struct OpenLibrary<'a> {
    opener: &'a dyn LibraryOpener,
    preferences: &'a dyn Preferences,
}

impl<'a> OpenLibrary<'a> {
    /// Le cas d'usage, branché sur l'ouvreur de bibliothèques et les préférences.
    #[must_use]
    pub fn new(opener: &'a dyn LibraryOpener, preferences: &'a dyn Preferences) -> Self {
        Self {
            opener,
            preferences,
        }
    }

    /// Les notes de la bibliothèque ouverte.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si la bibliothèque ne peut pas être ouverte
    /// ou si les préférences ne peuvent pas être écrites.
    pub fn execute(&self, location: &LibraryLocation) -> Result<Arc<dyn NoteStore>, AppError> {
        let store = self.opener.open(location)?;
        self.preferences.remember_library(location)?;
        Ok(store)
    }
}

/// Une bibliothèque rouverte : son emplacement et ses notes.
#[derive(Debug)]
pub struct OpenedLibrary {
    /// L'emplacement de la bibliothèque.
    pub location: LibraryLocation,
    /// Ses notes.
    pub store: Arc<dyn NoteStore>,
}

/// Rouvre la dernière bibliothèque, s'il y en a une.
#[derive(Debug)]
pub struct ReopenLastLibrary<'a> {
    opener: &'a dyn LibraryOpener,
    preferences: &'a dyn Preferences,
}

impl<'a> ReopenLastLibrary<'a> {
    /// Le cas d'usage, branché sur l'ouvreur de bibliothèques et les préférences.
    #[must_use]
    pub fn new(opener: &'a dyn LibraryOpener, preferences: &'a dyn Preferences) -> Self {
        Self {
            opener,
            preferences,
        }
    }

    /// La dernière bibliothèque, rouverte ; rien au premier lancement.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si les préférences ne peuvent pas être lues
    /// ou si la bibliothèque ne peut plus être ouverte.
    pub fn execute(&self) -> Result<Option<OpenedLibrary>, AppError> {
        let Some(location) = self.preferences.last_library()? else {
            return Ok(None);
        };
        let store = self.opener.open(&location)?;
        Ok(Some(OpenedLibrary { location, store }))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::testing::{FakeOpener, FakePreferences, InMemoryNoteStore};

    fn location(path: &str) -> LibraryLocation {
        LibraryLocation::new(path).unwrap()
    }

    #[test]
    fn opened_library_is_remembered() {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
        let preferences = FakePreferences::default();
        OpenLibrary::new(&opener, &preferences)
            .execute(&location("/notes"))
            .unwrap();
        assert_eq!(
            preferences.last_library().unwrap(),
            Some(location("/notes"))
        );
    }

    #[test]
    fn last_library_is_reopened_at_launch() {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
        let preferences = FakePreferences::default();
        preferences.remember_library(&location("/notes")).unwrap();
        let reopened = ReopenLastLibrary::new(&opener, &preferences)
            .execute()
            .unwrap();
        assert_eq!(
            reopened.map(|opened| opened.location),
            Some(location("/notes"))
        );
    }

    #[test]
    fn first_launch_has_no_library() {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
        let preferences = FakePreferences::default();
        let reopened = ReopenLastLibrary::new(&opener, &preferences)
            .execute()
            .unwrap();
        assert!(reopened.is_none());
    }
}
