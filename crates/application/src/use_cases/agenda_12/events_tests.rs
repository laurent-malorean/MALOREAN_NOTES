use domain::agenda_12::{DateError, TitleError};

use super::super::fixture::*;
use super::*;
use crate::testing::InMemoryNoteStore;

fn month(number: u32) -> Month {
    Month::new(number).unwrap()
}

fn end(day: u32, month_number: u32) -> Option<EventEnd> {
    Some(EventEnd {
        day,
        month: month(month_number),
    })
}

#[test]
fn an_agenda_is_created_under_the_name_of_its_title_without_events_nor_folder() {
    let store = InMemoryNoteStore::with_notes(&[("pro/salons.md", "# Autre")]);
    let created = CreateAgenda12::new(&store)
        .execute(&Folder::parse("pro").unwrap(), "  Mes   salons ")
        .unwrap();
    assert_eq!(created, path("pro/mes-salons.md"));
    assert_eq!(
        text(&store, "pro/mes-salons.md"),
        "---\ntype: agenda-12\n---\n# Mes   salons\n"
    );
    let again = CreateAgenda12::new(&store)
        .execute(&Folder::parse("pro").unwrap(), "Salons")
        .unwrap();
    assert_eq!(again, path("pro/salons-2.md"));
    assert!(
        !store
            .folders()
            .unwrap()
            .contains(&Folder::parse("pro/mes-salons").unwrap())
    );
}

#[test]
fn an_empty_title_is_refused_for_an_agenda() {
    let store = InMemoryNoteStore::default();
    assert_eq!(
        CreateAgenda12::new(&store).execute(&Folder::root(), "  "),
        Err(AppError::EventTitle(TitleError::Empty))
    );
    assert_eq!(
        CreateAgenda12::new(&store).execute(&Folder::root(), "a\nb"),
        Err(AppError::EventTitle(TitleError::NotOneLine))
    );
    assert!(store.names(&Folder::root()).unwrap().is_empty());
}

#[test]
fn the_columns_are_written_and_nothing_else_changes() {
    let store = workspace();
    ChangeColumns::new(&store)
        .execute(&agenda(), Columns::new(6).unwrap())
        .unwrap();
    assert_eq!(
        text(&store, AGENDA),
        "---\ntype: agenda-12\ncolonnes: 6\n---\n# Salons\n"
    );
    ChangeColumns::new(&store)
        .execute(&agenda(), Columns::new(3).unwrap())
        .unwrap();
    assert_eq!(
        text(&store, AGENDA),
        "---\ntype: agenda-12\ncolonnes: 3\n---\n# Salons\n"
    );
}

#[test]
fn the_columns_of_a_note_that_is_not_an_agenda_are_refused() {
    let store = workspace();
    let refused = ChangeColumns::new(&store).execute(&path("pro/autre.md"), Columns::DEFAULT);
    assert_eq!(refused, Err(AppError::NotAnAgenda12));
    assert_eq!(text(&store, "pro/autre.md"), "# Autre\n");
}

#[test]
fn the_plus_of_a_cell_creates_an_untitled_event_of_that_month_and_its_folder() {
    let store = InMemoryNoteStore::with_notes(&[(AGENDA, "---\ntype: agenda-12\n---\n# Salons\n")]);
    let created = CreateAgenda12Event::new(&store)
        .execute(&agenda(), EventDraft::untitled(month(2)))
        .unwrap();
    assert_eq!(created, path("pro/salons/sans-titre.md"));
    assert_eq!(
        text(&store, "pro/salons/sans-titre.md"),
        "---\ntype: agenda-12-evenement\nmois: 2\n---\n# Sans titre\n"
    );
    let second = CreateAgenda12Event::new(&store)
        .execute(&agenda(), EventDraft::untitled(month(3)))
        .unwrap();
    assert_eq!(second, path("pro/salons/sans-titre-2.md"));
}

#[test]
fn an_event_is_created_with_all_its_fields_in_the_order_of_the_format() {
    let store = workspace();
    let draft = EventDraft {
        title: "  Vivatech 2027 ".to_owned(),
        month: month(5),
        day: Some(30),
        year: Some(2027),
        end: end(2, 6),
        country: Country::from_code("fr"),
        city: Some("Paris".to_owned()),
        tags: vec!["salon".to_owned(), "pro".to_owned()],
    };
    let created = CreateAgenda12Event::new(&store)
        .execute(&agenda(), draft)
        .unwrap();
    assert_eq!(created, path("pro/salons/vivatech-2027.md"));
    assert_eq!(
        text(&store, "pro/salons/vivatech-2027.md"),
        "---\ntype: agenda-12-evenement\nmois: 5\njour: 30\nannee: 2027\njour-fin: 2\nmois-fin: 6\npays: FR\nville: Paris\ntags: [salon, pro]\n---\n# Vivatech 2027\n"
    );
}

#[test]
fn an_event_whose_name_is_taken_gets_the_next_free_suffix() {
    let store = workspace();
    let mut draft = EventDraft::untitled(month(5));
    draft.title = "Vivatech".to_owned();
    let created = CreateAgenda12Event::new(&store)
        .execute(&agenda(), draft)
        .unwrap();
    assert_eq!(created, path("pro/salons/vivatech-2.md"));
}

#[test]
fn an_event_with_an_impossible_date_or_a_bad_title_is_refused_and_nothing_is_written() {
    let store = InMemoryNoteStore::with_notes(&[(AGENDA, "---\ntype: agenda-12\n---\n# Salons\n")]);
    let create = |draft: EventDraft| CreateAgenda12Event::new(&store).execute(&agenda(), draft);
    let mut february = EventDraft::untitled(month(2));
    february.day = Some(31);
    assert_eq!(
        create(february),
        Err(AppError::EventDate(DateError::NoSuchDay))
    );
    let mut endless = EventDraft::untitled(month(2));
    endless.end = end(13, 2);
    assert_eq!(
        create(endless),
        Err(AppError::EventDate(DateError::EndWithoutDay))
    );
    let mut empty = EventDraft::untitled(month(2));
    empty.title = " ".to_owned();
    assert_eq!(create(empty), Err(AppError::EventTitle(TitleError::Empty)));
    assert!(
        !store
            .folders()
            .unwrap()
            .contains(&Folder::parse("pro/salons").unwrap())
    );
}

#[test]
fn an_event_cannot_be_created_in_a_note_that_is_not_an_agenda() {
    let store = workspace();
    let created = CreateAgenda12Event::new(&store)
        .execute(&path("pro/autre.md"), EventDraft::untitled(month(1)));
    assert_eq!(created, Err(AppError::NotAnAgenda12));
}

fn change(store: &InMemoryNoteStore, note: &str, change: EventChange) -> Result<(), AppError> {
    ChangeAgenda12Event::new(store).execute(&path(note), change)
}

#[test]
fn the_title_changes_in_the_note_and_the_file_name_never_does() {
    let store = workspace();
    change(
        &store,
        EMBEDDED_PATH,
        EventChange::Title("  Embedded World 2027 ".to_owned()),
    )
    .unwrap();
    assert!(text(&store, EMBEDDED_PATH).contains("# Embedded World 2027\n\nStand 4A-110.\n"));
    assert_eq!(
        change(&store, EMBEDDED_PATH, EventChange::Title(" ".to_owned())),
        Err(AppError::EventTitle(TitleError::Empty))
    );
}

#[test]
fn a_field_change_touches_only_its_key() {
    let store = workspace();
    change(
        &store,
        EMBEDDED_PATH,
        EventChange::Date(DateChange::Month(month(3))),
    )
    .unwrap();
    change(
        &store,
        EMBEDDED_PATH,
        EventChange::City(Some("Munich".to_owned())),
    )
    .unwrap();
    change(
        &store,
        EMBEDDED_PATH,
        EventChange::Country(Country::from_code("AT")),
    )
    .unwrap();
    change(
        &store,
        EMBEDDED_PATH,
        EventChange::Tags(vec!["pro".to_owned(), "PRO".to_owned()]),
    )
    .unwrap();
    assert_eq!(
        text(&store, EMBEDDED_PATH),
        "---\ntype: agenda-12-evenement\nmois: 3\njour: 10\nannee: 2027\njour-fin: 13\npays: AT\nville: Munich\ntags: [pro]\n---\n# Salon Embedded World\n\nStand 4A-110.\n"
    );
}

#[test]
fn the_fields_are_cleared_by_giving_nothing() {
    let store = workspace();
    change(&store, EMBEDDED_PATH, EventChange::Country(None)).unwrap();
    change(&store, EMBEDDED_PATH, EventChange::City(None)).unwrap();
    change(&store, EMBEDDED_PATH, EventChange::Tags(Vec::new())).unwrap();
    change(
        &store,
        EMBEDDED_PATH,
        EventChange::Date(DateChange::End(None)),
    )
    .unwrap();
    change(
        &store,
        EMBEDDED_PATH,
        EventChange::Date(DateChange::Year(None)),
    )
    .unwrap();
    change(
        &store,
        EMBEDDED_PATH,
        EventChange::Date(DateChange::Day(None)),
    )
    .unwrap();
    assert_eq!(
        text(&store, EMBEDDED_PATH),
        "---\ntype: agenda-12-evenement\nmois: 2\n---\n# Salon Embedded World\n\nStand 4A-110.\n"
    );
}

#[test]
fn an_impossible_date_is_refused_with_its_message_and_the_file_is_unchanged() {
    let store = workspace();
    let before = text(&store, EMBEDDED_PATH);
    let refused = change(
        &store,
        EMBEDDED_PATH,
        EventChange::Date(DateChange::Day(Some(31))),
    );
    assert_eq!(refused, Err(AppError::EventDate(DateError::NoSuchDay)));
    assert_eq!(
        refused.unwrap_err().to_string(),
        "Ce jour n'existe pas dans ce mois."
    );
    let before_end = change(
        &store,
        EMBEDDED_PATH,
        EventChange::Date(DateChange::Day(Some(14))),
    );
    assert_eq!(
        before_end,
        Err(AppError::EventDate(DateError::EndBeforeStart))
    );
    assert_eq!(text(&store, EMBEDDED_PATH), before);
}

#[test]
fn a_change_that_changes_nothing_does_not_rewrite_the_file() {
    let store = workspace();
    store.fail_writes_to(&path(EMBEDDED_PATH));
    change(
        &store,
        EMBEDDED_PATH,
        EventChange::City(Some("Nuremberg".to_owned())),
    )
    .unwrap();
    change(
        &store,
        EMBEDDED_PATH,
        EventChange::Date(DateChange::Month(month(2))),
    )
    .unwrap();
}

#[test]
fn a_closed_event_can_be_changed_too() {
    let store = workspace();
    change(&store, OLD_PATH, EventChange::City(Some("Lyon".to_owned()))).unwrap();
    assert!(text(&store, OLD_PATH).contains("ville: Lyon\n"));
    assert!(text(&store, OLD_PATH).contains("clos-le: 2026-03-01\n"));
}

#[test]
fn a_gone_or_foreign_note_cannot_be_changed() {
    let store = workspace();
    assert_eq!(
        change(&store, "pro/salons/absent.md", EventChange::City(None)),
        Err(AppError::EventGone)
    );
    assert_eq!(
        change(&store, "pro/salons/notes.md", EventChange::City(None)),
        Err(AppError::NotAnAgenda12Event)
    );
    assert!(matches!(
        change(&store, "pro/salons/sans-mois.md", EventChange::City(None)),
        Err(AppError::EventUnreadable(_))
    ));
}

#[test]
fn an_event_goes_to_the_trash_and_comes_back_where_it_was() {
    let store = workspace();
    let at = DeleteAgenda12Event::new(&store)
        .execute(&path(OLD_PATH))
        .unwrap();
    assert_eq!(at, path(OLD_PATH));
    assert!(store.read(&path(OLD_PATH)).is_err());
    assert_eq!(store.trash().unwrap().notes.len(), 1);
    let restored = Trash::new(&store).restore_note(&at).unwrap();
    assert_eq!(restored, path(OLD_PATH));
    let open = DeleteAgenda12Event::new(&store)
        .execute(&path(AUDIT_PATH))
        .unwrap();
    assert_eq!(
        Trash::new(&store).restore_note(&open).unwrap(),
        path(AUDIT_PATH)
    );
}

#[test]
fn an_unreadable_event_can_still_be_trashed_but_a_foreign_note_is_refused() {
    let store = workspace();
    DeleteAgenda12Event::new(&store)
        .execute(&path("pro/salons/sans-mois.md"))
        .unwrap();
    assert_eq!(
        DeleteAgenda12Event::new(&store).execute(&path("pro/salons/notes.md")),
        Err(AppError::NotAnAgenda12Event)
    );
    assert_eq!(
        DeleteAgenda12Event::new(&store).execute(&path("pro/salons/absent.md")),
        Err(AppError::EventGone)
    );
}
