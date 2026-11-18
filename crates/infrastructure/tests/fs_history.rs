//! L'historique sur disque : le dossier caché `.history/`, où chaque note a ses versions à son
//! propre chemin, lisibles dans le Finder, et que ni la liste, ni l'index, ni la corbeille ne voient.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::sync::Arc;

use application::testing::history_contract::history_contract;
use application::testing::indexed;
use application::{
    History, HistoryOpener, HistoryPlace, NoteIndex, NoteStore, StoreError, VersionedStore,
    WorkspaceLocation,
};
use domain::history::Version;
use domain::{Folder, NotePath};
use infrastructure::{FsHistories, FsHistory, FsNoteStore};
use tempfile::TempDir;

const READ_ONLY_FOLDER: u32 = 0o555;
const WRITABLE_FOLDER: u32 = 0o755;

fn note(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

fn version(id: &str) -> Version {
    Version::parse(id).unwrap()
}

#[test]
fn the_history_on_disk_honours_the_history_contract() {
    let dirs = std::cell::RefCell::new(Vec::new());
    history_contract(|| {
        let dir = TempDir::new().unwrap();
        let history = FsHistory::new(dir.path().to_path_buf());
        dirs.borrow_mut().push(dir);
        history
    });
}

#[test]
fn a_version_is_a_markdown_file_named_by_its_date_at_the_path_of_its_note() {
    let dir = TempDir::new().unwrap();
    let history = FsHistory::new(dir.path().to_path_buf());
    history
        .write_version(
            &note("Travail/lundi.md"),
            &version("2026-11-18 14h30"),
            "# Lundi",
        )
        .unwrap();
    history
        .write_version(
            &note("Travail/lundi.md"),
            &version("2026-11-18 14h30 (2)"),
            "# Bis",
        )
        .unwrap();
    let folder = dir.path().join(".history/Travail/lundi.md");
    assert_eq!(
        fs::read_to_string(folder.join("2026-11-18 14h30.md")).unwrap(),
        "# Lundi"
    );
    assert_eq!(
        fs::read_to_string(folder.join("2026-11-18 14h30 (2).md")).unwrap(),
        "# Bis"
    );
    assert_eq!(fs::read_dir(&folder).unwrap().count(), 2);
}

#[test]
fn files_that_are_not_versions_are_ignored() {
    let dir = TempDir::new().unwrap();
    let folder = dir.path().join(".history/a.md");
    fs::create_dir_all(&folder).unwrap();
    for name in [
        ".2026-11-18 14h30.md",
        ".DS_Store",
        "notes.txt",
        "2026-11-18 14h30.txt",
    ] {
        fs::write(folder.join(name), "x").unwrap();
    }
    fs::write(folder.join("2026-11-18 14h31.md"), "# A").unwrap();
    let history = FsHistory::new(dir.path().to_path_buf());
    assert_eq!(
        history.versions(&note("a.md")).unwrap(),
        [version("2026-11-18 14h31")]
    );
}

#[test]
fn the_history_of_a_trashed_note_is_in_the_trash_and_leaves_with_it() {
    let dir = TempDir::new().unwrap();
    let history = FsHistory::new(dir.path().to_path_buf());
    history
        .write_version(&note("a.md"), &version("2026-11-18 14h30"), "# A")
        .unwrap();
    history
        .move_note_versions(
            (HistoryPlace::Workspace, &note("a.md")),
            (HistoryPlace::Trash, &note("a.md")),
        )
        .unwrap();
    assert!(
        dir.path()
            .join(".trash/.history/a.md/2026-11-18 14h30.md")
            .is_file()
    );
    assert!(!dir.path().join(".history/a.md").exists());
    let store = FsNoteStore::new(dir.path().to_path_buf());
    store.empty_trash().unwrap();
    assert!(!dir.path().join(".trash").exists());
}

#[test]
fn the_history_is_neither_a_folder_nor_notes_of_the_workspace_nor_of_its_trash() {
    let dir = TempDir::new().unwrap();
    let files = Arc::new(FsNoteStore::new(dir.path().to_path_buf()));
    let history = Arc::new(FsHistory::new(dir.path().to_path_buf()));
    let store = VersionedStore::new(files.clone(), history.clone());
    store.write(&note("a.md"), "# A").unwrap();
    store.write(&note("b.md"), "# B").unwrap();
    history
        .write_version(&note("a.md"), &version("2026-11-18 14h30"), "# Ancien")
        .unwrap();
    history
        .write_version(&note("b.md"), &version("2026-11-18 14h30"), "# Ancien")
        .unwrap();
    store.trash_note(&note("b.md"), &note("b.md")).unwrap();
    assert!(store.folders().unwrap().is_empty());
    let index = indexed(&store);
    let titles: Vec<String> = index
        .all_notes()
        .unwrap()
        .iter()
        .map(|n| n.title().to_owned())
        .collect();
    assert_eq!(titles, ["A"]);
    let trash = store.trash().unwrap();
    assert!(trash.folders.is_empty());
    assert_eq!(trash.notes.len(), 1);
    assert_eq!(trash.notes[0].path, note("b.md"));
}

#[test]
fn a_restored_note_finds_its_history_back_and_the_trash_is_left_clean() {
    let dir = TempDir::new().unwrap();
    let files = Arc::new(FsNoteStore::new(dir.path().to_path_buf()));
    let history = Arc::new(FsHistory::new(dir.path().to_path_buf()));
    let store = VersionedStore::new(files, history.clone());
    store
        .create_folder(&Folder::parse("Travail").unwrap())
        .unwrap();
    store.write(&note("Travail/a.md"), "# A").unwrap();
    history
        .write_version(
            &note("Travail/a.md"),
            &version("2026-11-18 14h30"),
            "# Ancien",
        )
        .unwrap();
    store
        .trash_note(&note("Travail/a.md"), &note("Travail/a.md"))
        .unwrap();
    store
        .restore_note(&note("Travail/a.md"), &note("Travail/a.md"))
        .unwrap();
    assert_eq!(
        history
            .read_version(&note("Travail/a.md"), &version("2026-11-18 14h30"))
            .unwrap(),
        "# Ancien"
    );
    assert!(store.trash().unwrap().notes.is_empty());
}

#[test]
fn an_unwritable_history_is_reported_unavailable() {
    let dir = TempDir::new().unwrap();
    let history = FsHistory::new(dir.path().to_path_buf());
    history
        .write_version(&note("a.md"), &version("2026-11-18 14h30"), "# A")
        .unwrap();
    let folder = dir.path().join(".history/a.md");
    fs::set_permissions(&folder, fs::Permissions::from_mode(READ_ONLY_FOLDER)).unwrap();
    let written = history.write_version(&note("a.md"), &version("2026-11-18 14h31"), "# B");
    let removed = history.remove_versions(&note("a.md"), &[version("2026-11-18 14h30")]);
    fs::set_permissions(&folder, fs::Permissions::from_mode(WRITABLE_FOLDER)).unwrap();
    assert!(matches!(written, Err(StoreError::Unavailable(_))));
    assert!(matches!(removed, Err(StoreError::Unavailable(_))));
    assert!(!folder.join(".2026-11-18 14h31.md").exists());
}

#[test]
fn an_unreadable_history_is_reported_unavailable() {
    let dir = TempDir::new().unwrap();
    let history = FsHistory::new(dir.path().to_path_buf());
    fs::create_dir_all(dir.path().join(".history")).unwrap();
    fs::write(dir.path().join(".history/a.md"), "pas un dossier").unwrap();
    assert!(matches!(
        history.versions(&note("a.md")),
        Err(StoreError::Unavailable(_))
    ));
    fs::create_dir_all(dir.path().join(".history/b.md/2026-11-18 14h30.md")).unwrap();
    assert!(matches!(
        history.read_version(&note("b.md"), &version("2026-11-18 14h30")),
        Err(StoreError::Unavailable(_))
    ));
}

#[test]
fn a_history_that_cannot_be_moved_or_emptied_is_reported_unavailable() {
    let dir = TempDir::new().unwrap();
    let history = FsHistory::new(dir.path().to_path_buf());
    history
        .write_version(&note("Travail/a.md"), &version("2026-11-18 14h30"), "# A")
        .unwrap();
    fs::create_dir_all(dir.path().join(".trash/.history")).unwrap();
    fs::write(dir.path().join(".trash/.history/Travail"), "pas un dossier").unwrap();
    let moved = history.move_folder_versions(
        (HistoryPlace::Workspace, &Folder::parse("Travail").unwrap()),
        (HistoryPlace::Trash, &Folder::parse("Travail/Sous").unwrap()),
    );
    assert!(matches!(moved, Err(StoreError::Unavailable(_))));
    let moved = history.move_note_versions(
        (HistoryPlace::Workspace, &note("Travail/a.md")),
        (HistoryPlace::Trash, &note("Travail/a.md")),
    );
    assert!(matches!(moved, Err(StoreError::Unavailable(_))));
    let trash = dir.path().join(".trash");
    fs::set_permissions(&trash, fs::Permissions::from_mode(READ_ONLY_FOLDER)).unwrap();
    let emptied = history.empty_trash();
    fs::set_permissions(&trash, fs::Permissions::from_mode(WRITABLE_FOLDER)).unwrap();
    assert!(matches!(emptied, Err(StoreError::Unavailable(_))));
}

#[test]
fn each_workspace_opens_the_history_of_its_own_folder() {
    let dir = TempDir::new().unwrap();
    let location = WorkspaceLocation::new(dir.path().to_str().unwrap()).unwrap();
    let history = FsHistories.open(&location).unwrap();
    history
        .write_version(&note("a.md"), &version("2026-11-18 14h30"), "# A")
        .unwrap();
    assert!(
        dir.path()
            .join(".history/a.md/2026-11-18 14h30.md")
            .is_file()
    );
}
