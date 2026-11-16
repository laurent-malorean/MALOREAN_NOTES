//! Pièces jointes sur disque : contrat, et règles propres aux fichiers.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::os::unix::fs::PermissionsExt;

use application::testing::attachment_contract::attachment_contract;
use application::{NoteStore, StoreError};
use domain::{AttachmentName, NotePath};
use infrastructure::FsNoteStore;
use tempfile::TempDir;

const READ_ONLY_FOLDER: u32 = 0o555;
const WRITABLE_FOLDER: u32 = 0o755;
const NO_PERMISSION: u32 = 0o000;

fn note(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

fn attachment(text: &str) -> AttachmentName {
    AttachmentName::existing(text).unwrap()
}

fn library_with_note() -> (TempDir, FsNoteStore) {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("voyage.md"), "# Voyage").unwrap();
    let store = FsNoteStore::new(dir.path().to_path_buf());
    (dir, store)
}

fn set_mode(path: &std::path::Path, mode: u32) {
    fs::set_permissions(path, fs::Permissions::from_mode(mode)).unwrap();
}

#[test]
fn disk_store_honours_the_attachment_contract() {
    let dirs = std::cell::RefCell::new(Vec::new());
    attachment_contract(|| {
        let dir = TempDir::new().unwrap();
        let store = FsNoteStore::new(dir.path().to_path_buf());
        dirs.borrow_mut().push(dir);
        store
    });
}

#[test]
fn an_attachment_is_written_next_to_the_note_and_nothing_else_is_left() {
    let (dir, store) = library_with_note();
    store
        .write_attachment(&note("voyage.md"), &attachment("mer.png"), b"PNG")
        .unwrap();
    let folder = dir.path().join("voyage.assets");
    assert_eq!(fs::read(folder.join("mer.png")).unwrap(), b"PNG");
    assert_eq!(fs::read_dir(&folder).unwrap().count(), 1);
    let location = store
        .attachment_location(&note("voyage.md"), &attachment("mer.png"))
        .unwrap();
    assert_eq!(location.as_str(), folder.join("mer.png").to_str().unwrap());
}

#[test]
fn a_name_taken_with_another_case_is_never_overwritten() {
    let (dir, store) = library_with_note();
    let folder = dir.path().join("voyage.assets");
    fs::create_dir(&folder).unwrap();
    fs::write(folder.join("Mer.PNG"), "ancienne").unwrap();
    // Le disque du Mac ignore la casse : « mer.png » serait le même fichier.
    let result = store.write_attachment(&note("voyage.md"), &attachment("mer.png"), b"nouvelle");
    assert_eq!(
        result,
        Err(StoreError::AttachmentAlreadyExists("mer.png".into()))
    );
    assert_eq!(fs::read(folder.join("Mer.PNG")).unwrap(), b"ancienne");
}

#[test]
fn only_attachment_files_are_listed() {
    let (dir, store) = library_with_note();
    let folder = dir.path().join("voyage.assets");
    fs::create_dir_all(folder.join("sous-dossier.png")).unwrap();
    fs::write(folder.join("lisez-moi.txt"), "x").unwrap();
    fs::write(folder.join(".DS_Store"), "x").unwrap();
    fs::write(folder.join("vue.jpg"), "x").unwrap();
    let names: Vec<_> = store
        .attachment_names(&note("voyage.md"))
        .unwrap()
        .iter()
        .map(AttachmentName::to_name)
        .collect();
    assert_eq!(names, ["vue.jpg"]);
}

#[test]
fn an_unreadable_attachment_folder_is_reported() {
    let (dir, store) = library_with_note();
    let folder = dir.path().join("voyage.assets");
    fs::create_dir(&folder).unwrap();
    set_mode(&folder, NO_PERMISSION);
    let result = store.attachment_names(&note("voyage.md"));
    set_mode(&folder, WRITABLE_FOLDER);
    assert!(matches!(result, Err(StoreError::Unavailable(_))));
}

#[test]
fn an_attachment_folder_that_cannot_be_created_is_reported() {
    let (dir, store) = library_with_note();
    set_mode(dir.path(), READ_ONLY_FOLDER);
    let result = store.write_attachment(&note("voyage.md"), &attachment("a.png"), b"x");
    set_mode(dir.path(), WRITABLE_FOLDER);
    assert!(matches!(result, Err(StoreError::Unavailable(_))));
}

#[test]
fn a_failed_write_leaves_no_temporary_file() {
    let (dir, store) = library_with_note();
    let folder = dir.path().join("voyage.assets");
    fs::create_dir(&folder).unwrap();
    set_mode(&folder, READ_ONLY_FOLDER);
    let result = store.write_attachment(&note("voyage.md"), &attachment("a.png"), b"x");
    set_mode(&folder, WRITABLE_FOLDER);
    assert!(matches!(result, Err(StoreError::Unavailable(_))));
    assert_eq!(fs::read_dir(&folder).unwrap().count(), 0);
}
