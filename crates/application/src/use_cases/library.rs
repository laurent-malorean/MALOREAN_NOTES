//! Ouvrir une bibliothèque, et rouvrir la dernière au lancement.

use std::sync::Arc;

use crate::{AppError, LibraryLocation, LibraryOpener, NoteStore, Preferences};

/// Ouvre la bibliothèque choisie et s'en souvient pour le prochain lancement.
pub struct OpenLibrary<'a> {
    opener: &'a dyn LibraryOpener,
    preferences: &'a dyn Preferences,
}

impl<'a> OpenLibrary<'a> {
    #[must_use]
    pub fn new(opener: &'a dyn LibraryOpener, preferences: &'a dyn Preferences) -> Self {
        Self {
            opener,
            preferences,
        }
    }

    pub fn execute(&self, location: &LibraryLocation) -> Result<Arc<dyn NoteStore>, AppError> {
        let store = self.opener.open(location)?;
        self.preferences.remember_library(location)?;
        Ok(store)
    }
}

/// Une bibliothèque rouverte : son emplacement et ses notes.
pub struct OpenedLibrary {
    pub location: LibraryLocation,
    pub store: Arc<dyn NoteStore>,
}

/// Rouvre la dernière bibliothèque, s'il y en a une.
pub struct ReopenLastLibrary<'a> {
    opener: &'a dyn LibraryOpener,
    preferences: &'a dyn Preferences,
}

impl<'a> ReopenLastLibrary<'a> {
    #[must_use]
    pub fn new(opener: &'a dyn LibraryOpener, preferences: &'a dyn Preferences) -> Self {
        Self {
            opener,
            preferences,
        }
    }

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
