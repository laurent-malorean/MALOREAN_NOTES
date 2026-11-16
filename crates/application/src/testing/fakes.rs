//! Faux stockage en mémoire, qui se comporte comme le vrai (voir `contract`).

use std::collections::{BTreeMap, BTreeSet};
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
    /// Les sous-dossiers, racine exclue.
    folders: BTreeSet<Folder>,
    tick: u64,
}

impl State {
    fn has_folder(&self, folder: &Folder) -> bool {
        folder.parent().is_none() || self.folders.contains(folder)
    }

    /// Le dossier et tous ses parents existent désormais.
    fn add_folder(&mut self, folder: &Folder) {
        let mut current = folder.clone();
        while let Some(parent) = current.parent() {
            self.folders.insert(current);
            current = parent;
        }
    }
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
        state.add_folder(name.folder());
        state.tick += 1;
        let modified = Modified(state.tick);
        state
            .notes
            .insert(name.clone(), (content.to_owned(), modified));
        Ok(())
    }

    fn move_note(&self, from: &NotePath, to: &NotePath) -> Result<(), StoreError> {
        let mut state = self.state();
        if !state.notes.contains_key(from) {
            return Err(StoreError::NotFound(from.clone()));
        }
        if !state.has_folder(to.folder()) {
            return Err(StoreError::FolderNotFound(to.folder().clone()));
        }
        if state.notes.contains_key(to) {
            return Err(StoreError::AlreadyExists(to.clone()));
        }
        if let Some(note) = state.notes.remove(from) {
            state.notes.insert(to.clone(), note);
        }
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

    fn folders(&self) -> Result<Vec<Folder>, StoreError> {
        Ok(self.state().folders.iter().cloned().collect())
    }

    fn create_folder(&self, folder: &Folder) -> Result<(), StoreError> {
        let mut state = self.state();
        let parent = folder.parent().unwrap_or_else(Folder::root);
        if state.has_folder(folder) {
            return Err(StoreError::FolderAlreadyExists(folder.clone()));
        }
        if !state.has_folder(&parent) {
            return Err(StoreError::FolderNotFound(parent));
        }
        state.folders.insert(folder.clone());
        Ok(())
    }

    fn move_folder(&self, from: &Folder, to: &Folder) -> Result<(), StoreError> {
        let mut state = self.state();
        let parent = to.parent().unwrap_or_else(Folder::root);
        if !state.has_folder(from) {
            return Err(StoreError::FolderNotFound(from.clone()));
        }
        if !state.has_folder(&parent) {
            return Err(StoreError::FolderNotFound(parent));
        }
        if state.has_folder(to) {
            return Err(StoreError::FolderAlreadyExists(to.clone()));
        }
        Self::move_folder_contents(&mut state, from, to);
        Ok(())
    }
}

impl InMemoryNoteStore {
    fn move_folder_contents(state: &mut State, from: &Folder, to: &Folder) {
        let moved: Vec<Folder> = state
            .folders
            .iter()
            .filter(|f| f.is_within(from))
            .cloned()
            .collect();
        for folder in moved {
            state.folders.remove(&folder);
            state.folders.insert(folder.moved(from, to));
        }
        let notes: Vec<NotePath> = state
            .notes
            .keys()
            .filter(|n| n.folder().is_within(from))
            .cloned()
            .collect();
        for note in notes {
            if let Some(value) = state.notes.remove(&note) {
                let path = NotePath::new(note.folder().moved(from, to), note.name().clone());
                state.notes.insert(path, value);
            }
        }
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
