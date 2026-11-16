//! Le stockage sur disque respecte le contrat, et les règles propres aux fichiers.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;

use application::testing::contract::note_store_contract;
use application::{LibraryLocation, LibraryOpener, NoteStore, StoreError};
use domain::FileName;
use infrastructure::{FsLibraryOpener, FsNoteStore};
use tempfile::TempDir;

fn name(text: &str) -> FileName {
    FileName::parse(text).unwrap()
}

fn library() -> (TempDir, FsNoteStore) {
    let dir = TempDir::new().unwrap();
    let store = FsNoteStore::new(dir.path().to_path_buf());
    (dir, store)
}

#[test]
fn disk_store_honours_the_contract() {
    let dirs = std::cell::RefCell::new(Vec::new());
    note_store_contract(|| {
        let (dir, store) = library();
        dirs.borrow_mut().push(dir);
        store
    });
}

#[test]
fn only_markdown_files_of_the_library_folder_are_listed() {
    let (dir, store) = library();
    fs::write(dir.path().join("note.md"), "# Note").unwrap();
    fs::write(dir.path().join("lisez-moi.txt"), "texte").unwrap();
    fs::write(dir.path().join(".cachee.md"), "cachée").unwrap();
    fs::create_dir(dir.path().join("archives")).unwrap();
    fs::write(dir.path().join("archives/vieille.md"), "# Vieille").unwrap();
    fs::create_dir(dir.path().join("note.assets")).unwrap();
    let names: Vec<_> = store
        .list()
        .unwrap()
        .into_iter()
        .map(|n| n.file_name)
        .collect();
    assert_eq!(names, [name("note.md")]);
}

#[test]
fn writing_leaves_no_temporary_file() {
    let (dir, store) = library();
    store.write(&name("a.md"), "contenu").unwrap();
    let entries: Vec<_> = fs::read_dir(dir.path())
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(entries, ["a.md"]);
}

#[test]
fn renaming_moves_the_attachment_folder() {
    let (dir, store) = library();
    store
        .write(&name("voyage.md"), "![vue](voyage.assets/vue.png)")
        .unwrap();
    fs::create_dir(dir.path().join("voyage.assets")).unwrap();
    fs::write(dir.path().join("voyage.assets/vue.png"), [1, 2, 3]).unwrap();
    store
        .rename(&name("voyage.md"), &name("lisbonne.md"))
        .unwrap();
    assert!(!dir.path().join("voyage.assets").exists());
    assert_eq!(
        fs::read(dir.path().join("lisbonne.assets/vue.png")).unwrap(),
        [1, 2, 3]
    );
}

#[test]
fn renaming_only_the_letter_case_is_allowed() {
    let (dir, store) = library();
    fs::write(dir.path().join("Courses.md"), "# Courses").unwrap();
    assert!(!store.exists(&name("courses.md")).unwrap());
    store
        .rename(&name("Courses.md"), &name("courses.md"))
        .unwrap();
    let names: Vec<_> = store
        .list()
        .unwrap()
        .into_iter()
        .map(|n| n.file_name)
        .collect();
    assert_eq!(names, [name("courses.md")]);
}

#[test]
fn opening_a_missing_folder_fails() {
    let opener = FsLibraryOpener;
    let missing = LibraryLocation("/chemin/qui/n/existe/pas".into());
    assert!(matches!(
        opener.open(&missing),
        Err(StoreError::Unavailable(_))
    ));
}

#[test]
fn opening_an_existing_folder_gives_its_notes() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.md"), "# A").unwrap();
    let store = FsLibraryOpener
        .open(&LibraryLocation(dir.path().to_path_buf()))
        .unwrap();
    assert_eq!(store.list().unwrap().len(), 1);
}
