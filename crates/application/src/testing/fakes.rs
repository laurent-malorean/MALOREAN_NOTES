//! Faux stockage en mémoire, qui se comporte comme le vrai (voir `contract`).

use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Mutex, MutexGuard, PoisonError};

use domain::{AttachmentName, FileName, Folder, MeaningModel, Modified, Moment, NotePath};

use crate::{
    AttachmentLocation, Clock, IndexedNote, NoteStamp, NoteStore, Preferences, StoreError,
    StoredNote, TrashContents, Workspaces,
};

/// Emplacement fictif d'une pièce jointe en mémoire.
const MEMORY_LOCATION: &str = "mémoire://";

/// Espace de travail en mémoire ; chaque écriture avance la date de modification d'un cran.
#[derive(Debug, Default)]
pub struct InMemoryNoteStore {
    state: Mutex<State>,
}

#[derive(Debug, Default)]
struct State {
    notes: BTreeMap<NotePath, (String, Modified)>,
    /// Les sous-dossiers, racine exclue.
    folders: BTreeSet<Folder>,
    /// Les notes de la corbeille, à leur chemin dans la corbeille.
    trashed_notes: BTreeMap<NotePath, (String, Modified)>,
    /// Les dossiers de la corbeille, racine exclue.
    trashed_folders: BTreeSet<Folder>,
    /// Les pièces jointes de chaque note, avec leur contenu.
    attachments: BTreeMap<NotePath, Vec<(AttachmentName, Vec<u8>)>>,
    /// Les fichiers de l'espace de travail qui ne sont pas des notes, avec leur contenu.
    files: BTreeMap<(Folder, String), Vec<u8>>,
    /// Les notes dont l'écriture échoue, pour essayer une écriture ratée.
    failing: BTreeSet<NotePath>,
    tick: u64,
}

impl State {
    fn has_folder(&self, folder: &Folder) -> bool {
        folder.parent().is_none() || self.folders.contains(folder)
    }

    /// Le dossier et tous ses parents existent désormais.
    fn add_folder(&mut self, folder: &Folder) {
        add_with_parents(&mut self.folders, folder);
    }

    /// Le dossier de la corbeille contient-il une note ou un sous-dossier ?
    fn trash_has_content_in(&self, folder: &Folder) -> bool {
        self.trashed_notes
            .keys()
            .any(|n| n.folder().is_within(folder))
            || self
                .trashed_folders
                .iter()
                .any(|f| f != folder && f.is_within(folder))
    }

    /// Retire de la corbeille `folder` et ses parents, tant qu'ils sont vides.
    fn prune_trash(&mut self, folder: &Folder) {
        let mut current = folder.clone();
        while let Some(parent) = current.parent() {
            if self.trash_has_content_in(&current) {
                return;
            }
            self.trashed_folders.remove(&current);
            current = parent;
        }
    }
}

fn add_with_parents(folders: &mut BTreeSet<Folder>, folder: &Folder) {
    let mut current = folder.clone();
    while let Some(parent) = current.parent() {
        folders.insert(current);
        current = parent;
    }
}

type Notes = BTreeMap<NotePath, (String, Modified)>;

/// Déplace d'un ensemble à l'autre les dossiers et les notes qui sont dans `from`, vers `to`.
fn transfer(
    (from_folders, from_notes): (&mut BTreeSet<Folder>, &mut Notes),
    (to_folders, to_notes): (&mut BTreeSet<Folder>, &mut Notes),
    from: &Folder,
    to: &Folder,
) {
    add_with_parents(to_folders, to);
    let moved: Vec<Folder> = from_folders
        .iter()
        .filter(|f| f.is_within(from))
        .cloned()
        .collect();
    for folder in moved {
        from_folders.remove(&folder);
        to_folders.insert(folder.moved(from, to));
    }
    let notes: Vec<NotePath> = from_notes
        .keys()
        .filter(|n| n.folder().is_within(from))
        .cloned()
        .collect();
    for note in notes {
        if let Some(value) = from_notes.remove(&note) {
            let path = NotePath::new(note.folder().moved(from, to), note.name().clone());
            to_notes.insert(path, value);
        }
    }
}

impl InMemoryNoteStore {
    /// Un espace de travail qui contient déjà ces notes (chemin, contenu).
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

    /// Le même espace de travail, avec le fichier `name` (pas une note) dans `folder`.
    #[must_use]
    pub fn with_file(self, folder: &str, name: &str, bytes: &[u8]) -> Self {
        let folder = Folder::parse(folder).unwrap_or_else(|e| unreachable!("{e}"));
        self.state()
            .files
            .insert((folder, name.to_owned()), bytes.to_vec());
        self
    }

    /// Fait échouer toute écriture de la note `name` ([`StoreError::Unavailable`]), jusqu'à
    /// [`Self::stop_failing`] ; elle garde alors son ancien texte.
    pub fn fail_writes_to(&self, name: &NotePath) {
        self.state().failing.insert(name.clone());
    }

    /// Plus aucune écriture ne rate.
    pub fn stop_failing(&self) {
        self.state().failing.clear();
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

    fn stamps(&self, folder: &Folder) -> Result<Vec<NoteStamp>, StoreError> {
        let state = self.state();
        if !state.has_folder(folder) {
            return Err(StoreError::FolderNotFound(folder.clone()));
        }
        Ok(state
            .notes
            .iter()
            .filter(|(name, _)| name.folder() == folder)
            .map(|(name, (content, modified))| stamp(name, content, *modified))
            .collect())
    }

    fn read_indexed(&self, note: &NotePath) -> Result<IndexedNote, StoreError> {
        let state = self.state();
        let (content, modified) = state
            .notes
            .get(note)
            .ok_or_else(|| StoreError::NotFound(note.clone()))?;
        Ok(IndexedNote {
            stamp: stamp(note, content, *modified),
            content: content.clone(),
        })
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
        if state.failing.contains(name) {
            return Err(StoreError::Unavailable("disque plein".to_owned()));
        }
        state.add_folder(name.folder());
        state.tick += 1;
        let modified = Modified(state.tick);
        state
            .notes
            .insert(name.clone(), (content.to_owned(), modified));
        Ok(())
    }

    fn write_keeping_date(&self, note: &NotePath, content: &str) -> Result<(), StoreError> {
        let mut state = self.state();
        let (text, _) = state
            .notes
            .get_mut(note)
            .ok_or_else(|| StoreError::NotFound(note.clone()))?;
        content.clone_into(text);
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
        if let Some(attachments) = state.attachments.remove(from) {
            state.attachments.insert(to.clone(), attachments);
        }
        Ok(())
    }

    fn names(&self, folder: &Folder) -> Result<Vec<FileName>, StoreError> {
        let state = self.state();
        if !state.has_folder(folder) {
            return Err(StoreError::FolderNotFound(folder.clone()));
        }
        Ok(state
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

    fn trash(&self) -> Result<TrashContents, StoreError> {
        let state = self.state();
        Ok(TrashContents {
            folders: state.trashed_folders.iter().cloned().collect(),
            notes: state
                .trashed_notes
                .iter()
                .map(|(name, (c, m))| stored(name, c, *m))
                .collect(),
        })
    }

    fn trash_note(&self, note: &NotePath, at: &NotePath) -> Result<(), StoreError> {
        let mut state = self.state();
        if state.trashed_notes.contains_key(at) {
            return Err(StoreError::AlreadyExists(at.clone()));
        }
        let value = state
            .notes
            .remove(note)
            .ok_or_else(|| StoreError::NotFound(note.clone()))?;
        add_with_parents(&mut state.trashed_folders, at.folder());
        state.trashed_notes.insert(at.clone(), value);
        Ok(())
    }

    fn trash_folder(&self, folder: &Folder, at: &Folder) -> Result<(), StoreError> {
        let mut state = self.state();
        if !state.has_folder(folder) {
            return Err(StoreError::FolderNotFound(folder.clone()));
        }
        if state.trashed_folders.contains(at) {
            return Err(StoreError::FolderAlreadyExists(at.clone()));
        }
        let State {
            notes,
            folders,
            trashed_notes,
            trashed_folders,
            ..
        } = &mut *state;
        transfer(
            (folders, notes),
            (trashed_folders, trashed_notes),
            folder,
            at,
        );
        Ok(())
    }

    fn restore_note(&self, at: &NotePath, to: &NotePath) -> Result<(), StoreError> {
        let mut state = self.state();
        if !state.trashed_notes.contains_key(at) {
            return Err(StoreError::NotFound(at.clone()));
        }
        if state.notes.contains_key(to) {
            return Err(StoreError::AlreadyExists(to.clone()));
        }
        if let Some(value) = state.trashed_notes.remove(at) {
            state.add_folder(to.folder());
            state.notes.insert(to.clone(), value);
        }
        state.prune_trash(at.folder());
        Ok(())
    }

    fn restore_folder(&self, at: &Folder, to: &Folder) -> Result<(), StoreError> {
        let mut state = self.state();
        if !state.trashed_folders.contains(at) {
            return Err(StoreError::FolderNotFound(at.clone()));
        }
        if state.has_folder(to) {
            if state.trash_has_content_in(at) {
                return Err(StoreError::FolderAlreadyExists(to.clone()));
            }
            state.trashed_folders.remove(at);
        } else {
            let State {
                notes,
                folders,
                trashed_notes,
                trashed_folders,
                ..
            } = &mut *state;
            transfer((trashed_folders, trashed_notes), (folders, notes), at, to);
        }
        if let Some(parent) = at.parent() {
            state.prune_trash(&parent);
        }
        Ok(())
    }

    fn empty_trash(&self) -> Result<(), StoreError> {
        let mut state = self.state();
        state.trashed_notes.clear();
        state.trashed_folders.clear();
        Ok(())
    }

    fn attachment_names(&self, note: &NotePath) -> Result<Vec<AttachmentName>, StoreError> {
        Ok(self
            .state()
            .attachments
            .get(note)
            .map(|attachments| attachments.iter().map(|(name, _)| name.clone()).collect())
            .unwrap_or_default())
    }

    fn read_attachment(
        &self,
        note: &NotePath,
        name: &AttachmentName,
    ) -> Result<Vec<u8>, StoreError> {
        self.state()
            .attachments
            .get(note)
            .and_then(|attachments| attachments.iter().find(|(known, _)| known == name))
            .map(|(_, bytes)| bytes.clone())
            .ok_or_else(|| StoreError::AttachmentNotFound(name.to_name()))
    }

    fn read_file(&self, folder: &Folder, name: &AttachmentName) -> Result<Vec<u8>, StoreError> {
        self.state()
            .files
            .get(&(folder.clone(), name.to_name()))
            .cloned()
            .ok_or_else(|| StoreError::AttachmentNotFound(name.to_name()))
    }

    fn write_attachment(
        &self,
        note: &NotePath,
        name: &AttachmentName,
        bytes: &[u8],
    ) -> Result<(), StoreError> {
        let mut state = self.state();
        if !state.notes.contains_key(note) {
            return Err(StoreError::NotFound(note.clone()));
        }
        let attachments = state.attachments.entry(note.clone()).or_default();
        if attachments.iter().any(|(a, _)| a.same_file_as(name)) {
            return Err(StoreError::AttachmentAlreadyExists(name.to_name()));
        }
        attachments.push((name.clone(), bytes.to_vec()));
        Ok(())
    }

    fn attachment_location(
        &self,
        note: &NotePath,
        name: &AttachmentName,
    ) -> Result<AttachmentLocation, StoreError> {
        let state = self.state();
        let known = state
            .attachments
            .get(note)
            .is_some_and(|attachments| attachments.iter().any(|(known, _)| known == name));
        if !known {
            return Err(StoreError::AttachmentNotFound(name.to_name()));
        }
        Ok(AttachmentLocation::new(format!(
            "{MEMORY_LOCATION}{}/{}",
            note.to_path(),
            name.to_name()
        )))
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
            let path = NotePath::new(note.folder().moved(from, to), note.name().clone());
            if let Some(value) = state.notes.remove(&note) {
                state.notes.insert(path.clone(), value);
            }
            if let Some(attachments) = state.attachments.remove(&note) {
                state.attachments.insert(path, attachments);
            }
        }
    }
}

fn stamp(name: &NotePath, content: &str, modified: Modified) -> NoteStamp {
    NoteStamp {
        path: name.clone(),
        modified,
        size: content.len() as u64,
    }
}

fn stored(name: &NotePath, content: &str, modified: Modified) -> StoredNote {
    StoredNote {
        path: name.clone(),
        content: content.to_owned(),
        modified,
    }
}

/// Préférences en mémoire.
#[derive(Debug)]
pub struct FakePreferences {
    workspaces: Mutex<Workspaces>,
    meaning_model: Mutex<MeaningModel>,
}

impl Default for FakePreferences {
    fn default() -> Self {
        Self {
            workspaces: Mutex::default(),
            meaning_model: Mutex::new(MeaningModel::DEFAULT),
        }
    }
}

impl Preferences for FakePreferences {
    fn workspaces(&self) -> Result<Workspaces, StoreError> {
        Ok(self
            .workspaces
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone())
    }

    fn save_workspaces(&self, workspaces: &Workspaces) -> Result<(), StoreError> {
        *self
            .workspaces
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = workspaces.clone();
        Ok(())
    }

    fn meaning_model(&self) -> Result<MeaningModel, StoreError> {
        Ok(*self
            .meaning_model
            .lock()
            .unwrap_or_else(PoisonError::into_inner))
    }

    fn save_meaning_model(&self, model: MeaningModel) -> Result<(), StoreError> {
        *self
            .meaning_model
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = model;
        Ok(())
    }
}

/// Horloge arrêtée : donne toujours le même moment.
#[derive(Debug)]
pub struct FixedClock {
    moment: Moment,
}

impl FixedClock {
    /// Une horloge arrêtée sur `moment`.
    #[must_use]
    pub fn at(moment: Moment) -> Self {
        Self { moment }
    }
}

/// Par défaut, l'horloge est arrêtée le 16 novembre 2026 à 18 h 30.
impl Default for FixedClock {
    fn default() -> Self {
        Self::at(Moment::new(2026, 11, 16, 18, 30).unwrap_or_else(|_| unreachable!()))
    }
}

impl Clock for FixedClock {
    fn now(&self) -> Moment {
        self.moment
    }
}
