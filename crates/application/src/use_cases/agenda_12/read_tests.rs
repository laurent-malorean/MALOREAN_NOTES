use domain::agenda_12::{Columns, YearTone};

use super::super::fixture::*;
use super::*;
use crate::testing::InMemoryNoteStore;

fn read(store: &InMemoryNoteStore, tag: Option<&str>) -> Agenda12View {
    ReadAgenda12::new(store, &clock())
        .execute(&agenda(), tag)
        .unwrap()
}

fn titles(view: &Agenda12View, month: usize) -> Vec<&str> {
    view.cells[month - 1]
        .events
        .iter()
        .map(|entry| entry.event.title.as_str())
        .collect()
}

#[test]
fn the_grid_has_twelve_cells_with_the_open_events_in_their_month() {
    let view = read(&workspace(), None);
    assert_eq!(view.title, "Salons");
    assert_eq!(view.columns, Columns::DEFAULT);
    assert_eq!(view.cells.len(), 12);
    assert_eq!(titles(&view, 1), ["Audit ISO"]);
    assert_eq!(titles(&view, 2), ["Salon Embedded World"]);
    assert_eq!(titles(&view, 5), ["Vivatech"]);
    assert!(titles(&view, 3).is_empty());
}

#[test]
fn an_event_line_has_its_parts_and_the_year_tone_of_the_day_of_the_mac() {
    let view = read(&workspace(), None);
    let embedded = &view.cells[1].events[0];
    assert_eq!(
        embedded.line.text(),
        "10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World"
    );
    assert_eq!(embedded.line.tone, Some(YearTone::Next));
    assert_eq!(view.cells[4].events[0].line.tone, Some(YearTone::Current));
    assert_eq!(embedded.path, path(EMBEDDED_PATH));
}

#[test]
fn the_archives_come_from_the_most_recently_closed_and_are_not_in_the_grid() {
    let view = read(&workspace(), None);
    let archived: Vec<&str> = view
        .archives
        .iter()
        .map(|e| e.event.title.as_str())
        .collect();
    assert_eq!(archived, ["Salon passé", "Salon très passé"]);
    assert!(titles(&view, 3).is_empty());
    assert!(titles(&view, 6).is_empty());
}

#[test]
fn an_unreadable_event_is_left_aside_and_reported_and_an_ordinary_note_is_ignored() {
    let view = read(&workspace(), None);
    assert_eq!(view.unreadable, [path("pro/salons/sans-mois.md")]);
    let all: usize = view.cells.iter().map(|cell| cell.events.len()).sum();
    assert_eq!(all, 3);
}

#[test]
fn the_tags_of_the_events_of_the_grid_make_the_filter_and_the_filter_narrows_the_cells() {
    let view = read(&workspace(), None);
    assert_eq!(view.tags, ["salon"]);
    let filtered = read(&workspace(), Some("Salon"));
    assert_eq!(titles(&filtered, 2), ["Salon Embedded World"]);
    assert!(titles(&filtered, 1).is_empty());
    assert!(titles(&filtered, 5).is_empty());
    assert_eq!(filtered.tags, ["salon"]);
}

#[test]
fn an_agenda_without_events_has_twelve_empty_cells_and_no_folder() {
    let store = InMemoryNoteStore::with_notes(&[(
        AGENDA,
        "---\ntype: agenda-12\ncolonnes: 6\n---\n# Salons\n",
    )]);
    let view = read(&store, None);
    assert_eq!(view.columns, Columns::new(6).unwrap());
    assert!(view.cells.iter().all(|cell| cell.events.is_empty()));
    assert!(view.archives.is_empty());
    assert!(view.tags.is_empty());
}

#[test]
fn a_note_that_is_not_an_agenda_is_refused() {
    let store = workspace();
    let read = ReadAgenda12::new(&store, &clock()).execute(&path("pro/autre.md"), None);
    assert_eq!(read.unwrap_err(), AppError::NotAnAgenda12);
    let missing = ReadAgenda12::new(&store, &clock()).execute(&path("pro/absent.md"), None);
    assert!(matches!(missing, Err(AppError::NoteNotFound(_))));
}

#[test]
fn an_event_is_read_with_its_agenda_and_its_state() {
    let store = workspace();
    let open = ReadAgenda12Event::new(&store, &clock())
        .execute(&path(EMBEDDED_PATH))
        .unwrap();
    assert_eq!(open.agenda, agenda());
    assert_eq!(open.agenda_title, "Salons");
    assert!(!open.closed);
    assert_eq!(open.entry.event.title, "Salon Embedded World");
    let closed = ReadAgenda12Event::new(&store, &clock())
        .execute(&path(OLD_PATH))
        .unwrap();
    assert!(closed.closed);
    assert_eq!(closed.agenda, agenda());
}

#[test]
fn a_note_that_is_not_an_event_or_is_gone_or_unreadable_is_refused() {
    let store = workspace();
    let read = |note: &str| ReadAgenda12Event::new(&store, &clock()).execute(&path(note));
    assert_eq!(
        read("pro/salons/notes.md").unwrap_err(),
        AppError::NotAnAgenda12Event
    );
    assert_eq!(
        read("pro/salons/absent.md").unwrap_err(),
        AppError::EventGone
    );
    assert_eq!(read("pro/absent/x.md").unwrap_err(), AppError::EventGone);
    assert!(matches!(
        read("pro/salons/sans-mois.md"),
        Err(AppError::EventUnreadable(_))
    ));
}

#[test]
fn an_event_without_agenda_note_is_refused() {
    let store = InMemoryNoteStore::with_notes(&[(
        "orphelin/x.md",
        "---\ntype: agenda-12-evenement\nmois: 2\n---\n# X\n",
    )]);
    let read = ReadAgenda12Event::new(&store, &clock()).execute(&path("orphelin/x.md"));
    assert_eq!(read.unwrap_err(), AppError::NotAnAgenda12Event);
}
