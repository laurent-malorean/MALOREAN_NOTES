use super::*;

fn month(number: u32) -> Month {
    Month::new(number).unwrap()
}

const EVENT: &str = "---\ntype: agenda-12-evenement\nmois: 2\n---\n# Salon\n\nTexte.\n";

#[test]
fn a_new_event_has_its_type_its_month_and_its_title() {
    assert_eq!(
        new_event_content("Sans titre", month(2)),
        "---\ntype: agenda-12-evenement\nmois: 2\n---\n# Sans titre\n"
    );
    assert_eq!(
        new_event_content("Audit", month(12)),
        "---\ntype: agenda-12-evenement\nmois: 12\n---\n# Audit\n"
    );
}

#[test]
fn a_title_is_one_line_and_not_empty() {
    assert_eq!(clean_title("  Salon  "), Ok("Salon".to_owned()));
    assert_eq!(clean_title(" \t "), Err(TitleError::Empty));
    assert_eq!(clean_title(""), Err(TitleError::Empty));
    assert_eq!(clean_title("a\nb"), Err(TitleError::NotOneLine));
    assert_eq!(clean_title("a\rb"), Err(TitleError::NotOneLine));
    assert_eq!(TitleError::Empty.to_string(), "Le titre est vide.");
    assert_eq!(
        TitleError::NotOneLine.to_string(),
        "Le titre tient sur une seule ligne."
    );
}

#[test]
fn retitling_changes_only_the_title_line() {
    assert_eq!(
        with_title(EVENT, "Salon Embedded World"),
        "---\ntype: agenda-12-evenement\nmois: 2\n---\n# Salon Embedded World\n\nTexte.\n"
    );
}

#[test]
fn a_month_replaces_the_month_in_place() {
    let moved = with_month(EVENT, month(11));
    assert_eq!(
        moved,
        "---\ntype: agenda-12-evenement\nmois: 11\n---\n# Salon\n\nTexte.\n"
    );
}

#[test]
fn a_day_a_year_and_an_end_are_added_after_the_other_keys_and_removed_when_emptied() {
    let day = with_day(EVENT, Some(10));
    assert_eq!(
        day,
        "---\ntype: agenda-12-evenement\nmois: 2\njour: 10\n---\n# Salon\n\nTexte.\n"
    );
    let year = with_year(&day, Some(2027));
    assert!(year.contains("mois: 2\njour: 10\nannee: 2027\n---"));
    let end = with_end(
        &year,
        month(2),
        Some(EventEnd {
            day: 13,
            month: month(2),
        }),
    );
    assert!(end.contains("annee: 2027\njour-fin: 13\n---"));
    assert!(!end.contains("mois-fin"));
    assert_eq!(with_end(&end, month(2), None), year);
    assert_eq!(with_year(&year, None), day);
    assert_eq!(with_day(&day, None), EVENT);
}

#[test]
fn an_end_in_another_month_writes_its_month() {
    let end = with_end(
        EVENT,
        month(2),
        Some(EventEnd {
            day: 2,
            month: month(3),
        }),
    );
    assert!(end.contains("jour-fin: 2\nmois-fin: 3\n---"));
    let back = with_end(
        &end,
        month(2),
        Some(EventEnd {
            day: 13,
            month: month(2),
        }),
    );
    assert!(back.contains("jour-fin: 13\n---"));
    assert!(!back.contains("mois-fin"));
}

#[test]
fn a_number_is_written_bare() {
    assert!(with_day(EVENT, Some(5)).contains("jour: 5\n"));
    assert!(with_year(EVENT, Some(2027)).contains("annee: 2027\n"));
}

#[test]
fn the_country_is_written_as_its_upper_case_code() {
    let germany = Country::from_code("de").unwrap();
    assert!(with_country(EVENT, Some(germany)).contains("mois: 2\npays: DE\n---"));
    assert_eq!(
        with_country(&with_country(EVENT, Some(germany)), None),
        EVENT
    );
}

#[test]
fn a_country_code_that_yaml_reads_as_a_boolean_is_quoted() {
    let norway = Country::from_code("NO").unwrap();
    let written = with_country(EVENT, Some(norway));
    assert!(written.contains("pays: 'NO'\n"));
    assert_eq!(
        super::super::event::Agenda12Event::parse(&written)
            .unwrap()
            .country,
        Some(norway)
    );
}

#[test]
fn the_city_is_written_as_text_and_emptied_by_a_blank() {
    let written = with_city(EVENT, Some("Nuremberg"));
    assert!(written.contains("ville: Nuremberg\n"));
    assert_eq!(with_city(&written, Some("  ")), EVENT);
    assert_eq!(with_city(&written, None), EVENT);
    assert!(with_city(EVENT, Some("Paris: 15e")).contains("ville: 'Paris: 15e'\n"));
}

#[test]
fn the_tags_are_cleaned_and_removed_when_none_is_left() {
    let tagged = with_tags(
        EVENT,
        &["Salon".to_owned(), "salon".to_owned(), " #pro ".to_owned()],
    );
    assert!(tagged.contains("tags: [Salon, pro]\n"));
    assert_eq!(with_tags(&tagged, &[]), EVENT);
}

#[test]
fn closing_writes_the_day_and_reopening_removes_it() {
    let day = Day::new(2026, 11, 27).unwrap();
    let closed = closed_on(EVENT, day);
    assert_eq!(
        closed,
        "---\ntype: agenda-12-evenement\nmois: 2\nclos-le: 2026-11-27\n---\n# Salon\n\nTexte.\n"
    );
    assert_eq!(reopened(&closed), EVENT);
    assert_eq!(reopened(EVENT), EVENT);
}

#[test]
fn a_gesture_keeps_unknown_keys_comments_and_the_text_to_the_byte() {
    let content = "---\ntype: agenda-12-evenement\nmois: 2 # février\nbudget: 3000\njour: oups\n---\n# Salon\n\nTexte  \n";
    let changed = with_month(content, month(3));
    assert_eq!(
        changed,
        "---\ntype: agenda-12-evenement\nmois: 3\nbudget: 3000\njour: oups\n---\n# Salon\n\nTexte  \n"
    );
    // Une valeur illisible reste tant que le geste de sa clé n'est pas fait.
    assert!(changed.contains("jour: oups\n"));
    assert!(with_day(&changed, Some(4)).contains("jour: 4\n"));
}

#[test]
fn the_successor_keeps_the_title_the_month_the_country_the_city_and_the_tags_only() {
    let content = "---\ntype: agenda-12-evenement\nmois: 3\njour: 10\nannee: 2026\njour-fin: 12\npays: DE\nville: Nuremberg\ntags: [salon]\nclos-le: 2026-11-27\nbudget: 3000\n---\n# Salon Embedded World\n\nStand 4A-110.\n";
    let event = Agenda12Event::parse(content).unwrap();
    assert_eq!(
        successor_content(&event),
        "---\ntype: agenda-12-evenement\nmois: 3\npays: DE\nville: Nuremberg\ntags: [salon]\n---\n# Salon Embedded World\n"
    );
}

#[test]
fn the_successor_of_a_bare_event_is_a_new_event() {
    let event = Agenda12Event::parse(EVENT).unwrap();
    assert_eq!(
        successor_content(&event),
        new_event_content("Salon", month(2))
    );
}
