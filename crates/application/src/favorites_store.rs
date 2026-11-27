//! L'espace de travail dont la note des favoris suit les notes (fiche 0102) : renommée ou
//! déplacée, seule ou avec son dossier, la note des favoris garde son rang de note des favoris ;
//! mise à la corbeille, elle ne l'est plus. Un seul endroit pour tous les gestes (l'écran, les
//! IA, le CRM qui emporte ses fiches), comme l'historique des versions.
//!
//! Le choix est gardé dans les préférences, avec l'espace : il se relit et se réécrit à chaque
//! changement de place, jamais dans le dossier de l'espace.

use std::sync::Arc;

use domain::favorites_note::PlaceChange;
use domain::{AttachmentName, FileName, Folder, NotePath};

use crate::{
    AttachmentLocation, IndexedNote, NoteStamp, NoteStore, Preferences, StoreError, StoredNote,
    TrashContents, WorkspaceLocation,
};

/// L'espace de travail `store`, dont `preferences` garde la note des favoris.
#[derive(Debug, Clone)]
pub struct FavoritesStore {
    store: Arc<dyn NoteStore>,
    preferences: Arc<dyn Preferences>,
    location: WorkspaceLocation,
}

impl FavoritesStore {
    /// L'espace de travail `store`, qui se trouve au dossier `location` (par lequel les
    /// préférences le retrouvent, même renommé), dont la note des favoris est gardée dans
    /// `preferences`.
    #[must_use]
    pub fn new(
        store: Arc<dyn NoteStore>,
        preferences: Arc<dyn Preferences>,
        location: WorkspaceLocation,
    ) -> Self {
        Self {
            store,
            preferences,
            location,
        }
    }

    /// Garde ce que devient la note des favoris après `change`, si elle change.
    fn follow(&self, change: PlaceChange<'_>) -> Result<(), StoreError> {
        let workspaces = self.preferences.workspaces()?;
        let next = workspaces
            .clone()
            .with_favorites_note_following(&self.location, change);
        if next == workspaces {
            return Ok(());
        }
        self.preferences.save_workspaces(&next)
    }
}

impl NoteStore for FavoritesStore {
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
        self.follow(PlaceChange::NoteMoved { from, to })
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
        self.follow(PlaceChange::FolderMoved { from, to })
    }

    fn trash(&self) -> Result<TrashContents, StoreError> {
        self.store.trash()
    }

    fn trash_note(&self, note: &NotePath, at: &NotePath) -> Result<(), StoreError> {
        self.store.trash_note(note, at)?;
        self.follow(PlaceChange::NoteTrashed(note))
    }

    fn trash_folder(&self, folder: &Folder, at: &Folder) -> Result<(), StoreError> {
        self.store.trash_folder(folder, at)?;
        self.follow(PlaceChange::FolderTrashed(folder))
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
    use crate::testing::attachment_contract::attachment_contract;
    use crate::testing::contract::note_store_contract;
    use crate::testing::{FakePreferences, InMemoryNoteStore};
    use crate::{Workspace, WorkspaceName};

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn folder(text: &str) -> Folder {
        Folder::parse(text).unwrap()
    }

    fn name() -> WorkspaceName {
        WorkspaceName::new("Notes").unwrap()
    }

    fn location() -> WorkspaceLocation {
        WorkspaceLocation::new("/notes").unwrap()
    }

    /// Un espace de travail « Notes » où les notes `notes` existent, et dont la note des
    /// favoris est `favorites`.
    fn workspace(notes: &[&str], favorites: &str) -> (FavoritesStore, Arc<FakePreferences>) {
        let contents: Vec<(&str, &str)> = notes.iter().map(|n| (*n, "# Note")).collect();
        let preferences = Arc::new(FakePreferences::default());
        let workspaces = Workspaces::default()
            .added(Workspace {
                name: name(),
                location: location(),
            })
            .unwrap()
            .choosing_favorites_note(&name(), Some(path(favorites)))
            .unwrap();
        preferences.save_workspaces(&workspaces).unwrap();
        let store = FavoritesStore::new(
            Arc::new(InMemoryNoteStore::with_notes(&contents)),
            preferences.clone(),
            location(),
        );
        (store, preferences)
    }

    use crate::Workspaces;

    fn favorites_of(preferences: &FakePreferences) -> Option<String> {
        preferences
            .workspaces()
            .unwrap()
            .favorites_note(&name())
            .map(NotePath::to_path)
    }

    fn empty() -> FavoritesStore {
        FavoritesStore::new(
            Arc::new(InMemoryNoteStore::default()),
            Arc::new(FakePreferences::default()),
            location(),
        )
    }

    #[test]
    fn the_favorites_store_honours_the_store_contract() {
        note_store_contract(empty);
    }

    #[test]
    fn the_favorites_store_honours_the_attachment_contract() {
        attachment_contract(empty);
    }

    #[test]
    fn the_favorites_note_follows_a_move_and_a_rename() {
        let (store, preferences) = workspace(&["favoris.md"], "favoris.md");
        store.create_folder(&folder("A")).unwrap();
        store
            .move_note(&path("favoris.md"), &path("A/favoris.md"))
            .unwrap();
        assert_eq!(favorites_of(&preferences).as_deref(), Some("A/favoris.md"));
        store
            .rename(&path("A/favoris.md"), &FileName::parse("liste.md").unwrap())
            .unwrap();
        assert_eq!(favorites_of(&preferences).as_deref(), Some("A/liste.md"));
    }

    #[test]
    fn the_favorites_note_follows_its_folder() {
        let (store, preferences) = workspace(&["A/B/favoris.md"], "A/B/favoris.md");
        store.move_folder(&folder("A"), &folder("Z")).unwrap();
        assert_eq!(
            favorites_of(&preferences).as_deref(),
            Some("Z/B/favoris.md")
        );
    }

    #[test]
    fn a_trashed_favorites_note_or_folder_is_forgotten() {
        let (store, preferences) = workspace(&["favoris.md"], "favoris.md");
        store
            .trash_note(&path("favoris.md"), &path("favoris.md"))
            .unwrap();
        assert_eq!(favorites_of(&preferences), None);

        let (store, preferences) = workspace(&["A/favoris.md"], "A/favoris.md");
        store.trash_folder(&folder("A"), &folder("A")).unwrap();
        assert_eq!(favorites_of(&preferences), None);
    }

    #[test]
    fn another_note_changing_leaves_the_favorites_note_alone() {
        let (store, preferences) = workspace(&["favoris.md", "a.md", "B/c.md"], "favoris.md");
        store.move_note(&path("a.md"), &path("b.md")).unwrap();
        store.move_folder(&folder("B"), &folder("D")).unwrap();
        store.trash_note(&path("b.md"), &path("b.md")).unwrap();
        store.trash_folder(&folder("D"), &folder("D")).unwrap();
        assert_eq!(favorites_of(&preferences).as_deref(), Some("favoris.md"));
    }

    #[test]
    fn restoring_a_trashed_favorites_note_does_not_choose_it_again() {
        let (store, preferences) = workspace(&["favoris.md"], "favoris.md");
        store
            .trash_note(&path("favoris.md"), &path("favoris.md"))
            .unwrap();
        store
            .restore_note(&path("favoris.md"), &path("favoris.md"))
            .unwrap();
        assert_eq!(favorites_of(&preferences), None);
    }

    #[test]
    fn a_refused_change_leaves_the_favorites_note_where_it_is() {
        let (store, preferences) = workspace(&["favoris.md", "b.md"], "favoris.md");
        assert!(store.move_note(&path("favoris.md"), &path("b.md")).is_err());
        assert!(
            store
                .trash_note(&path("nulle.md"), &path("nulle.md"))
                .is_err()
        );
        assert_eq!(favorites_of(&preferences).as_deref(), Some("favoris.md"));
    }

    #[test]
    fn a_workspace_unknown_to_the_preferences_changes_nothing() {
        let store = FavoritesStore::new(
            Arc::new(InMemoryNoteStore::with_notes(&[("a.md", "# A")])),
            Arc::new(FakePreferences::default()),
            location(),
        );
        store.move_note(&path("a.md"), &path("b.md")).unwrap();
    }
}
