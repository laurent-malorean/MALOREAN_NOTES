//! Faux stockage en mémoire, qui se comporte comme le vrai (voir `contract`).

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use domain::{FileName, Modified};

use crate::{LibraryLocation, LibraryOpener, NoteStore, Preferences, StoreError, StoredNote};

/// Bibliothèque en mémoire ; chaque écriture avance la date de modification d'un cran.
#[derive(Default)]
pub struct InMemoryNoteStore {
    state: Mutex<State>,
}

#[derive(Default)]
struct State {
    notes: BTreeMap<FileName, (String, Modified)>,
    tick: u64,
}

impl InMemoryNoteStore {
    /// Une bibliothèque qui contient déjà ces notes (nom, contenu).
    #[must_use]
    pub fn with_notes(notes: &[(&str, &str)]) -> Self {
        let store = Self::default();
        for (name, content) in notes {
            let name = FileName::parse(name).unwrap_or_else(|e| unreachable!("{e}"));
            store
                .write(&name, content)
                .unwrap_or_else(|e| unreachable!("{e:?}"));
        }
        store
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl NoteStore for InMemoryNoteStore {
    fn list(&self) -> Result<Vec<StoredNote>, StoreError> {
        let state = self.state();
        Ok(state
            .notes
            .iter()
            .map(|(name, (c, m))| stored(name, c, *m))
            .collect())
    }

    fn read(&self, name: &FileName) -> Result<StoredNote, StoreError> {
        let state = self.state();
        let (content, modified) = state
            .notes
            .get(name)
            .ok_or_else(|| StoreError::NotFound(name.clone()))?;
        Ok(stored(name, content, *modified))
    }

    fn write(&self, name: &FileName, content: &str) -> Result<(), StoreError> {
        let mut state = self.state();
        state.tick += 1;
        let modified = Modified(state.tick);
        state
            .notes
            .insert(name.clone(), (content.to_owned(), modified));
        Ok(())
    }

    fn rename(&self, from: &FileName, to: &FileName) -> Result<(), StoreError> {
        let mut state = self.state();
        if state.notes.contains_key(to) {
            return Err(StoreError::AlreadyExists(to.clone()));
        }
        let note = state
            .notes
            .remove(from)
            .ok_or_else(|| StoreError::NotFound(from.clone()))?;
        state.notes.insert(to.clone(), note);
        Ok(())
    }

    fn names(&self) -> Result<Vec<FileName>, StoreError> {
        Ok(self.state().notes.keys().cloned().collect())
    }
}

fn stored(name: &FileName, content: &str, modified: Modified) -> StoredNote {
    StoredNote {
        file_name: name.clone(),
        content: content.to_owned(),
        modified,
    }
}

/// Ouvre toujours la même bibliothèque en mémoire, et note les emplacements demandés.
pub struct FakeOpener {
    pub store: Arc<InMemoryNoteStore>,
    pub opened: Mutex<Vec<LibraryLocation>>,
}

impl FakeOpener {
    #[must_use]
    pub fn new(store: Arc<InMemoryNoteStore>) -> Self {
        Self {
            store,
            opened: Mutex::default(),
        }
    }
}

impl LibraryOpener for FakeOpener {
    fn open(&self, location: &LibraryLocation) -> Result<Arc<dyn NoteStore>, StoreError> {
        self.opened
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(location.clone());
        Ok(self.store.clone())
    }
}

/// Préférences en mémoire.
#[derive(Default)]
pub struct FakePreferences {
    last: Mutex<Option<LibraryLocation>>,
}

impl Preferences for FakePreferences {
    fn last_library(&self) -> Result<Option<LibraryLocation>, StoreError> {
        Ok(self
            .last
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone())
    }

    fn remember_library(&self, location: &LibraryLocation) -> Result<(), StoreError> {
        *self.last.lock().unwrap_or_else(PoisonError::into_inner) = Some(location.clone());
        Ok(())
    }
}
