//! Les gestes en attente sur disque : le dossier caché `.pending-gestures/`, que rien ne voit.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::os::unix::fs::PermissionsExt;

use application::testing::gestures_contract::pending_gestures_contract;
use application::{
    Gesture, GestureId, GestureStep, NoteStore, PendingGestures, PendingGesturesOpener, StoreError,
    WorkspaceLocation,
};
use domain::{Folder, NotePath};
use infrastructure::{FsNoteStore, FsPendingGestures, FsPendingGesturesOpener};
use tempfile::TempDir;

const READ_ONLY_FOLDER: u32 = 0o555;
const WRITABLE_FOLDER: u32 = 0o755;

fn rewrite(text: &str) -> Gesture {
    Gesture::new(vec![GestureStep::Rewrite {
        note: NotePath::parse("a.md").unwrap(),
        content: text.to_owned(),
    }])
}

#[test]
fn the_gestures_on_disk_honour_the_contract() {
    let dirs = std::cell::RefCell::new(Vec::new());
    pending_gestures_contract(|| {
        let dir = TempDir::new().unwrap();
        let pending = FsPendingGestures::new(dir.path());
        dirs.borrow_mut().push(dir);
        pending
    });
}

#[test]
fn a_gesture_is_kept_in_a_hidden_folder_the_workspace_does_not_see() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join("a.md"), "# A").unwrap();
    let pending = FsPendingGestures::new(dir.path());
    let id = pending.begin(&rewrite("X")).unwrap();
    assert_eq!(id, GestureId(1));
    assert!(dir.path().join(".pending-gestures/1.json").is_file());
    let store = FsNoteStore::new(dir.path().to_path_buf());
    assert!(store.folders().unwrap().is_empty());
    assert_eq!(store.list(&Folder::root()).unwrap().len(), 1);
    pending.end(id).unwrap();
    assert!(!dir.path().join(".pending-gestures/1.json").exists());
}

#[test]
fn gestures_kept_by_an_earlier_launch_are_found_again() {
    let dir = TempDir::new().unwrap();
    let location = WorkspaceLocation::new(dir.path().to_str().unwrap()).unwrap();
    let first = FsPendingGesturesOpener.open(&location).unwrap();
    let id = first.begin(&rewrite("X")).unwrap();
    drop(first);
    let second = FsPendingGesturesOpener.open(&location).unwrap();
    assert_eq!(second.interrupted().unwrap(), [(id, rewrite("X"))]);
}

#[test]
fn a_file_that_is_not_a_gesture_is_ignored_and_an_unreadable_gesture_is_removed() {
    let dir = TempDir::new().unwrap();
    let folder = dir.path().join(".pending-gestures");
    fs::create_dir(&folder).unwrap();
    fs::write(folder.join("3.tmp"), "[]").unwrap();
    fs::write(folder.join("notes.txt"), "x").unwrap();
    fs::write(folder.join("4.json"), "pas du json").unwrap();
    fs::write(
        folder.join("5.json"),
        r#"[{"rewrite":{"note":"../hors.md","content":"x"}}]"#,
    )
    .unwrap();
    let pending = FsPendingGestures::new(dir.path());
    assert!(pending.interrupted().unwrap().is_empty());
    assert!(!folder.join("4.json").exists());
    assert!(!folder.join("5.json").exists());
    assert!(folder.join("3.tmp").exists());
    // Le numéro suivant passe au-dessus de tout geste gardé ; un fichier temporaire est ignoré.
    assert_eq!(pending.begin(&rewrite("Y")).unwrap(), GestureId(1));
}

#[test]
fn the_steps_of_a_gesture_are_written_as_the_files_they_change() {
    let dir = TempDir::new().unwrap();
    let pending = FsPendingGestures::new(dir.path());
    let gesture = Gesture::new(vec![
        GestureStep::Rewrite {
            note: NotePath::parse("c/entreprises/acme.md").unwrap(),
            content: "texte".to_owned(),
        },
        GestureStep::Trash {
            note: NotePath::parse("c/personnes/jean.md").unwrap(),
        },
    ]);
    pending.begin(&gesture).unwrap();
    let written = fs::read_to_string(dir.path().join(".pending-gestures/1.json")).unwrap();
    assert_eq!(
        written,
        r#"[{"rewrite":{"note":"c/entreprises/acme.md","content":"texte"}},{"trash":{"note":"c/personnes/jean.md"}}]"#
    );
}

#[test]
fn a_gesture_that_cannot_be_kept_is_an_error_and_leaves_nothing() {
    let dir = TempDir::new().unwrap();
    let pending = FsPendingGestures::new(dir.path());
    pending.begin(&rewrite("X")).unwrap();
    let folder = dir.path().join(".pending-gestures");
    fs::set_permissions(&folder, fs::Permissions::from_mode(READ_ONLY_FOLDER)).unwrap();
    let begun = pending.begin(&rewrite("Y"));
    let ended = pending.end(GestureId(1));
    fs::set_permissions(&folder, fs::Permissions::from_mode(WRITABLE_FOLDER)).unwrap();
    assert!(matches!(begun, Err(StoreError::Unavailable(_))));
    assert!(matches!(ended, Err(StoreError::Unavailable(_))));
    assert_eq!(pending.interrupted().unwrap().len(), 1);
}

#[test]
fn a_folder_that_cannot_be_listed_is_an_error_not_an_empty_list() {
    let dir = TempDir::new().unwrap();
    fs::write(dir.path().join(".pending-gestures"), "pas un dossier").unwrap();
    let pending = FsPendingGestures::new(dir.path());
    assert!(matches!(
        pending.interrupted(),
        Err(StoreError::Unavailable(_))
    ));
}

#[test]
fn a_number_whose_temporary_file_is_there_is_not_taken() {
    let dir = TempDir::new().unwrap();
    let folder = dir.path().join(".pending-gestures");
    fs::create_dir(&folder).unwrap();
    fs::write(folder.join("1.tmp"), "[]").unwrap();
    fs::write(folder.join("2.tmp"), "[]").unwrap();
    let pending = FsPendingGestures::new(dir.path());
    let id = pending.begin(&rewrite("X")).unwrap();
    assert_eq!(id, GestureId(3));
    assert_eq!(pending.interrupted().unwrap(), [(id, rewrite("X"))]);
}
