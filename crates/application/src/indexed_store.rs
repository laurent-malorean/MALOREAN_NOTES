//! L'espace de travail vu à travers son index : chaque changement que l'application y fait met
//! l'index à jour, et l'index se met à jour sur les fichiers en ne relisant que ce qui a changé.

use std::collections::HashMap;
use std::sync::Arc;

use domain::{AttachmentName, Folder, NotePath};

use crate::{
    AttachmentLocation, IndexedNote, NoteIndex, NoteStamp, NoteStore, StoreError, StoredNote,
    TrashContents,
};

/// Le nombre de notes que la mise à jour écrit d'un coup dans l'index.
const REFRESH_BATCH: usize = 50;

/// Met l'index à jour sur l'espace de travail : relit les notes dont la date ou la taille a changé
/// (et celles qu'il ne connaît pas), oublie celles qui ont disparu ; les autres ne sont pas relues.
///
/// # Errors
///
/// L'erreur de l'espace de travail ou de l'index qui a arrêté la mise à jour.
pub(crate) fn refresh(store: &dyn NoteStore, index: &dyn NoteIndex) -> Result<(), StoreError> {
    let on_disk = notes_on_disk(store)?;
    let known: HashMap<NotePath, NoteStamp> = index
        .stamps()?
        .into_iter()
        .map(|s| (s.path.clone(), s))
        .collect();
    let gone: Vec<NotePath> = known
        .keys()
        .filter(|path| !on_disk.contains_key(*path))
        .cloned()
        .collect();
    index.remove(&gone)?;
    let stale: Vec<&NotePath> = on_disk
        .iter()
        .filter(|(path, stamp)| known.get(*path) != Some(stamp))
        .map(|(path, _)| path)
        .collect();
    // Par lots : l'index grandit pendant la mise à jour, que l'écran des réglages peut suivre.
    for batch in stale.chunks(REFRESH_BATCH) {
        let mut changed = Vec::new();
        for path in batch {
            match store.read_indexed(path) {
                Ok(note) => changed.push(note),
                Err(StoreError::NotFound(_)) => {}
                Err(error) => return Err(error),
            }
        }
        index.put(&changed)?;
    }
    Ok(())
}

/// Le relevé de chaque note de l'espace de travail, tous dossiers parcourus : les notes que
/// l'index doit connaître.
///
/// # Errors
///
/// L'erreur de l'espace de travail qui a arrêté le parcours.
pub(crate) fn notes_on_disk(
    store: &dyn NoteStore,
) -> Result<HashMap<NotePath, NoteStamp>, StoreError> {
    let mut on_disk: HashMap<NotePath, NoteStamp> = HashMap::new();
    for folder in std::iter::once(Folder::root()).chain(store.folders()?) {
        let stamps = match store.stamps(&folder) {
            Err(StoreError::FolderNotFound(_)) => Vec::new(),
            stamps => stamps?,
        };
        on_disk.extend(stamps.into_iter().map(|s| (s.path.clone(), s)));
    }
    Ok(on_disk)
}

/// L'espace de travail ouvert, dont l'index suit chaque écriture, déplacement et mise à la
/// corbeille faits par l'application.
#[derive(Debug, Clone)]
pub struct IndexedStore {
    store: Arc<dyn NoteStore>,
    index: Arc<dyn NoteIndex>,
}

impl IndexedStore {
    /// L'espace de travail `store`, dont `index` suit les changements.
    #[must_use]
    pub fn new(store: Arc<dyn NoteStore>, index: Arc<dyn NoteIndex>) -> Self {
        Self { store, index }
    }

    /// L'index relit la note ; il l'oublie si elle n'existe plus.
    fn reindex(&self, note: &NotePath) -> Result<(), StoreError> {
        match self.store.read_indexed(note) {
            Ok(read) => self.index.put(&[read]),
            Err(StoreError::NotFound(_)) => self.index.remove(std::slice::from_ref(note)),
            Err(error) => Err(error),
        }
    }

    /// Après un changement de dossier entier : l'index relit ce qui a changé.
    fn refreshed(&self) -> Result<(), StoreError> {
        refresh(&*self.store, &*self.index)
    }
}

impl NoteStore for IndexedStore {
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
        self.store.write(note, content)?;
        self.reindex(note)
    }

    fn write_keeping_date(&self, note: &NotePath, content: &str) -> Result<(), StoreError> {
        self.store.write_keeping_date(note, content)?;
        self.reindex(note)
    }

    fn move_note(&self, from: &NotePath, to: &NotePath) -> Result<(), StoreError> {
        self.store.move_note(from, to)?;
        self.index.remove(std::slice::from_ref(from))?;
        self.reindex(to)
    }

    fn names(&self, folder: &Folder) -> Result<Vec<domain::FileName>, StoreError> {
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
        self.refreshed()
    }

    fn trash(&self) -> Result<TrashContents, StoreError> {
        self.store.trash()
    }

    fn trash_note(&self, note: &NotePath, at: &NotePath) -> Result<(), StoreError> {
        self.store.trash_note(note, at)?;
        self.index.remove(std::slice::from_ref(note))
    }

    fn trash_folder(&self, folder: &Folder, at: &Folder) -> Result<(), StoreError> {
        self.store.trash_folder(folder, at)?;
        self.refreshed()
    }

    fn restore_note(&self, at: &NotePath, to: &NotePath) -> Result<(), StoreError> {
        self.store.restore_note(at, to)?;
        self.reindex(to)
    }

    fn restore_folder(&self, at: &Folder, to: &Folder) -> Result<(), StoreError> {
        self.store.restore_folder(at, to)?;
        self.refreshed()
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
    use crate::MemoryIndex;
    use crate::testing::InMemoryNoteStore;
    use crate::testing::contract::note_store_contract;
    use domain::{Modified, NoteSummary};

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn folder(text: &str) -> Folder {
        Folder::parse(text).unwrap()
    }

    struct Indexed {
        files: Arc<InMemoryNoteStore>,
        index: Arc<MemoryIndex>,
        store: IndexedStore,
    }

    fn indexed(notes: &[(&str, &str)]) -> Indexed {
        let files = Arc::new(InMemoryNoteStore::with_notes(notes));
        let index = Arc::new(MemoryIndex::default());
        refresh(&*files, &*index).unwrap();
        let store = IndexedStore::new(files.clone(), index.clone());
        Indexed {
            files,
            index,
            store,
        }
    }

    fn sorted(mut notes: Vec<NoteSummary>) -> Vec<NoteSummary> {
        notes.sort_by(|a, b| a.path().cmp(b.path()));
        notes
    }

    /// Un index en mémoire qui note la taille de chaque écriture qu'on lui fait.
    #[derive(Debug, Default)]
    struct Batches {
        index: MemoryIndex,
        sizes: std::sync::Mutex<Vec<usize>>,
    }

    impl crate::NoteIndex for Batches {
        fn stamps(&self) -> Result<Vec<NoteStamp>, StoreError> {
            self.index.stamps()
        }
        fn put(&self, notes: &[crate::IndexedNote]) -> Result<(), StoreError> {
            self.sizes.lock().unwrap().push(notes.len());
            self.index.put(notes)
        }
        fn remove(&self, notes: &[NotePath]) -> Result<(), StoreError> {
            self.index.remove(notes)
        }
        fn clear(&self) -> Result<(), StoreError> {
            self.index.clear()
        }
        fn content(&self, note: &NotePath) -> Result<Option<String>, StoreError> {
            self.index.content(note)
        }
        fn notes_in(&self, folder: &Folder) -> Result<Vec<NoteSummary>, StoreError> {
            self.index.notes_in(folder)
        }
        fn all_notes(&self) -> Result<Vec<NoteSummary>, StoreError> {
            self.index.all_notes()
        }
        fn tagged(&self, tag: &str) -> Result<Vec<NoteSummary>, StoreError> {
            self.index.tagged(tag)
        }
        fn search(
            &self,
            query: &domain::search::SearchQuery,
            types: &[domain::ContentType],
        ) -> Result<Vec<(NoteSummary, String)>, StoreError> {
            self.index.search(query, types)
        }
    }

    #[test]
    fn a_refresh_writes_the_index_fifty_notes_at_a_time() {
        let names: Vec<String> = (0..120).map(|n| format!("n{n}.md")).collect();
        let notes: Vec<(&str, &str)> = names.iter().map(|n| (n.as_str(), "# N")).collect();
        let files = InMemoryNoteStore::with_notes(&notes);
        let index = Batches::default();
        refresh(&files, &index).unwrap();
        assert_eq!(*index.sizes.lock().unwrap(), [50, 50, 20]);
        assert_eq!(index.stamps().unwrap().len(), 120);
        refresh(&files, &index).unwrap();
        assert_eq!(index.sizes.lock().unwrap().len(), 3);
    }

    impl Indexed {
        /// L'index sait exactement ce qu'un index reconstruit sur les fichiers saurait.
        fn assert_in_step(&self) {
            let rebuilt = MemoryIndex::default();
            refresh(&*self.files, &rebuilt).unwrap();
            assert_eq!(
                sorted(self.index.all_notes().unwrap()),
                sorted(rebuilt.all_notes().unwrap())
            );
            let mut stamps = self.index.stamps().unwrap();
            stamps.sort_by(|a, b| a.path.cmp(&b.path));
            let mut expected = rebuilt.stamps().unwrap();
            expected.sort_by(|a, b| a.path.cmp(&b.path));
            assert_eq!(stamps, expected);
        }

        fn titles(&self) -> Vec<String> {
            sorted(self.index.all_notes().unwrap())
                .iter()
                .map(|n| format!("{} {}", n.path().to_path(), n.title()))
                .collect()
        }

        /// Une note que l'index croit connaître : même relevé, autre contenu.
        fn known_as(&self, name: &str, content: &str) {
            let note = self.files.read_indexed(&path(name)).unwrap();
            self.index
                .put(&[IndexedNote {
                    stamp: note.stamp,
                    content: content.to_owned(),
                }])
                .unwrap();
        }
    }

    #[test]
    fn the_indexed_store_honours_the_store_contract() {
        note_store_contract(|| {
            IndexedStore::new(
                Arc::new(InMemoryNoteStore::default()),
                Arc::new(MemoryIndex::default()),
            )
        });
    }

    #[test]
    fn the_indexed_store_honours_the_attachment_contract() {
        crate::testing::attachment_contract::attachment_contract(|| {
            IndexedStore::new(
                Arc::new(InMemoryNoteStore::default()),
                Arc::new(MemoryIndex::default()),
            )
        });
    }

    #[test]
    fn a_refresh_indexes_every_note_of_every_folder() {
        let workspace = indexed(&[("a.md", "# A"), ("T/b.md", "# B"), ("T/U/c.md", "# C")]);
        assert_eq!(workspace.titles(), ["a.md A", "T/b.md B", "T/U/c.md C"]);
        workspace.assert_in_step();
    }

    #[test]
    fn a_refresh_rereads_only_notes_whose_date_or_size_changed() {
        let workspace = indexed(&[("a.md", "# A"), ("b.md", "# B"), ("c.md", "# C")]);
        workspace.known_as("a.md", "# Vieux");
        workspace.files.write(&path("b.md"), "# Bêta").unwrap();
        workspace
            .files
            .write_keeping_date(&path("c.md"), "# Ce")
            .unwrap();
        refresh(&*workspace.files, &*workspace.index).unwrap();
        assert_eq!(workspace.titles(), ["a.md Vieux", "b.md Bêta", "c.md Ce"]);
    }

    #[test]
    fn a_refresh_forgets_notes_that_are_gone() {
        let workspace = indexed(&[("a.md", "# A"), ("b.md", "# B")]);
        workspace
            .files
            .trash_note(&path("a.md"), &path("a.md"))
            .unwrap();
        workspace.files.write(&path("c.md"), "# C").unwrap();
        refresh(&*workspace.files, &*workspace.index).unwrap();
        assert_eq!(workspace.titles(), ["b.md B", "c.md C"]);
    }

    #[test]
    fn notes_written_by_the_app_are_indexed_at_once() {
        let workspace = indexed(&[("a.md", "# A")]);
        workspace.store.write(&path("b.md"), "# B").unwrap();
        workspace.store.write(&path("a.md"), "# Alpha").unwrap();
        workspace.assert_in_step();
        workspace
            .store
            .write_keeping_date(&path("a.md"), "---\npinned: true\n---\n# Alpha")
            .unwrap();
        workspace.assert_in_step();
        assert!(
            workspace
                .index
                .all_notes()
                .unwrap()
                .iter()
                .any(NoteSummary::is_pinned)
        );
    }

    #[test]
    fn moved_and_renamed_notes_follow_in_the_index() {
        let workspace = indexed(&[("a.md", "# A"), ("T/b.md", "# B")]);
        workspace
            .store
            .move_note(&path("a.md"), &path("T/a.md"))
            .unwrap();
        workspace.assert_in_step();
        workspace
            .store
            .rename(&path("T/b.md"), &domain::FileName::parse("c.md").unwrap())
            .unwrap();
        workspace.assert_in_step();
        assert_eq!(workspace.titles(), ["T/a.md A", "T/c.md B"]);
    }

    #[test]
    fn moved_folders_take_their_notes_along_in_the_index() {
        let workspace = indexed(&[("T/a.md", "# A"), ("T/U/b.md", "# B"), ("P/c.md", "# C")]);
        workspace
            .store
            .move_folder(&folder("T"), &folder("P/T"))
            .unwrap();
        workspace.assert_in_step();
        assert_eq!(
            workspace.titles(),
            ["P/c.md C", "P/T/a.md A", "P/T/U/b.md B"]
        );
    }

    #[test]
    fn trashed_and_restored_notes_and_folders_follow_in_the_index() {
        let workspace = indexed(&[("a.md", "# A"), ("T/b.md", "# B"), ("c.md", "# C")]);
        workspace
            .store
            .trash_note(&path("a.md"), &path("a.md"))
            .unwrap();
        workspace.assert_in_step();
        workspace
            .store
            .trash_folder(&folder("T"), &folder("T"))
            .unwrap();
        workspace.assert_in_step();
        assert_eq!(workspace.titles(), ["c.md C"]);
        workspace
            .store
            .restore_note(&path("a.md"), &path("a.md"))
            .unwrap();
        workspace.assert_in_step();
        workspace
            .store
            .restore_folder(&folder("T"), &folder("T"))
            .unwrap();
        workspace.assert_in_step();
        assert_eq!(workspace.titles(), ["a.md A", "c.md C", "T/b.md B"]);
        workspace.store.empty_trash().unwrap();
        workspace.assert_in_step();
    }

    #[test]
    fn a_note_gone_when_reindexed_is_forgotten() {
        let workspace = indexed(&[("a.md", "# A")]);
        workspace
            .files
            .trash_note(&path("a.md"), &path("a.md"))
            .unwrap();
        workspace.store.reindex(&path("a.md")).unwrap();
        assert!(workspace.index.stamps().unwrap().is_empty());
        let stamp = NoteStamp {
            path: path("a.md"),
            modified: Modified(1),
            size: 1,
        };
        assert_ne!(workspace.index.stamps().unwrap(), [stamp]);
    }
}
