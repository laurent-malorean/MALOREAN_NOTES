//! L'espace de travail qui garde le texte d'avant avant chaque écriture (fiche 0081) : ce que fait
//! une IA par les outils du CRM s'annule avec l'historique des versions, comme un remplacement de
//! texte ou un changement de canvas. L'interface, elle, n'a pas ce besoin : elle garde une version
//! en quittant une note.

use std::sync::Arc;

use domain::{AttachmentName, FileName, Folder, NotePath};

use crate::use_cases::KeepVersion;
use crate::{
    AppError, AttachmentLocation, Clock, History, IndexedNote, NoteStamp, NoteStore, StoreError,
    StoredNote, TrashContents,
};

/// L'espace de travail `store`, dont chaque écriture d'une note qui existe garde d'abord son texte
/// dans `history`.
#[derive(Debug, Clone)]
pub struct KeepingStore {
    store: Arc<dyn NoteStore>,
    history: Arc<dyn History>,
    clock: Arc<dyn Clock>,
}

impl KeepingStore {
    /// L'espace de travail `store`, dont l'historique `history` garde le texte d'avant, daté par
    /// `clock`.
    #[must_use]
    pub fn new(
        store: Arc<dyn NoteStore>,
        history: Arc<dyn History>,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            store,
            history,
            clock,
        }
    }

    /// Garde le texte actuel de la note, s'il y en a un : une note qui n'existe pas encore (ou qui
    /// n'est pas du texte) n'a rien à garder.
    fn keep(&self, note: &NotePath) -> Result<(), StoreError> {
        match KeepVersion::new(&*self.store, &*self.history, &*self.clock).execute(note) {
            Ok(_)
            | Err(
                AppError::NoteNotFound(_)
                | AppError::NoteUnreadable(_)
                | AppError::FolderNotFound(_),
            ) => Ok(()),
            Err(other) => Err(StoreError::Unavailable(other.to_string())),
        }
    }
}

impl NoteStore for KeepingStore {
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
        self.keep(note)?;
        self.store.write(note, content)
    }

    fn write_keeping_date(&self, note: &NotePath, content: &str) -> Result<(), StoreError> {
        self.keep(note)?;
        self.store.write_keeping_date(note, content)
    }

    fn move_note(&self, from: &NotePath, to: &NotePath) -> Result<(), StoreError> {
        self.store.move_note(from, to)
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
        self.store.move_folder(from, to)
    }

    fn trash(&self) -> Result<TrashContents, StoreError> {
        self.store.trash()
    }

    fn trash_note(&self, note: &NotePath, at: &NotePath) -> Result<(), StoreError> {
        self.store.trash_note(note, at)
    }

    fn trash_folder(&self, folder: &Folder, at: &Folder) -> Result<(), StoreError> {
        self.store.trash_folder(folder, at)
    }

    fn restore_note(&self, at: &NotePath, to: &NotePath) -> Result<(), StoreError> {
        self.store.restore_note(at, to)
    }

    fn restore_folder(&self, at: &Folder, to: &Folder) -> Result<(), StoreError> {
        self.store.restore_folder(at, to)
    }

    fn empty_trash(&self) -> Result<(), StoreError> {
        self.store.empty_trash()
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
    use crate::testing::attachment_contract::attachment_contract;
    use crate::testing::contract::note_store_contract;
    use crate::testing::{FixedClock, InMemoryNoteStore};

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn keeping(notes: &[(&str, &str)]) -> (KeepingStore, Arc<MemoryHistory>) {
        let history = Arc::new(MemoryHistory::default());
        let store = KeepingStore::new(
            Arc::new(InMemoryNoteStore::with_notes(notes)),
            history.clone(),
            Arc::new(FixedClock::default()),
        );
        (store, history)
    }

    fn empty() -> KeepingStore {
        keeping(&[]).0
    }

    #[test]
    fn the_keeping_store_honours_the_store_contract() {
        note_store_contract(empty);
    }

    #[test]
    fn the_keeping_store_honours_the_attachment_contract() {
        attachment_contract(empty);
    }

    /// Les textes gardés de la note, du plus ancien au plus récent.
    fn kept(history: &MemoryHistory, note: &str) -> Vec<String> {
        let mut versions = history.versions(&path(note)).unwrap();
        versions.sort();
        versions
            .iter()
            .map(|version| history.read_version(&path(note), version).unwrap())
            .collect()
    }

    #[test]
    fn a_write_keeps_the_text_before_and_writes_the_new_one() {
        let (store, history) = keeping(&[("a.md", "# A\n\navant")]);

        store.write(&path("a.md"), "# A\n\naprès").unwrap();

        assert_eq!(store.read(&path("a.md")).unwrap().content, "# A\n\naprès");
        assert_eq!(kept(&history, "a.md"), ["# A\n\navant"]);
    }

    #[test]
    fn a_write_keeping_the_date_keeps_the_text_before_too() {
        let (store, history) = keeping(&[("a.md", "# A\n\navant")]);

        store
            .write_keeping_date(&path("a.md"), "# A\n\naprès")
            .unwrap();

        assert_eq!(kept(&history, "a.md"), ["# A\n\navant"]);
    }

    #[test]
    fn a_note_that_does_not_exist_yet_has_nothing_to_keep() {
        let (store, history) = keeping(&[]);

        store.write(&path("a.md"), "# A").unwrap();

        assert!(kept(&history, "a.md").is_empty());
        assert_eq!(store.read(&path("a.md")).unwrap().content, "# A");
    }

    #[test]
    fn a_note_in_a_folder_that_does_not_exist_is_written_as_the_store_decides() {
        let (store, history) = keeping(&[]);

        let result = store.write(&path("Inconnu/a.md"), "# A");

        // Rien à garder, et ce que le stockage répond n'est pas une erreur de l'historique.
        assert!(!matches!(result, Err(StoreError::Unavailable(_))));
        assert!(kept(&history, "Inconnu/a.md").is_empty());
    }
}
