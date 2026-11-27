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

fn date(
    month_number: u32,
    day: Option<u32>,
    year: Option<i32>,
    end: Option<EventEnd>,
) -> Result<EventDate, DateError> {
    EventDate::new(month(month_number), day, year, end)
}

#[test]
fn a_date_may_be_only_a_month() {
    let only = date(2, None, None, None).unwrap();
    assert_eq!(only.month(), month(2));
    assert_eq!(only.day(), None);
    assert_eq!(only.year(), None);
    assert_eq!(only.end(), None);
}

#[test]
fn a_date_keeps_its_day_its_year_and_its_end() {
    let full = date(1, Some(30), Some(2027), end(2, 2)).unwrap();
    assert_eq!(full.month(), month(1));
    assert_eq!(full.day(), Some(30));
    assert_eq!(full.year(), Some(2027));
    assert_eq!(full.end(), end(2, 2));
}

#[test]
fn the_year_runs_from_1_to_9999() {
    assert_eq!(date(1, None, Some(0), None), Err(DateError::YearOutOfRange));
    assert_eq!(
        date(1, None, Some(10_000), None),
        Err(DateError::YearOutOfRange)
    );
    assert_eq!(
        date(1, None, Some(-5), None),
        Err(DateError::YearOutOfRange)
    );
    assert!(date(1, None, Some(1), None).is_ok());
    assert!(date(1, None, Some(9999), None).is_ok());
}

#[test]
fn a_day_must_exist_in_its_month() {
    assert_eq!(date(2, Some(31), None, None), Err(DateError::NoSuchDay));
    assert_eq!(date(2, Some(30), None, None), Err(DateError::NoSuchDay));
    assert_eq!(
        date(4, Some(31), Some(2026), None),
        Err(DateError::NoSuchDay)
    );
    assert_eq!(date(1, Some(0), None, None), Err(DateError::NoSuchDay));
    assert!(date(1, Some(31), None, None).is_ok());
    assert!(date(1, Some(1), None, None).is_ok());
    assert!(date(4, Some(30), Some(2026), None).is_ok());
}

#[test]
fn the_29th_of_february_needs_a_leap_year_or_no_year() {
    assert!(date(2, Some(29), None, None).is_ok());
    assert!(date(2, Some(29), Some(2028), None).is_ok());
    assert_eq!(
        date(2, Some(29), Some(2027), None),
        Err(DateError::NoSuchDay)
    );
}

#[test]
fn an_end_needs_a_start_day() {
    assert_eq!(
        date(2, None, Some(2027), end(13, 2)),
        Err(DateError::EndWithoutDay)
    );
}

#[test]
fn an_end_in_the_same_month_comes_after_the_start() {
    assert_eq!(
        date(2, Some(10), None, end(13, 2)).unwrap().end(),
        end(13, 2)
    );
    assert_eq!(
        date(2, Some(10), None, end(9, 2)),
        Err(DateError::EndBeforeStart)
    );
}

#[test]
fn an_end_on_the_day_of_the_start_is_no_end() {
    assert_eq!(date(2, Some(10), None, end(10, 2)).unwrap().end(), None);
}

#[test]
fn an_end_in_a_later_month_stays_in_the_same_year() {
    let across = date(1, Some(30), Some(2027), end(2, 2)).unwrap();
    assert_eq!(across.end(), end(2, 2));
}

#[test]
fn an_end_in_an_earlier_month_goes_to_the_next_year() {
    let across = date(12, Some(30), Some(2027), end(2, 1)).unwrap();
    assert_eq!(across.end(), end(2, 1));
}

#[test]
fn the_end_day_must_exist_in_the_end_month_of_the_end_year() {
    assert_eq!(
        date(1, Some(30), Some(2027), end(29, 2)),
        Err(DateError::NoSuchDay)
    );
    assert!(date(1, Some(30), Some(2028), end(29, 2)).is_ok());
    // La fin passe à l'année suivante : 2028 est bissextile, 2027 ne l'est pas.
    assert!(date(12, Some(30), Some(2027), end(29, 2)).is_ok_and(|d| d.end() == end(29, 2)));
    assert_eq!(
        date(12, Some(30), Some(2026), end(29, 2)),
        Err(DateError::NoSuchDay)
    );
    assert!(date(1, Some(30), None, end(29, 2)).is_ok());
    assert_eq!(
        date(1, Some(30), None, end(30, 2)),
        Err(DateError::NoSuchDay)
    );
}

#[test]
fn the_messages_are_ready_to_show() {
    assert_eq!(
        DateError::YearOutOfRange.to_string(),
        "L'année doit être comprise entre 1 et 9999."
    );
    assert_eq!(
        DateError::NoSuchDay.to_string(),
        "Ce jour n'existe pas dans ce mois."
    );
    assert_eq!(
        DateError::EndWithoutDay.to_string(),
        "La fin exige un jour de début."
    );
    assert_eq!(
        DateError::EndBeforeStart.to_string(),
        "La fin est avant le début."
    );
}
