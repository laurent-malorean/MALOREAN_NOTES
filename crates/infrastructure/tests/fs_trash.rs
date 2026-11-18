//! La corbeille sur disque : un dossier caché `.trash/` qui garde le chemin d'origine.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;

use application::NoteStore;
use domain::{Folder, NotePath};
use infrastructure::FsNoteStore;
use tempfile::TempDir;

fn note(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

fn folder(text: &str) -> Folder {
    Folder::parse(text).unwrap()
}

/// Un espace de travail avec `Travail/voyage.md` et son image `Travail/voyage.assets/vue.png`.
fn workspace_with_a_trip() -> (TempDir, FsNoteStore) {
    let dir = TempDir::new().unwrap();
    let store = FsNoteStore::new(dir.path().to_path_buf());
    store.create_folder(&folder("Travail")).unwrap();
    store
        .write(&note("Travail/voyage.md"), "![vue](voyage.assets/vue.png)")
        .unwrap();
    fs::create_dir(dir.path().join("Travail/voyage.assets")).unwrap();
    fs::write(dir.path().join("Travail/voyage.assets/vue.png"), [1, 2, 3]).unwrap();
    (dir, store)
}

#[test]
fn a_trashed_note_and_its_attachments_go_to_the_hidden_trash_folder_at_their_path() {
    let (dir, store) = workspace_with_a_trip();
    let voyage = note("Travail/voyage.md");
    store.trash_note(&voyage, &voyage).unwrap();
    assert!(dir.path().join(".trash/Travail/voyage.md").is_file());
    assert_eq!(
        fs::read(dir.path().join(".trash/Travail/voyage.assets/vue.png")).unwrap(),
        [1, 2, 3]
    );
    assert!(!dir.path().join("Travail/voyage.assets").exists());
}

#[test]
fn the_trash_folder_is_never_a_workspace_folder() {
    let (_dir, store) = workspace_with_a_trip();
    let voyage = note("Travail/voyage.md");
    store.trash_note(&voyage, &voyage).unwrap();
    assert_eq!(store.folders().unwrap(), [folder("Travail")]);
    assert!(store.list(&Folder::root()).unwrap().is_empty());
}

#[test]
fn a_restored_note_brings_its_attachments_back() {
    let (dir, store) = workspace_with_a_trip();
    let voyage = note("Travail/voyage.md");
    store.trash_note(&voyage, &voyage).unwrap();
    store.restore_note(&voyage, &voyage).unwrap();
    assert_eq!(
        fs::read(dir.path().join("Travail/voyage.assets/vue.png")).unwrap(),
        [1, 2, 3]
    );
    assert!(!dir.path().join(".trash/Travail").exists());
}

#[test]
fn a_place_taken_by_attachments_alone_is_taken() {
    let (dir, store) = workspace_with_a_trip();
    fs::create_dir_all(dir.path().join(".trash/Travail/voyage.assets")).unwrap();
    let voyage = note("Travail/voyage.md");
    assert!(store.trash_note(&voyage, &voyage).is_err());
    store
        .trash_note(&voyage, &note("Travail/voyage-2.md"))
        .unwrap();
    fs::create_dir(dir.path().join("Travail/voyage.assets")).unwrap();
    assert!(
        store
            .restore_note(&note("Travail/voyage-2.md"), &voyage)
            .is_err()
    );
}

#[test]
fn hidden_finder_files_do_not_keep_an_emptied_trash_folder() {
    let (dir, store) = workspace_with_a_trip();
    let voyage = note("Travail/voyage.md");
    store.trash_note(&voyage, &voyage).unwrap();
    fs::write(dir.path().join(".trash/Travail/.DS_Store"), "x").unwrap();
    store.restore_note(&voyage, &voyage).unwrap();
    assert!(!dir.path().join(".trash/Travail").exists());
    assert!(store.trash().unwrap().folders.is_empty());
}

#[test]
fn emptying_the_trash_removes_the_hidden_folder() {
    let (dir, store) = workspace_with_a_trip();
    store
        .trash_folder(&folder("Travail"), &folder("Travail"))
        .unwrap();
    store.empty_trash().unwrap();
    assert!(!dir.path().join(".trash").exists());
}

#[test]
fn the_trash_root_cannot_be_restored_as_a_folder() {
    let (_dir, store) = workspace_with_a_trip();
    let voyage = note("Travail/voyage.md");
    store.trash_note(&voyage, &voyage).unwrap();
    assert!(
        store
            .restore_folder(&Folder::root(), &Folder::root())
            .is_err()
    );
}
