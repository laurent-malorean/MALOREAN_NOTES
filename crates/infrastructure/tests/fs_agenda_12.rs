//! Un agenda 12 sur le vrai disque (fiche 0104) : ses événements sont des fichiers du dossier qui
//! porte son nom, ses archives un sous-dossier ; clore, rouvrir, mettre à la corbeille et déplacer
//! emmènent les fichiers et leurs pièces jointes, rien ne reste derrière.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::path::Path;

use application::NoteStore;
use application::use_cases::{
    CloseAgenda12Event, Closing, CreateAgenda12, CreateAgenda12Event, EventDraft, MoveNote,
    ReadAgenda12, ReopenAgenda12Event, Trash,
};
use domain::agenda_12::Month;
use domain::{Folder, NotePath};
use infrastructure::{FsNoteStore, SystemClock};
use tempfile::TempDir;

fn note(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

fn folder(text: &str) -> Folder {
    Folder::parse(text).unwrap()
}

fn on_disk(root: &Path, relative: &str) -> bool {
    root.join(relative).exists()
}

/// `pro/salons.md` créé par le cas d'usage, avec un événement du mois de février qui a une pièce
/// jointe.
fn workspace() -> (TempDir, FsNoteStore) {
    let dir = TempDir::new().unwrap();
    let store = FsNoteStore::new(dir.path().to_path_buf());
    store.create_folder(&folder("pro")).unwrap();
    store.create_folder(&folder("Perso")).unwrap();
    let agenda = CreateAgenda12::new(&store)
        .execute(&folder("pro"), "Salons")
        .unwrap();
    assert_eq!(agenda, note("pro/salons.md"));
    let mut draft = EventDraft::untitled(Month::new(2).unwrap());
    draft.title = "Embedded World".to_owned();
    let event = CreateAgenda12Event::new(&store)
        .execute(&agenda, draft)
        .unwrap();
    assert_eq!(event, note("pro/salons/embedded-world.md"));
    store
        .write(
            &event,
            "---\ntype: agenda-12-evenement\nmois: 2\n---\n# Embedded World\n![](embedded-world.assets/plan.png)\n",
        )
        .unwrap();
    let assets = dir.path().join("pro/salons/embedded-world.assets");
    fs::create_dir(&assets).unwrap();
    fs::write(assets.join("plan.png"), [1, 2, 3]).unwrap();
    (dir, store)
}

#[test]
fn an_agenda_is_born_without_a_folder_and_the_first_event_creates_it() {
    let dir = TempDir::new().unwrap();
    let store = FsNoteStore::new(dir.path().to_path_buf());
    let agenda = CreateAgenda12::new(&store)
        .execute(&Folder::root(), "Salons")
        .unwrap();
    assert!(on_disk(dir.path(), "salons.md"));
    assert!(!on_disk(dir.path(), "salons"));
    CreateAgenda12Event::new(&store)
        .execute(&agenda, EventDraft::untitled(Month::new(1).unwrap()))
        .unwrap();
    assert_eq!(
        fs::read_to_string(dir.path().join("salons/sans-titre.md")).unwrap(),
        "---\ntype: agenda-12-evenement\nmois: 1\n---\n# Sans titre\n"
    );
}

#[test]
fn closing_moves_the_file_and_its_attachments_into_the_archives_and_prepares_the_next() {
    let (dir, store) = workspace();
    let closed = CloseAgenda12Event::new(&store, &SystemClock)
        .execute(
            &note("pro/salons/embedded-world.md"),
            Closing::WithSuccessor,
        )
        .unwrap();
    assert_eq!(closed.closed, note("pro/salons/archives/embedded-world.md"));
    assert_eq!(closed.successor, Some(note("pro/salons/embedded-world.md")));
    assert!(on_disk(dir.path(), "pro/salons/archives/embedded-world.md"));
    assert!(on_disk(
        dir.path(),
        "pro/salons/archives/embedded-world.assets/plan.png"
    ));
    assert!(!on_disk(dir.path(), "pro/salons/embedded-world.assets"));
    let text =
        fs::read_to_string(dir.path().join("pro/salons/archives/embedded-world.md")).unwrap();
    assert!(text.contains("clos-le: "));
    // La copie prend le nom libre du titre, sans texte.
    assert_eq!(
        fs::read_to_string(dir.path().join("pro/salons/embedded-world.md")).unwrap(),
        "---\ntype: agenda-12-evenement\nmois: 2\n---\n# Embedded World\n"
    );
    let view = ReadAgenda12::new(&store, &SystemClock)
        .execute(&note("pro/salons.md"), None)
        .unwrap();
    assert_eq!(view.archives.len(), 1);
    assert_eq!(view.cells[1].events.len(), 1);
}

#[test]
fn reopening_brings_the_file_and_its_attachments_back_with_a_suffix_when_the_name_is_taken() {
    let (dir, store) = workspace();
    let closed = CloseAgenda12Event::new(&store, &SystemClock)
        .execute(
            &note("pro/salons/embedded-world.md"),
            Closing::WithSuccessor,
        )
        .unwrap();
    // Le nom est pris par la copie : l'événement reçoit un suffixe.
    let reopened = ReopenAgenda12Event::new(&store)
        .execute(&closed.closed)
        .unwrap();
    assert_eq!(reopened, note("pro/salons/embedded-world-2.md"));
    assert!(on_disk(
        dir.path(),
        "pro/salons/embedded-world-2.assets/plan.png"
    ));
}

#[test]
fn trashing_an_agenda_takes_the_whole_folder_and_restoring_brings_back_events_and_archives() {
    let (dir, store) = workspace();
    CloseAgenda12Event::new(&store, &SystemClock)
        .execute(&note("pro/salons/embedded-world.md"), Closing::Alone)
        .unwrap();
    let trash = Trash::new(&store);
    trash.put_note(&note("pro/salons.md")).unwrap();
    assert!(!on_disk(dir.path(), "pro/salons.md"));
    assert!(!on_disk(dir.path(), "pro/salons"));
    assert!(on_disk(
        dir.path(),
        ".trash/pro/salons/archives/embedded-world.assets/plan.png"
    ));
    trash.restore_note(&note("pro/salons.md")).unwrap();
    assert!(on_disk(dir.path(), "pro/salons.md"));
    assert!(on_disk(dir.path(), "pro/salons/archives/embedded-world.md"));
    assert!(on_disk(
        dir.path(),
        "pro/salons/archives/embedded-world.assets/plan.png"
    ));
    assert!(trash.contents().unwrap().notes.is_empty());
}

#[test]
fn a_moved_agenda_takes_its_folder_with_its_archives_and_attachments() {
    let (dir, store) = workspace();
    CloseAgenda12Event::new(&store, &SystemClock)
        .execute(&note("pro/salons/embedded-world.md"), Closing::Alone)
        .unwrap();
    let moved = MoveNote::new(&store)
        .execute(&note("pro/salons.md"), &folder("Perso"))
        .unwrap();
    assert_eq!(moved, note("Perso/salons.md"));
    assert!(on_disk(
        dir.path(),
        "Perso/salons/archives/embedded-world.assets/plan.png"
    ));
    assert!(!on_disk(dir.path(), "pro/salons"));
}
