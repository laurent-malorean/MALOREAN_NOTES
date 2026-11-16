//! La bibliothèque ouverte et les cas d'usage qu'on lui applique.

use std::path::PathBuf;
use std::sync::{Arc, PoisonError, RwLock};

use application::use_cases::{
    CreateNote, ListNotes, OpenLibrary, ReadNote, ReopenLastLibrary, SaveNote,
};
use application::{AppError, LibraryLocation, LibraryOpener, NoteStore, Preferences};
use domain::FileName;

use crate::{ApiError, LibraryInfo, NoteContent, NoteListItem, SavedNote};

/// État partagé par les commandes : les adaptateurs et la bibliothèque ouverte.
pub struct Session {
    opener: Arc<dyn LibraryOpener>,
    preferences: Arc<dyn Preferences>,
    library: RwLock<Option<Arc<dyn NoteStore>>>,
}

impl Session {
    #[must_use]
    pub fn new(opener: Arc<dyn LibraryOpener>, preferences: Arc<dyn Preferences>) -> Self {
        Self {
            opener,
            preferences,
            library: RwLock::new(None),
        }
    }

    pub fn reopen_last_library(&self) -> Result<Option<LibraryInfo>, ApiError> {
        let reopened = ReopenLastLibrary::new(&*self.opener, &*self.preferences).execute()?;
        Ok(reopened.map(|opened| self.keep(&opened.location, opened.store)))
    }

    pub fn open_library(&self, path: PathBuf) -> Result<LibraryInfo, ApiError> {
        let location = LibraryLocation(path);
        let store = OpenLibrary::new(&*self.opener, &*self.preferences).execute(&location)?;
        Ok(self.keep(&location, store))
    }

    pub fn list_notes(&self) -> Result<Vec<NoteListItem>, ApiError> {
        let store = self.store()?;
        let notes = ListNotes::new(&*store).execute()?;
        Ok(notes
            .into_iter()
            .map(|n| NoteListItem {
                file_name: n.file_name.as_str().to_owned(),
                title: n.title,
                modified: n.modified.0,
            })
            .collect())
    }

    pub fn read_note(&self, file_name: &str) -> Result<NoteContent, ApiError> {
        let store = self.store()?;
        let note = ReadNote::new(&*store).execute(&FileName::parse(file_name)?)?;
        Ok(NoteContent {
            file_name: note.file_name.as_str().to_owned(),
            content: note.content,
        })
    }

    pub fn save_note(&self, file_name: &str, content: &str) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let saved = SaveNote::new(&*store).execute(&FileName::parse(file_name)?, content)?;
        Ok(SavedNote {
            file_name: saved.as_str().to_owned(),
        })
    }

    pub fn create_note(&self) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let created = CreateNote::new(&*store).execute()?;
        Ok(SavedNote {
            file_name: created.as_str().to_owned(),
        })
    }

    fn keep(&self, location: &LibraryLocation, store: Arc<dyn NoteStore>) -> LibraryInfo {
        *self.library.write().unwrap_or_else(PoisonError::into_inner) = Some(store);
        library_info(location)
    }

    fn store(&self) -> Result<Arc<dyn NoteStore>, ApiError> {
        let library = self.library.read().unwrap_or_else(PoisonError::into_inner);
        library
            .clone()
            .ok_or_else(|| AppError::NoLibraryOpen.into())
    }
}

fn library_info(location: &LibraryLocation) -> LibraryInfo {
    let path = location.0.to_string_lossy().into_owned();
    let name = location
        .0
        .file_name()
        .map_or_else(|| path.clone(), |n| n.to_string_lossy().into_owned());
    LibraryInfo { name, path }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, InMemoryNoteStore};
    use application::{LibraryLocation, Preferences};

    use super::*;

    fn session_with(notes: &[(&str, &str)]) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
        Session::new(Arc::new(opener), Arc::new(FakePreferences::default()))
    }

    fn opened(notes: &[(&str, &str)]) -> Session {
        let session = session_with(notes);
        session
            .open_library(PathBuf::from("/Users/moi/Notes"))
            .unwrap();
        session
    }

    #[test]
    fn nothing_works_before_a_library_is_open() {
        let session = session_with(&[]);
        assert_eq!(
            session.list_notes().unwrap_err().message,
            "aucune bibliothèque n'est ouverte"
        );
    }

    #[test]
    fn opening_a_library_tells_its_name() {
        let session = session_with(&[]);
        let info = session
            .open_library(PathBuf::from("/Users/moi/Notes"))
            .unwrap();
        assert_eq!(info.name, "Notes");
        assert_eq!(info.path, "/Users/moi/Notes");
    }

    #[test]
    fn last_library_is_reopened() {
        let preferences = FakePreferences::default();
        preferences
            .remember_library(&LibraryLocation("/Users/moi/Notes".into()))
            .unwrap();
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::default()));
        let session = Session::new(Arc::new(opener), Arc::new(preferences));
        assert_eq!(
            session.reopen_last_library().unwrap().map(|i| i.name),
            Some("Notes".into())
        );
        assert!(session.list_notes().is_ok());
    }

    #[test]
    fn notes_are_listed_with_their_title() {
        let session = opened(&[("a.md", "# Alpha")]);
        let notes = session.list_notes().unwrap();
        assert_eq!(notes[0].file_name, "a.md");
        assert_eq!(notes[0].title, "Alpha");
    }

    #[test]
    fn a_note_is_read_and_saved_with_renaming() {
        let session = opened(&[("a.md", "# Alpha")]);
        assert_eq!(session.read_note("a.md").unwrap().content, "# Alpha");
        let saved = session.save_note("a.md", "# Bêta").unwrap();
        assert_eq!(saved.file_name, "beta.md");
    }

    #[test]
    fn created_note_is_untitled() {
        let session = opened(&[]);
        assert_eq!(session.create_note().unwrap().file_name, "sans-titre.md");
    }

    #[test]
    fn invalid_names_from_the_page_are_refused() {
        let session = opened(&[]);
        let error = session.read_note("../../etc/passwd").unwrap_err();
        assert_eq!(error.message, "nom de note invalide : « ../../etc/passwd »");
    }
}
