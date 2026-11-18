//! Le stockage sur disque respecte le contrat, et les règles propres aux fichiers.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::os::unix::fs::PermissionsExt;

use application::testing::contract::note_store_contract;
use application::{NoteStore, StoreError, WorkspaceLocation, WorkspaceOpener};
use domain::{FileName, Folder, NotePath};
use infrastructure::{FsNoteStore, FsWorkspaceOpener};
use tempfile::TempDir;

const READ_ONLY_FOLDER: u32 = 0o555;
const WRITABLE_FOLDER: u32 = 0o755;
const NO_PERMISSION: u32 = 0o000;
const READ_WRITE_FILE: u32 = 0o644;

fn name(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

fn file(text: &str) -> FileName {
    FileName::parse(text).unwrap()
}

fn root() -> Folder {
    Folder::root()
}

fn location(path: &std::path::Path) -> WorkspaceLocation {
    WorkspaceLocation::new(path.to_str().unwrap()).unwrap()
}

fn workspace() -> (TempDir, FsNoteStore) {
    let dir = TempDir::new().unwrap();
    let store = FsNoteStore::new(dir.path().to_path_buf());
    (dir, store)
}

#[test]
fn disk_store_honours_the_contract() {
    let dirs = std::cell::RefCell::new(Vec::new());
    note_store_contract(|| {
        let (dir, store) = workspace();
        dirs.borrow_mut().push(dir);
        store
    });
}

#[test]
fn only_markdown_files_of_the_workspace_folder_are_listed() {
    let (dir, store) = workspace();
    fs::write(dir.path().join("note.md"), "# Note").unwrap();
    fs::write(dir.path().join("lisez-moi.txt"), "texte").unwrap();
    fs::write(dir.path().join(".cachee.md"), "cachée").unwrap();
    fs::create_dir(dir.path().join("archives")).unwrap();
    fs::write(dir.path().join("archives/vieille.md"), "# Vieille").unwrap();
    fs::create_dir(dir.path().join("note.assets")).unwrap();
    let names: Vec<_> = store
        .list(&root())
        .unwrap()
        .into_iter()
        .map(|n| n.path)
        .collect();
    assert_eq!(names, [name("note.md")]);
}

#[test]
fn writing_leaves_no_temporary_file() {
    let (dir, store) = workspace();
    store.write(&name("a.md"), "contenu").unwrap();
    let entries: Vec<_> = fs::read_dir(dir.path())
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(entries, ["a.md"]);
}

#[test]
fn renaming_moves_the_attachment_folder() {
    let (dir, store) = workspace();
    store
        .write(&name("voyage.md"), "![vue](voyage.assets/vue.png)")
        .unwrap();
    fs::create_dir(dir.path().join("voyage.assets")).unwrap();
    fs::write(dir.path().join("voyage.assets/vue.png"), [1, 2, 3]).unwrap();
    store
        .rename(&name("voyage.md"), &file("lisbonne.md"))
        .unwrap();
    assert!(!dir.path().join("voyage.assets").exists());
    assert_eq!(
        fs::read(dir.path().join("lisbonne.assets/vue.png")).unwrap(),
        [1, 2, 3]
    );
}

#[test]
fn renaming_only_the_letter_case_is_allowed() {
    let (dir, store) = workspace();
    fs::write(dir.path().join("Courses.md"), "# Courses").unwrap();
    assert_eq!(store.names(&root()).unwrap(), [file("Courses.md")]);
    store
        .rename(&name("Courses.md"), &file("courses.md"))
        .unwrap();
    let names: Vec<_> = store
        .list(&root())
        .unwrap()
        .into_iter()
        .map(|n| n.path)
        .collect();
    assert_eq!(names, [name("courses.md")]);
}

#[test]
fn opening_a_missing_folder_fails() {
    let opener = FsWorkspaceOpener;
    let missing = WorkspaceLocation::new("/chemin/qui/n/existe/pas").unwrap();
    assert!(matches!(
        opener.open(&missing),
        Err(StoreError::Unavailable(_))
    ));
}

#[test]
fn opening_an_existing_folder_gives_its_notes() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.md"), "# A").unwrap();
    let store = FsWorkspaceOpener.open(&location(dir.path())).unwrap();
    assert_eq!(store.list(&root()).unwrap().len(), 1);
}

#[test]
fn a_note_that_is_not_utf8_text_does_not_break_the_list() {
    let (dir, store) = workspace();
    fs::write(dir.path().join("ok.md"), "# Lisible").unwrap();
    fs::write(
        dir.path().join("binaire.md"),
        [0x23, 0x20, 0xff, 0xfe, 0x41],
    )
    .unwrap();
    let mut names: Vec<_> = store
        .list(&root())
        .unwrap()
        .into_iter()
        .map(|n| n.path)
        .collect();
    names.sort();
    assert_eq!(names, [name("binaire.md"), name("ok.md")]);
}

#[test]
fn a_note_that_is_not_utf8_text_cannot_be_opened() {
    let (dir, store) = workspace();
    fs::write(dir.path().join("binaire.md"), [0xff, 0xfe]).unwrap();
    assert_eq!(
        store.read(&name("binaire.md")),
        Err(StoreError::Unreadable(name("binaire.md")))
    );
}

#[test]
fn writing_into_a_read_only_workspace_fails_cleanly() {
    let (dir, store) = workspace();
    let set_mode =
        |mode| fs::set_permissions(dir.path(), fs::Permissions::from_mode(mode)).unwrap();
    set_mode(READ_ONLY_FOLDER);
    let result = store.write(&name("a.md"), "contenu");
    set_mode(WRITABLE_FOLDER);
    assert!(matches!(result, Err(StoreError::Unavailable(_))));
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[test]
fn a_workspace_folder_deleted_while_open_is_reported() {
    let (dir, store) = workspace();
    fs::remove_dir(dir.path()).unwrap();
    assert!(matches!(
        store.list(&root()),
        Err(StoreError::Unavailable(_))
    ));
    assert!(matches!(
        store.write(&name("a.md"), "x"),
        Err(StoreError::Unavailable(_))
    ));
}

#[test]
fn renaming_refuses_when_the_target_attachment_folder_exists() {
    let (dir, store) = workspace();
    store.write(&name("voyage.md"), "texte").unwrap();
    fs::create_dir(dir.path().join("voyage.assets")).unwrap();
    fs::create_dir(dir.path().join("lisbonne.assets")).unwrap();
    assert_eq!(
        store.rename(&name("voyage.md"), &file("lisbonne.md")),
        Err(StoreError::AlreadyExists(name("lisbonne.md")))
    );
    assert_eq!(store.names(&root()).unwrap(), [file("voyage.md")]);
    assert!(dir.path().join("voyage.assets").is_dir());
}

#[test]
fn renaming_a_missing_note_is_reported() {
    let (_dir, store) = workspace();
    assert_eq!(
        store.rename(&name("absente.md"), &file("b.md")),
        Err(StoreError::NotFound(name("absente.md")))
    );
}

#[test]
fn opening_a_file_instead_of_a_folder_fails() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("note.md");
    fs::write(&file, "x").unwrap();
    assert!(matches!(
        FsWorkspaceOpener.open(&location(&file)),
        Err(StoreError::Unavailable(_))
    ));
}

#[test]
fn a_note_without_read_permission_is_reported_as_unavailable() {
    let (dir, store) = workspace();
    let file = dir.path().join("secret.md");
    fs::write(&file, "# Secret").unwrap();
    fs::set_permissions(&file, fs::Permissions::from_mode(NO_PERMISSION)).unwrap();
    let result = store.read(&name("secret.md"));
    fs::set_permissions(&file, fs::Permissions::from_mode(READ_WRITE_FILE)).unwrap();
    assert!(matches!(result, Err(StoreError::Unavailable(_))));
}

fn folder(path: &str) -> Folder {
    Folder::parse(path).unwrap()
}

#[test]
fn hidden_attachment_and_linked_folders_are_not_note_folders() {
    let (dir, store) = workspace();
    for sub in [
        "Travail",
        "Travail/Réunions",
        ".git",
        "voyage.assets",
        "Travail/.cache",
    ] {
        fs::create_dir(dir.path().join(sub)).unwrap();
    }
    std::os::unix::fs::symlink(dir.path().join("Travail"), dir.path().join("Raccourci")).unwrap();
    fs::write(dir.path().join("pas-un-dossier"), "x").unwrap();
    let mut folders: Vec<String> = store
        .folders()
        .unwrap()
        .iter()
        .map(Folder::to_path)
        .collect();
    folders.sort();
    assert_eq!(folders, ["Travail", "Travail/Réunions"]);
}

#[test]
fn a_folder_whose_name_is_not_text_is_skipped() {
    use std::ffi::OsStr;
    use std::os::unix::ffi::OsStrExt;
    let (dir, store) = workspace();
    let created = fs::create_dir(dir.path().join(OsStr::from_bytes(b"illisible-\xff")));
    if created.is_ok() {
        assert!(store.folders().unwrap().is_empty());
    }
}

#[test]
fn a_folder_is_only_found_under_its_exact_name() {
    let (dir, store) = workspace();
    fs::create_dir(dir.path().join("Travail")).unwrap();
    assert_eq!(
        store.create_folder(&folder("travail/Réunions")),
        Err(StoreError::FolderNotFound(folder("travail")))
    );
    assert_eq!(
        store.move_folder(&folder("travail"), &folder("Perso")),
        Err(StoreError::FolderNotFound(folder("travail")))
    );
}

#[test]
fn a_folder_cannot_be_created_where_a_file_stands() {
    let (dir, store) = workspace();
    fs::write(dir.path().join("Travail"), "fichier").unwrap();
    assert_eq!(
        store.create_folder(&folder("Travail")),
        Err(StoreError::FolderAlreadyExists(folder("Travail")))
    );
}

#[test]
fn a_folder_in_a_read_only_folder_cannot_be_created() {
    let (dir, store) = workspace();
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(READ_ONLY_FOLDER)).unwrap();
    let result = store.create_folder(&folder("Travail"));
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(WRITABLE_FOLDER)).unwrap();
    assert!(matches!(result, Err(StoreError::Unavailable(_))));
}

#[test]
fn a_folder_is_moved_on_disk_with_its_attachments() {
    let (dir, store) = workspace();
    store.create_folder(&folder("a")).unwrap();
    store.create_folder(&folder("b")).unwrap();
    store
        .write(&name("a/voyage.md"), "![x](voyage.assets/x.png)")
        .unwrap();
    fs::create_dir(dir.path().join("a/voyage.assets")).unwrap();
    fs::write(dir.path().join("a/voyage.assets/x.png"), "png").unwrap();
    store.move_folder(&folder("a"), &folder("b/a")).unwrap();
    assert!(dir.path().join("b/a/voyage.assets/x.png").is_file());
    assert!(!dir.path().join("a").exists());
}

#[test]
fn a_moved_note_takes_its_attachment_folder_along() {
    let (dir, store) = workspace();
    store
        .write(&name("voyage.md"), "![vue](voyage.assets/vue.png)")
        .unwrap();
    fs::create_dir(dir.path().join("voyage.assets")).unwrap();
    fs::write(dir.path().join("voyage.assets/vue.png"), [1, 2, 3]).unwrap();
    store
        .create_folder(&Folder::parse("Vacances").unwrap())
        .unwrap();
    store
        .move_note(&name("voyage.md"), &name("Vacances/voyage.md"))
        .unwrap();
    assert!(!dir.path().join("voyage.assets").exists());
    assert_eq!(
        fs::read(dir.path().join("Vacances/voyage.assets/vue.png")).unwrap(),
        [1, 2, 3]
    );
}

#[test]
fn moving_refuses_when_the_attachment_folder_is_taken_in_the_target() {
    let (dir, store) = workspace();
    store.write(&name("voyage.md"), "texte").unwrap();
    fs::create_dir_all(dir.path().join("Vacances/voyage.assets")).unwrap();
    assert_eq!(
        store.move_note(&name("voyage.md"), &name("Vacances/voyage.md")),
        Err(StoreError::AlreadyExists(name("Vacances/voyage.md")))
    );
    assert_eq!(store.names(&root()).unwrap(), [file("voyage.md")]);
}

#[test]
fn rewriting_while_keeping_the_date_keeps_the_file_date() {
    let (dir, store) = workspace();
    let path = dir.path().join("x.md");
    fs::write(&path, "avant").unwrap();
    let old = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_000_000_000);
    fs::File::options()
        .write(true)
        .open(&path)
        .unwrap()
        .set_modified(old)
        .unwrap();
    store.write_keeping_date(&name("x.md"), "après").unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "après");
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), old);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[test]
fn rewriting_while_keeping_the_date_fails_cleanly_in_a_read_only_folder() {
    let (dir, store) = workspace();
    fs::write(dir.path().join("x.md"), "avant").unwrap();
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(READ_ONLY_FOLDER)).unwrap();
    let result = store.write_keeping_date(&name("x.md"), "après");
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(WRITABLE_FOLDER)).unwrap();
    assert!(matches!(result, Err(StoreError::Unavailable(_))));
    assert_eq!(
        fs::read_to_string(dir.path().join("x.md")).unwrap(),
        "avant"
    );
}
