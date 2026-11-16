//! Le stockage sur disque respecte le contrat, et les règles propres aux fichiers.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::os::unix::fs::PermissionsExt;

use application::testing::contract::note_store_contract;
use application::{LibraryLocation, LibraryOpener, NoteStore, StoreError};
use domain::FileName;
use infrastructure::{FsLibraryOpener, FsNoteStore};
use tempfile::TempDir;

const READ_ONLY_FOLDER: u32 = 0o555;
const WRITABLE_FOLDER: u32 = 0o755;

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

#[test]
fn a_note_that_is_not_utf8_text_does_not_break_the_list() {
    let (dir, store) = library();
    fs::write(dir.path().join("ok.md"), "# Lisible").unwrap();
    fs::write(
        dir.path().join("binaire.md"),
        [0x23, 0x20, 0xff, 0xfe, 0x41],
    )
    .unwrap();
    let mut names: Vec<_> = store
        .list()
        .unwrap()
        .into_iter()
        .map(|n| n.file_name)
        .collect();
    names.sort();
    assert_eq!(names, [name("binaire.md"), name("ok.md")]);
}

#[test]
fn a_note_that_is_not_utf8_text_cannot_be_opened() {
    let (dir, store) = library();
    fs::write(dir.path().join("binaire.md"), [0xff, 0xfe]).unwrap();
    assert_eq!(
        store.read(&name("binaire.md")),
        Err(StoreError::Unreadable(name("binaire.md")))
    );
}

#[test]
fn writing_into_a_read_only_library_fails_cleanly() {
    let (dir, store) = library();
    let set_mode =
        |mode| fs::set_permissions(dir.path(), fs::Permissions::from_mode(mode)).unwrap();
    set_mode(READ_ONLY_FOLDER);
    let result = store.write(&name("a.md"), "contenu");
    set_mode(WRITABLE_FOLDER);
    assert!(matches!(result, Err(StoreError::Unavailable(_))));
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[test]
fn a_library_folder_deleted_while_open_is_reported() {
    let (dir, store) = library();
    fs::remove_dir(dir.path()).unwrap();
    assert!(matches!(store.list(), Err(StoreError::Unavailable(_))));
    assert!(matches!(
        store.write(&name("a.md"), "x"),
        Err(StoreError::Unavailable(_))
    ));
}

#[test]
fn renaming_refuses_when_the_target_attachment_folder_exists() {
    let (dir, store) = library();
    store.write(&name("voyage.md"), "texte").unwrap();
    fs::create_dir(dir.path().join("voyage.assets")).unwrap();
    fs::create_dir(dir.path().join("lisbonne.assets")).unwrap();
    assert_eq!(
        store.rename(&name("voyage.md"), &name("lisbonne.md")),
        Err(StoreError::AlreadyExists(name("lisbonne.md")))
    );
    assert!(store.exists(&name("voyage.md")).unwrap());
    assert!(dir.path().join("voyage.assets").is_dir());
}

#[test]
fn renaming_a_missing_note_is_reported() {
    let (_dir, store) = library();
    assert_eq!(
        store.rename(&name("absente.md"), &name("b.md")),
        Err(StoreError::NotFound(name("absente.md")))
    );
}

#[test]
fn opening_a_file_instead_of_a_folder_fails() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("note.md");
    fs::write(&file, "x").unwrap();
    assert!(matches!(
        FsLibraryOpener.open(&LibraryLocation(file)),
        Err(StoreError::Unavailable(_))
    ));
}
