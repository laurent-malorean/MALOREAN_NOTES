//! Faux stockage en mémoire, qui se comporte comme le vrai (voir `contract`).

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use domain::{FileName, Folder, Modified, NotePath};

use crate::{LibraryLocation, LibraryOpener, NoteStore, Preferences, StoreError, StoredNote};

/// Bibliothèque en mémoire ; chaque écriture avance la date de modification d'un cran.
#[derive(Debug, Default)]
pub struct InMemoryNoteStore {
    state: Mutex<State>,
}

#[derive(Debug, Default)]
struct State {
    notes: BTreeMap<NotePath, (String, Modified)>,
    tick: u64,
}

impl InMemoryNoteStore {
    /// Une bibliothèque qui contient déjà ces notes (chemin, contenu).
    #[must_use]
    pub fn with_notes(notes: &[(&str, &str)]) -> Self {
        let store = Self::default();
        for (name, content) in notes {
            let name = NotePath::parse(name).unwrap_or_else(|e| unreachable!("{e}"));
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
    fn list(&self, folder: &Folder) -> Result<Vec<StoredNote>, StoreError> {
        let state = self.state();
        Ok(state
            .notes
            .iter()
            .filter(|(name, _)| name.folder() == folder)
            .map(|(name, (c, m))| stored(name, c, *m))
            .collect())
    }

    fn read(&self, name: &NotePath) -> Result<StoredNote, StoreError> {
        let state = self.state();
        let (content, modified) = state
            .notes
            .get(name)
            .ok_or_else(|| StoreError::NotFound(name.clone()))?;
        Ok(stored(name, content, *modified))
    }

    fn write(&self, name: &NotePath, content: &str) -> Result<(), StoreError> {
        let mut state = self.state();
        state.tick += 1;
        let modified = Modified(state.tick);
        state
            .notes
            .insert(name.clone(), (content.to_owned(), modified));
        Ok(())
    }

    fn rename(&self, from: &NotePath, to: &FileName) -> Result<(), StoreError> {
        let mut state = self.state();
        let to = from.renamed(to.clone());
        if state.notes.contains_key(&to) {
            return Err(StoreError::AlreadyExists(to));
        }
        let note = state
            .notes
            .remove(from)
            .ok_or_else(|| StoreError::NotFound(from.clone()))?;
        state.notes.insert(to, note);
        Ok(())
    }

    fn names(&self, folder: &Folder) -> Result<Vec<FileName>, StoreError> {
        Ok(self
            .state()
            .notes
            .keys()
            .filter(|name| name.folder() == folder)
            .map(|name| name.name().clone())
            .collect())
    }
}

fn stored(name: &NotePath, content: &str, modified: Modified) -> StoredNote {
    StoredNote {
        path: name.clone(),
        content: content.to_owned(),
        modified,
    }
}

/// Ouvre toujours la même bibliothèque en mémoire, quel que soit l'emplacement.
#[derive(Debug)]
pub struct FakeOpener {
    store: Arc<InMemoryNoteStore>,
}

impl FakeOpener {
    /// Un ouvreur qui rend toujours `store`.
    #[must_use]
    pub fn new(store: Arc<InMemoryNoteStore>) -> Self {
        Self { store }
    }
}

impl LibraryOpener for FakeOpener {
    fn open(&self, _location: &LibraryLocation) -> Result<Arc<dyn NoteStore>, StoreError> {
        Ok(self.store.clone())
    }
}

/// Préférences en mémoire.
#[derive(Debug, Default)]
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
