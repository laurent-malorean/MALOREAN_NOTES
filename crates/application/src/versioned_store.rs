//! L'espace de travail dont l'historique suit les notes : chaque déplacement, renommage, mise
//! à la corbeille et restauration fait par l'application emporte l'historique de la note (ou
//! des notes du dossier) avec elle.

use std::sync::Arc;

use domain::{AttachmentName, FileName, Folder, NotePath};

use crate::{
    AttachmentLocation, History, HistoryPlace, IndexedNote, NoteStamp, NoteStore, StoreError,
    StoredNote, TrashContents,
};

use HistoryPlace::{Trash, Workspace};

/// L'espace de travail `store`, dont `history` suit les notes.
#[derive(Debug, Clone)]
pub struct VersionedStore {
    store: Arc<dyn NoteStore>,
    history: Arc<dyn History>,
}

impl VersionedStore {
    /// L'espace de travail `store`, dont l'historique `history` suit les notes.
    #[must_use]
    pub fn new(store: Arc<dyn NoteStore>, history: Arc<dyn History>) -> Self {
        Self { store, history }
    }
}

impl NoteStore for VersionedStore {
    fn list(&self, folder: &Folder) -> Result<Vec<StoredNote>, StoreError> {
        self.store.list(folder)
    }

    fn stamps(&self, folder: &Folder) -> Result<Vec<NoteStamp>, StoreError> {
        self.store.stamps(folder)
    }

    fn read_indexed(&self, note: &NotePath) -> Result<IndexedNote, StoreError> {
        self.store.read_indexed(note)
    }

    fn read(&self, note: &NotePath) -> Result<StoredNote, StoreError> {
        self.store.read(note)
    }

    fn write(&self, note: &NotePath, content: &str) -> Result<(), StoreError> {
        self.store.write(note, content)
    }

    fn write_keeping_date(&self, note: &NotePath, content: &str) -> Result<(), StoreError> {
        self.store.write_keeping_date(note, content)
    }

    fn move_note(&self, from: &NotePath, to: &NotePath) -> Result<(), StoreError> {
        self.store.move_note(from, to)?;
        self.history
            .move_note_versions((Workspace, from), (Workspace, to))
    }

    fn names(&self, folder: &Folder) -> Result<Vec<FileName>, StoreError> {
        self.store.names(folder)
    }

    fn folders(&self) -> Result<Vec<Folder>, StoreError> {
        self.store.folders()
    }

    fn create_folder(&self, folder: &Folder) -> Result<(), StoreError> {
        self.store.create_folder(folder)
    }

    fn move_folder(&self, from: &Folder, to: &Folder) -> Result<(), StoreError> {
        self.store.move_folder(from, to)?;
        self.history
            .move_folder_versions((Workspace, from), (Workspace, to))
    }

    fn trash(&self) -> Result<TrashContents, StoreError> {
        self.store.trash()
    }

    fn trash_note(&self, note: &NotePath, at: &NotePath) -> Result<(), StoreError> {
        self.store.trash_note(note, at)?;
        self.history
            .move_note_versions((Workspace, note), (Trash, at))
    }

    fn trash_folder(&self, folder: &Folder, at: &Folder) -> Result<(), StoreError> {
        self.store.trash_folder(folder, at)?;
        self.history
            .move_folder_versions((Workspace, folder), (Trash, at))
    }

    fn restore_note(&self, at: &NotePath, to: &NotePath) -> Result<(), StoreError> {
        self.store.restore_note(at, to)?;
        self.history
            .move_note_versions((Trash, at), (Workspace, to))
    }

    fn restore_folder(&self, at: &Folder, to: &Folder) -> Result<(), StoreError> {
        self.store.restore_folder(at, to)?;
        self.history
            .move_folder_versions((Trash, at), (Workspace, to))
    }

    fn empty_trash(&self) -> Result<(), StoreError> {
        self.store.empty_trash()?;
        self.history.empty_trash()
    }

    fn attachment_names(&self, note: &NotePath) -> Result<Vec<AttachmentName>, StoreError> {
        self.store.attachment_names(note)
    }

    fn read_attachment(
        &self,
        note: &NotePath,
        name: &AttachmentName,
    ) -> Result<Vec<u8>, StoreError> {
        self.store.read_attachment(note, name)
    }

    fn read_file(&self, folder: &Folder, name: &AttachmentName) -> Result<Vec<u8>, StoreError> {
        self.store.read_file(folder, name)
    }

    fn write_attachment(
        &self,
        note: &NotePath,
        name: &AttachmentName,
        bytes: &[u8],
    ) -> Result<(), StoreError> {
        self.store.write_attachment(note, name, bytes)
    }

    fn attachment_location(
        &self,
        note: &NotePath,
        name: &AttachmentName,
    ) -> Result<AttachmentLocation, StoreError> {
        self.store.attachment_location(note, name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::MemoryHistory;
    use crate::testing::InMemoryNoteStore;
    use crate::testing::attachment_contract::attachment_contract;
    use crate::testing::contract::note_store_contract;
    use domain::history::Version;

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn folder(text: &str) -> Folder {
        Folder::parse(text).unwrap()
    }

    fn version() -> Version {
        Version::parse("2026-11-18 10h00").unwrap()
    }

    fn empty() -> VersionedStore {
        VersionedStore::new(
            Arc::new(InMemoryNoteStore::default()),
            Arc::new(MemoryHistory::default()),
        )
    }

    /// Un espace de travail dont chaque note a une version, qui porte son chemin.
    fn versioned(notes: &[&str]) -> (VersionedStore, Arc<MemoryHistory>) {
        let contents: Vec<(&str, &str)> = notes.iter().map(|n| (*n, "# Note")).collect();
        let history = Arc::new(MemoryHistory::default());
        for note in notes {
            history
                .write_version(&path(note), &version(), note)
                .unwrap();
        }
        let store = Arc::new(InMemoryNoteStore::with_notes(&contents));
        (VersionedStore::new(store, history.clone()), history)
    }

    /// Le texte de la version de la note `note`, si elle en a une.
    fn kept(history: &MemoryHistory, note: &str) -> Option<String> {
        history.read_version(&path(note), &version()).ok()
    }

    #[test]
    fn the_versioned_store_honours_the_store_contract() {
        note_store_contract(empty);
    }

    #[test]
    fn the_versioned_store_honours_the_attachment_contract() {
        attachment_contract(empty);
    }

    #[test]
    fn the_history_follows_a_moved_or_renamed_note() {
        let (store, history) = versioned(&["Travail/a.md"]);
        store.create_folder(&folder("Perso")).unwrap();
        store
            .move_note(&path("Travail/a.md"), &path("Perso/a.md"))
            .unwrap();
        store
            .rename(&path("Perso/a.md"), &FileName::parse("b.md").unwrap())
            .unwrap();
        assert_eq!(
            kept(&history, "Perso/b.md").as_deref(),
            Some("Travail/a.md")
        );
        assert_eq!(kept(&history, "Travail/a.md"), None);
    }

    #[test]
    fn the_history_follows_a_moved_folder() {
        let (store, history) = versioned(&["Travail/Projets/a.md"]);
        store
            .move_folder(&folder("Travail"), &folder("Boulot"))
            .unwrap();
        assert!(kept(&history, "Boulot/Projets/a.md").is_some());
    }

    #[test]
    fn the_history_goes_to_the_trash_with_its_note_and_comes_back() {
        let (store, history) = versioned(&["a.md"]);
        store.trash_note(&path("a.md"), &path("a.md")).unwrap();
        assert_eq!(kept(&history, "a.md"), None);
        store.restore_note(&path("a.md"), &path("a-2.md")).unwrap();
        assert_eq!(kept(&history, "a-2.md").as_deref(), Some("a.md"));
    }

    #[test]
    fn the_history_goes_to_the_trash_with_its_folder_and_comes_back() {
        let (store, history) = versioned(&["Travail/a.md"]);
        store
            .trash_folder(&folder("Travail"), &folder("Travail"))
            .unwrap();
        assert_eq!(kept(&history, "Travail/a.md"), None);
        store
            .restore_folder(&folder("Travail"), &folder("Travail 2"))
            .unwrap();
        assert!(kept(&history, "Travail 2/a.md").is_some());
    }

    #[test]
    fn emptying_the_trash_forgets_the_history_of_its_notes() {
        let (store, history) = versioned(&["a.md"]);
        store.trash_note(&path("a.md"), &path("a.md")).unwrap();
        store.empty_trash().unwrap();
        store.write(&path("a.md"), "# A").unwrap();
        history
            .move_note_versions((Trash, &path("a.md")), (Workspace, &path("a.md")))
            .unwrap();
        assert_eq!(kept(&history, "a.md"), None);
    }

    #[test]
    fn a_refused_move_leaves_the_history_in_place() {
        let (store, history) = versioned(&["a.md", "b.md"]);
        assert!(store.move_note(&path("a.md"), &path("b.md")).is_err());
        assert!(store.trash_note(&path("c.md"), &path("c.md")).is_err());
        assert_eq!(kept(&history, "a.md").as_deref(), Some("a.md"));
        assert_eq!(kept(&history, "b.md").as_deref(), Some("b.md"));
    }
}
