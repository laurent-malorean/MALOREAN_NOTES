use domain::Folder;

use super::super::fixture::*;
use super::*;
use crate::testing::InMemoryNoteStore;

fn close(store: &InMemoryNoteStore, note: &str, closing: Closing) -> Result<Closed, AppError> {
    CloseAgenda12Event::new(store, &clock()).execute(&path(note), closing)
}

#[test]
fn closing_moves_the_event_into_the_archives_with_the_day_of_the_closing() {
    let store = workspace();
    let closed = close(&store, EMBEDDED_PATH, Closing::Alone).unwrap();
    assert_eq!(
        closed.closed,
        path("pro/salons/archives/salon-embedded-world.md")
    );
    assert_eq!(closed.successor, None);
    assert!(store.read(&path(EMBEDDED_PATH)).is_err());
    assert_eq!(
        text(&store, "pro/salons/archives/salon-embedded-world.md"),
        "---\ntype: agenda-12-evenement\nmois: 2\njour: 10\nannee: 2027\njour-fin: 13\npays: DE\nville: Nuremberg\ntags: [salon]\nclos-le: 2026-11-27\n---\n# Salon Embedded World\n\nStand 4A-110.\n"
    );
}

#[test]
fn closing_and_preparing_the_next_creates_the_copy_in_the_grid() {
    let store = workspace();
    let closed = close(&store, EMBEDDED_PATH, Closing::WithSuccessor).unwrap();
    assert_eq!(
        closed.closed,
        path("pro/salons/archives/salon-embedded-world.md")
    );
    let successor = closed.successor.unwrap();
    assert_eq!(successor, path(EMBEDDED_PATH));
    assert_eq!(
        text(&store, EMBEDDED_PATH),
        "---\ntype: agenda-12-evenement\nmois: 2\npays: DE\nville: Nuremberg\ntags: [salon]\n---\n# Salon Embedded World\n"
    );
}

#[test]
fn the_archives_folder_is_born_with_the_first_closing() {
    let store = InMemoryNoteStore::with_notes(&[
        (AGENDA, "---\ntype: agenda-12\n---\n# Salons\n"),
        (AUDIT_PATH, AUDIT),
    ]);
    let archives = Folder::parse("pro/salons/archives").unwrap();
    assert!(!store.folders().unwrap().contains(&archives));
    close(&store, AUDIT_PATH, Closing::Alone).unwrap();
    assert!(store.folders().unwrap().contains(&archives));
}

#[test]
fn a_name_taken_in_the_archives_gets_a_suffix_and_an_open_and_a_closed_event_may_share_a_name() {
    let store = workspace();
    store
        .write(
            &path("pro/salons/archives/audit-iso.md"),
            &OLD.replace("Salon passé", "Audit ISO"),
        )
        .unwrap();
    let closed = close(&store, AUDIT_PATH, Closing::Alone).unwrap();
    assert_eq!(closed.closed, path("pro/salons/archives/audit-iso-2.md"));
}

#[test]
fn an_event_already_closed_cannot_be_closed_again() {
    let store = workspace();
    assert_eq!(
        close(&store, OLD_PATH, Closing::Alone),
        Err(AppError::EventAlreadyClosed)
    );
    assert_eq!(text(&store, OLD_PATH), OLD);
}

#[test]
fn a_gone_foreign_or_unreadable_note_cannot_be_closed() {
    let store = workspace();
    assert_eq!(
        close(&store, "pro/salons/absent.md", Closing::Alone),
        Err(AppError::EventGone)
    );
    assert_eq!(
        close(&store, "pro/salons/notes.md", Closing::Alone),
        Err(AppError::NotAnAgenda12Event)
    );
    assert!(matches!(
        close(&store, "pro/salons/sans-mois.md", Closing::WithSuccessor),
        Err(AppError::EventUnreadable(_))
    ));
}

#[test]
fn a_failed_write_leaves_the_event_open_and_untouched() {
    let store = workspace();
    store.fail_writes_to(&path(AUDIT_PATH));
    let refused = close(&store, AUDIT_PATH, Closing::WithSuccessor);
    assert!(matches!(refused, Err(AppError::StorageUnavailable(_))));
    store.stop_failing();
    assert_eq!(text(&store, AUDIT_PATH), AUDIT);
    assert!(
        store
            .read(&path("pro/salons/archives/audit-iso.md"))
            .is_err()
    );
}

#[test]
fn reopening_puts_the_event_back_in_the_grid_without_its_closing_day() {
    let store = workspace();
    let reopened = ReopenAgenda12Event::new(&store)
        .execute(&path(OLD_PATH))
        .unwrap();
    assert_eq!(reopened, path("pro/salons/salon-passe.md"));
    assert_eq!(
        text(&store, "pro/salons/salon-passe.md"),
        "---\ntype: agenda-12-evenement\nmois: 3\nannee: 2025\n---\n# Salon passé\n"
    );
    assert!(store.read(&path(OLD_PATH)).is_err());
}

#[test]
fn reopening_an_event_whose_name_is_taken_gives_it_a_suffix() {
    let store = workspace();
    store
        .write(
            &path("pro/salons/salon-passe.md"),
            &AUDIT.replace("Audit ISO", "Salon passé"),
        )
        .unwrap();
    let reopened = ReopenAgenda12Event::new(&store)
        .execute(&path(OLD_PATH))
        .unwrap();
    assert_eq!(reopened, path("pro/salons/salon-passe-2.md"));
}

#[test]
fn an_open_gone_or_foreign_event_cannot_be_reopened() {
    let store = workspace();
    let reopen = |note: &str| ReopenAgenda12Event::new(&store).execute(&path(note));
    assert_eq!(reopen(AUDIT_PATH), Err(AppError::EventNotClosed));
    assert_eq!(
        reopen("pro/salons/archives/absent.md"),
        Err(AppError::EventGone)
    );
    assert_eq!(
        reopen("pro/salons/notes.md"),
        Err(AppError::NotAnAgenda12Event)
    );
}

#[test]
fn closing_then_reopening_gives_back_the_event_as_it_was() {
    let store = workspace();
    let closed = close(&store, EMBEDDED_PATH, Closing::Alone).unwrap();
    let reopened = ReopenAgenda12Event::new(&store)
        .execute(&closed.closed)
        .unwrap();
    assert_eq!(reopened, path(EMBEDDED_PATH));
    assert_eq!(text(&store, EMBEDDED_PATH), EMBEDDED);
}
