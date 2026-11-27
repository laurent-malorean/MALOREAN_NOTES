use super::*;

fn event(header: &str) -> String {
    format!("---\ntype: agenda-12-evenement\n{header}---\n# Salon\n\nTexte.\n")
}

fn parse(header: &str) -> Agenda12Event {
    Agenda12Event::parse(&event(header)).unwrap()
}

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
fn an_event_with_a_month_is_read_with_its_title() {
    let read = parse("mois: 2\n");
    assert_eq!(read.title, "Salon");
    assert_eq!(read.date.month(), month(2));
    assert_eq!(read.date.day(), None);
    assert_eq!(read.date.year(), None);
    assert_eq!(read.date.end(), None);
    assert_eq!(read.country, None);
    assert_eq!(read.city, None);
    assert!(read.tags.is_empty());
    assert_eq!(read.closed_on, None);
}

#[test]
fn an_event_is_read_with_all_its_fields() {
    let read = parse(
        "mois: 5\njour: 30\nannee: 2027\njour-fin: 2\nmois-fin: 6\npays: FR\nville: Paris\n\
         tags: [salon, pro]\nclos-le: 2026-11-27\n",
    );
    assert_eq!(read.date.month(), month(5));
    assert_eq!(read.date.day(), Some(30));
    assert_eq!(read.date.year(), Some(2027));
    assert_eq!(read.date.end(), end(2, 6));
    assert_eq!(read.country.map(Country::code), Some("FR"));
    assert_eq!(read.city.as_deref(), Some("Paris"));
    assert_eq!(read.tags, ["salon", "pro"]);
    assert_eq!(read.closed_on, Some(Day::new(2026, 11, 27).unwrap()));
}

#[test]
fn a_note_that_is_not_an_event_is_unreadable_as_one() {
    for content in [
        "# Salon\n",
        "---\ntype: crm\n---\n# Salon\n",
        "---\ntype: agenda-12\n---\n# Salon\n",
        "---\ntype: Agenda-12-evenement\nmois: 2\n---\n# Salon\n",
    ] {
        assert_eq!(
            Agenda12Event::parse(content),
            Err(EventUnreadable::WrongType),
            "{content}"
        );
    }
}

#[test]
fn an_event_without_title_is_unreadable() {
    let content = "---\ntype: agenda-12-evenement\nmois: 2\n---\nPas de titre\n";
    assert_eq!(Agenda12Event::parse(content), Err(EventUnreadable::NoTitle));
}

#[test]
fn an_event_without_a_readable_month_is_unreadable() {
    for header in [
        "",
        "mois: février\n",
        "mois: 0\n",
        "mois: 13\n",
        "mois: -1\n",
        "mois: 2.0\n",
        "mois:\n",
        "mois: 99999999999\n",
    ] {
        assert_eq!(
            Agenda12Event::parse(&event(header)),
            Err(EventUnreadable::NoMonth),
            "{header}"
        );
    }
}

#[test]
fn numbers_may_have_leading_zeros_and_quotes() {
    let read = parse("mois: '02'\njour: \"05\"\nannee: 02027\n");
    assert_eq!(read.date.month(), month(2));
    assert_eq!(read.date.day(), Some(5));
    assert_eq!(read.date.year(), Some(2027));
}

#[test]
fn the_country_is_read_whatever_its_case_and_ignored_when_unknown() {
    assert_eq!(
        parse("mois: 1\npays: ' de '\n").country.map(Country::code),
        Some("DE")
    );
    assert_eq!(
        parse("mois: 1\npays: de\n").country.map(Country::code),
        Some("DE")
    );
    assert_eq!(parse("mois: 1\npays: XX\n").country, None);
    assert_eq!(parse("mois: 1\npays: Allemagne\n").country, None);
}

#[test]
fn an_unreadable_year_or_day_is_only_ignored() {
    let read = parse("mois: 2\njour: 31\nannee: demain\n");
    assert_eq!(read.date.day(), None);
    assert_eq!(read.date.year(), None);
    let leap = parse("mois: 2\njour: 29\nannee: 2027\n");
    assert_eq!(leap.date.day(), None);
    assert_eq!(leap.date.year(), Some(2027));
    assert_eq!(parse("mois: 2\nannee: 0\n").date.year(), None);
    assert_eq!(parse("mois: 2\nannee: 10000\n").date.year(), None);
    assert_eq!(parse("mois: 2\njour: 0\n").date.day(), None);
}

#[test]
fn an_end_in_the_same_month_needs_to_come_after_the_start() {
    assert_eq!(
        parse("mois: 2\njour: 10\njour-fin: 13\n").date.end(),
        end(13, 2)
    );
    assert_eq!(parse("mois: 2\njour: 10\njour-fin: 9\n").date.end(), None);
    assert_eq!(parse("mois: 2\njour: 10\njour-fin: 10\n").date.end(), None);
    assert_eq!(
        parse("mois: 2\njour: 10\njour-fin: 13\nmois-fin: 2\n")
            .date
            .end(),
        end(13, 2)
    );
}

#[test]
fn an_end_in_another_month_is_read_in_the_same_or_the_next_year() {
    let same = parse("mois: 1\njour: 30\nannee: 2027\njour-fin: 2\nmois-fin: 2\n");
    assert_eq!(same.date.end(), end(2, 2));
    let next = parse("mois: 12\njour: 30\nannee: 2027\njour-fin: 2\nmois-fin: 1\n");
    assert_eq!(next.date.end(), end(2, 1));
}

#[test]
fn an_end_that_cannot_be_read_is_ignored_and_the_event_stays_readable() {
    for header in [
        "mois: 2\njour-fin: 13\n",
        "mois: 2\nmois-fin: 3\n",
        "mois: 2\njour: 10\nmois-fin: 3\n",
        "mois: 2\njour: 10\njour-fin: 31\n",
        "mois: 2\njour: 10\njour-fin: 12\nmois-fin: 13\n",
        "mois: 2\njour: 10\njour-fin: 12\nmois-fin: mars\n",
        "mois: 2\njour: 10\njour-fin: douze\n",
        "mois: 2\njour: 31\njour-fin: 12\nmois-fin: 3\n",
    ] {
        let read = parse(header);
        assert_eq!(read.date.end(), None, "{header}");
        assert_eq!(read.title, "Salon");
    }
}

#[test]
fn an_empty_end_month_is_an_absent_one() {
    let read = parse("mois: 2\njour: 10\njour-fin: 13\nmois-fin:\n");
    assert_eq!(read.date.end(), end(13, 2));
}

#[test]
fn the_closing_day_is_read_only_when_it_is_a_day() {
    assert_eq!(
        parse("mois: 2\nclos-le: '2026-11-27'\n").closed_on,
        Some(Day::new(2026, 11, 27).unwrap())
    );
    assert_eq!(parse("mois: 2\nclos-le: 2026-02-30\n").closed_on, None);
    assert_eq!(parse("mois: 2\nclos-le: 27/11/2026\n").closed_on, None);
}

#[test]
fn the_city_is_read_without_quotes_and_an_empty_one_is_absent() {
    assert_eq!(
        parse("mois: 2\nville: 'L''Aquila'\n").city.as_deref(),
        Some("L'Aquila")
    );
    assert_eq!(parse("mois: 2\nville:\n").city, None);
}

#[test]
fn the_unreadable_messages_are_ready_to_show() {
    assert_eq!(
        EventUnreadable::WrongType.to_string(),
        "Ce fichier n'est pas un événement d'un agenda 12."
    );
    assert_eq!(
        EventUnreadable::NoTitle.to_string(),
        "Cet événement n'a pas de titre."
    );
    assert_eq!(
        EventUnreadable::NoMonth.to_string(),
        "Cet événement n'a pas de mois lisible."
    );
}

#[test]
fn the_search_reads_the_city_the_country_name_the_tags_and_the_text_but_not_the_technical_keys() {
    let content = event(
        "mois: 5\njour: 30\nannee: 2027\npays: FR\nville: Paris\ntags: [salon, pro]\nclos-le: 2026-11-27\n",
    );
    assert_eq!(
        searchable_text(&content).unwrap(),
        "Paris\nFrance\nsalon\npro\n# Salon\n\nTexte.\n"
    );
}

#[test]
fn the_search_of_an_event_without_optional_fields_reads_its_text() {
    assert_eq!(
        searchable_text(&event("mois: 2\n")).unwrap(),
        "# Salon\n\nTexte.\n"
    );
}

#[test]
fn the_search_of_a_note_that_does_not_read_as_an_event_is_left_to_the_whole_text() {
    assert_eq!(
        searchable_text("---\ntype: agenda-12-evenement\n---\n# Salon\n"),
        None
    );
    assert_eq!(searchable_text("# Salon\n"), None);
}
