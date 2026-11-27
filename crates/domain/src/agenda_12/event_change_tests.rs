use super::*;

fn month(number: u32) -> Month {
    Month::new(number).unwrap()
}

fn end(day: u32, month_number: u32) -> Option<EventEnd> {
    Some(EventEnd {
        day,
        month: month(month_number),
    })
}

fn event(header: &str) -> (String, Agenda12Event) {
    let content = format!("---\ntype: agenda-12-evenement\n{header}---\n# Salon\n\nTexte.\n");
    let event = Agenda12Event::parse(&content).unwrap();
    (content, event)
}

fn changed(header: &str, change: DateChange) -> Result<(EventDate, String), DateError> {
    let (content, event) = event(header);
    change_date(&content, &event, change)
}

#[test]
fn a_month_change_writes_only_the_month() {
    let (date, written) = changed("mois: 2\njour: 10\n", DateChange::Month(month(4))).unwrap();
    assert_eq!(date.month(), month(4));
    assert_eq!(date.day(), Some(10));
    assert_eq!(
        written,
        "---\ntype: agenda-12-evenement\nmois: 4\njour: 10\n---\n# Salon\n\nTexte.\n"
    );
}

#[test]
fn an_end_in_the_same_month_follows_the_month() {
    let (date, written) = changed(
        "mois: 2\njour: 10\njour-fin: 13\n",
        DateChange::Month(month(3)),
    )
    .unwrap();
    assert_eq!(date.end(), end(13, 3));
    assert!(written.contains("mois: 3\njour: 10\njour-fin: 13\n---"));
    assert!(!written.contains("mois-fin"));
}

#[test]
fn an_end_in_a_written_month_stays_where_it_is() {
    let (date, _) = changed(
        "mois: 1\njour: 30\njour-fin: 2\nmois-fin: 2\n",
        DateChange::Month(month(1)),
    )
    .unwrap();
    assert_eq!(date.end(), end(2, 2));
    let moved = changed(
        "mois: 1\njour: 30\nannee: 2027\njour-fin: 2\nmois-fin: 2\n",
        DateChange::Month(month(3)),
    );
    // La fin (février) est avant le nouveau début (mars) : elle passe à l'année suivante, valide.
    assert_eq!(moved.unwrap().0.end(), end(2, 2));
}

#[test]
fn a_month_change_that_makes_the_day_impossible_is_refused() {
    assert_eq!(
        changed("mois: 1\njour: 31\n", DateChange::Month(month(2))),
        Err(DateError::NoSuchDay)
    );
    assert_eq!(
        changed(
            "mois: 1\njour: 30\nannee: 2027\n",
            DateChange::Month(month(4))
        )
        .map(|(date, _)| date.day()),
        Ok(Some(30))
    );
}

#[test]
fn a_day_change_writes_only_the_day_and_a_cleared_day_removes_the_key() {
    let (date, written) = changed(
        "mois: 2\njour: 10\nville: Lyon\n",
        DateChange::Day(Some(12)),
    )
    .unwrap();
    assert_eq!(date.day(), Some(12));
    assert!(written.contains("mois: 2\njour: 12\nville: Lyon\n---"));
    let (cleared, written) = changed("mois: 2\njour: 10\n", DateChange::Day(None)).unwrap();
    assert_eq!(cleared.day(), None);
    assert!(!written.contains("jour"));
}

#[test]
fn a_day_cannot_be_removed_while_the_event_has_an_end() {
    assert_eq!(
        changed("mois: 2\njour: 10\njour-fin: 13\n", DateChange::Day(None)),
        Err(DateError::EndWithoutDay)
    );
}

#[test]
fn a_day_after_the_end_is_refused() {
    assert_eq!(
        changed(
            "mois: 2\njour: 10\njour-fin: 13\n",
            DateChange::Day(Some(14))
        ),
        Err(DateError::EndBeforeStart)
    );
}

#[test]
fn an_impossible_day_or_year_is_refused_with_its_message() {
    assert_eq!(
        changed("mois: 2\n", DateChange::Day(Some(30))),
        Err(DateError::NoSuchDay)
    );
    assert_eq!(
        changed("mois: 2\njour: 29\n", DateChange::Year(Some(2027))),
        Err(DateError::NoSuchDay)
    );
    assert_eq!(
        changed("mois: 2\n", DateChange::Year(Some(0))),
        Err(DateError::YearOutOfRange)
    );
    let (date, written) = changed("mois: 2\njour: 29\n", DateChange::Year(Some(2028))).unwrap();
    assert_eq!(date.year(), Some(2028));
    assert!(written.contains("jour: 29\nannee: 2028\n---"));
}

#[test]
fn an_end_is_written_with_its_month_only_when_it_differs() {
    let (date, written) = changed("mois: 2\njour: 10\n", DateChange::End(end(13, 2))).unwrap();
    assert_eq!(date.end(), end(13, 2));
    assert!(written.contains("jour: 10\njour-fin: 13\n---"));
    let (date, written) = changed("mois: 2\njour: 10\n", DateChange::End(end(3, 3))).unwrap();
    assert_eq!(date.end(), end(3, 3));
    assert!(written.contains("jour-fin: 3\nmois-fin: 3\n---"));
}

#[test]
fn an_end_without_a_start_day_or_before_the_start_is_refused() {
    assert_eq!(
        changed("mois: 2\n", DateChange::End(end(13, 2))),
        Err(DateError::EndWithoutDay)
    );
    assert_eq!(
        changed("mois: 2\njour: 10\n", DateChange::End(end(9, 2))),
        Err(DateError::EndBeforeStart)
    );
}

#[test]
fn removing_the_end_removes_its_keys() {
    let (date, written) = changed(
        "mois: 1\njour: 30\njour-fin: 2\nmois-fin: 2\n",
        DateChange::End(None),
    )
    .unwrap();
    assert_eq!(date.end(), None);
    assert!(!written.contains("fin"));
}

#[test]
fn an_end_on_the_start_day_is_no_end_and_removes_the_keys() {
    let (date, written) = changed(
        "mois: 2\njour: 10\njour-fin: 13\n",
        DateChange::End(end(10, 2)),
    )
    .unwrap();
    assert_eq!(date.end(), None);
    assert!(!written.contains("jour-fin"));
}
