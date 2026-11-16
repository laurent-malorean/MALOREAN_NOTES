//! Surveillance d'un vrai dossier : les changements faits hors de l'application arrivent.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::sync::Arc;
use std::sync::mpsc::{Receiver, channel};
use std::time::Duration;

use application::{LibraryChange, LibraryLocation, LibraryWatcher, StoreError};
use domain::NotePath;
use infrastructure::FsLibraryWatcher;

/// Le disque du Mac annonce les changements avec un peu de retard.
const ARRIVAL: Duration = Duration::from_secs(10);
/// Temps pendant lequel on vérifie qu'un changement ignoré n'arrive pas.
const SILENCE: Duration = Duration::from_millis(1500);

fn watch(folder: &tempfile::TempDir) -> (Box<dyn application::Watching>, Receiver<LibraryChange>) {
    let (sender, received) = channel();
    let location = LibraryLocation::new(folder.path().to_str().unwrap()).unwrap();
    let watching = FsLibraryWatcher
        .watch(
            &location,
            Arc::new(move |change| {
                let _sent = sender.send(change);
            }),
        )
        .unwrap();
    // FSEvents ne voit pas les changements faits dans l'instant qui suit le départ.
    std::thread::sleep(Duration::from_millis(500));
    (watching, received)
}

/// Attend un changement qui annonce `note` ; ceux qui n'en parlent pas sont sautés.
/// Chaque attente dure au plus [`ARRIVAL`] : sans annonce, la surveillance a échoué.
fn announces(received: &Receiver<LibraryChange>, note: &str) -> bool {
    let wanted = NotePath::parse(note).unwrap();
    while let Ok(change) = received.recv_timeout(ARRIVAL) {
        if change.notes.contains(&wanted) {
            return true;
        }
    }
    false
}

#[test]
fn a_note_written_outside_the_app_is_announced() {
    let folder = tempfile::tempdir().unwrap();
    let (_watching, received) = watch(&folder);
    fs::write(folder.path().join("courses.md"), "# Courses").unwrap();
    assert!(announces(&received, "courses.md"));
}

#[test]
fn a_note_in_a_folder_changed_then_deleted_is_announced() {
    let folder = tempfile::tempdir().unwrap();
    fs::create_dir(folder.path().join("Travail")).unwrap();
    fs::write(folder.path().join("Travail/lundi.md"), "v1").unwrap();
    let (_watching, received) = watch(&folder);
    fs::remove_file(folder.path().join("Travail/lundi.md")).unwrap();
    assert!(announces(&received, "Travail/lundi.md"));
}

#[test]
fn hidden_files_and_attachments_are_not_announced() {
    let folder = tempfile::tempdir().unwrap();
    fs::create_dir(folder.path().join("voyage.assets")).unwrap();
    let (_watching, received) = watch(&folder);
    fs::write(folder.path().join(".courses.md.enregistrement"), "x").unwrap();
    fs::write(folder.path().join("voyage.assets/mer.png"), "x").unwrap();
    assert!(received.recv_timeout(SILENCE).is_err());
}

#[test]
fn nothing_is_announced_once_watching_stops() {
    let folder = tempfile::tempdir().unwrap();
    let (watching, received) = watch(&folder);
    drop(watching);
    fs::write(folder.path().join("courses.md"), "# Courses").unwrap();
    assert!(received.recv_timeout(SILENCE).is_err());
}

#[test]
fn a_missing_folder_cannot_be_watched() {
    let location = LibraryLocation::new("/dossier/qui/n-existe/pas").unwrap();
    let result = FsLibraryWatcher.watch(&location, Arc::new(|_| {}));
    assert!(
        matches!(result, Err(StoreError::Unavailable(message)) if message.starts_with("surveillance impossible"))
    );
}
