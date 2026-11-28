use domain::agenda_12::{Columns, Country, DateChange, EventEnd, Layout, Month};

use super::*;

fn month_of(number: u32) -> Month {
    Month::new(number).unwrap()
}

fn change(json: &str) -> Result<EventChange, AppError> {
    serde_json::from_str::<Agenda12EventChangeItem>(json)
        .unwrap()
        .try_into()
}

#[test]
fn a_month_is_a_number_from_1_to_12_with_a_message_otherwise() {
    assert_eq!(month(1).unwrap(), month_of(1));
    assert_eq!(month(12).unwrap(), month_of(12));
    for wrong in [0, 13, 99] {
        let error = month(wrong).unwrap_err();
        assert_eq!(error, AppError::UnknownMonth(wrong));
        assert!(error.to_string().contains(&format!("« {wrong} »")));
    }
}

#[test]
fn a_country_is_a_code_of_the_standard_with_a_message_otherwise() {
    assert_eq!(country("de").unwrap(), Country::from_code("DE").unwrap());
    assert_eq!(
        country("XX"),
        Err(AppError::UnknownCountry("XX".to_owned()))
    );
    assert_eq!(country(""), Err(AppError::UnknownCountry(String::new())));
}

#[test]
fn the_columns_are_three_four_or_six() {
    assert_eq!(columns(3).unwrap(), Columns::new(3).unwrap());
    assert_eq!(columns(6).unwrap().count(), 6);
    assert_eq!(columns(5), Err(AppError::UnknownColumns(5)));
}

#[test]
fn the_layout_is_read_and_written_as_grid_or_list_in_both_directions() {
    let list: Agenda12LayoutItem = serde_json::from_str(r#""list""#).unwrap();
    let grid: Agenda12LayoutItem = serde_json::from_str(r#""grid""#).unwrap();
    assert_eq!(Layout::from(list), Layout::List);
    assert_eq!(Layout::from(grid), Layout::Grid);
    assert_eq!(Agenda12LayoutItem::from(Layout::List), list);
    assert_eq!(Agenda12LayoutItem::from(Layout::Grid), grid);
    assert_eq!(serde_json::to_string(&list).unwrap(), r#""list""#);
    assert!(serde_json::from_str::<Agenda12LayoutItem>(r#""table""#).is_err());
}

#[test]
fn the_text_gestures_are_converted_to_a_change() {
    assert_eq!(
        change(r#"{"kind":"title","title":"Salon"}"#).unwrap(),
        EventChange::Title("Salon".to_owned())
    );
    assert_eq!(
        change(r#"{"kind":"city","city":"Lyon"}"#).unwrap(),
        EventChange::City(Some("Lyon".to_owned()))
    );
    assert_eq!(
        change(r#"{"kind":"tags","tags":["a","b"]}"#).unwrap(),
        EventChange::Tags(vec!["a".to_owned(), "b".to_owned()])
    );
}

#[test]
fn the_country_gestures_are_converted_to_a_change() {
    assert_eq!(
        change(r#"{"kind":"country","country":"fr"}"#).unwrap(),
        EventChange::Country(Country::from_code("FR"))
    );
    assert_eq!(
        change(r#"{"kind":"country","country":null}"#).unwrap(),
        EventChange::Country(None)
    );
}

#[test]
fn the_date_gestures_are_converted_to_a_change() {
    assert_eq!(
        change(r#"{"kind":"month","month":3}"#).unwrap(),
        EventChange::Date(DateChange::Month(month_of(3)))
    );
    assert_eq!(
        change(r#"{"kind":"day","day":12}"#).unwrap(),
        EventChange::Date(DateChange::Day(Some(12)))
    );
    assert_eq!(
        change(r#"{"kind":"day","day":null}"#).unwrap(),
        EventChange::Date(DateChange::Day(None))
    );
    assert_eq!(
        change(r#"{"kind":"year","year":2027}"#).unwrap(),
        EventChange::Date(DateChange::Year(Some(2027)))
    );
}

#[test]
fn the_end_gestures_are_converted_to_a_change() {
    assert_eq!(
        change(r#"{"kind":"end","end":{"day":13,"month":2}}"#).unwrap(),
        EventChange::Date(DateChange::End(Some(EventEnd {
            day: 13,
            month: month_of(2)
        })))
    );
    assert_eq!(
        change(r#"{"kind":"end","end":null}"#).unwrap(),
        EventChange::Date(DateChange::End(None))
    );
}

#[test]
fn a_gesture_with_a_wrong_month_or_country_is_refused() {
    assert_eq!(
        change(r#"{"kind":"month","month":13}"#),
        Err(AppError::UnknownMonth(13))
    );
    assert_eq!(
        change(r#"{"kind":"end","end":{"day":1,"month":0}}"#),
        Err(AppError::UnknownMonth(0))
    );
    assert_eq!(
        change(r#"{"kind":"country","country":"ZZ"}"#),
        Err(AppError::UnknownCountry("ZZ".to_owned()))
    );
}

#[test]
fn the_closing_choices_are_converted() {
    assert_eq!(Closing::from(Agenda12ClosingItem::Alone), Closing::Alone);
    assert_eq!(
        Closing::from(Agenda12ClosingItem::WithSuccessor),
        Closing::WithSuccessor
    );
    assert_eq!(
        serde_json::from_str::<Agenda12ClosingItem>(r#""withSuccessor""#).unwrap(),
        Agenda12ClosingItem::WithSuccessor
    );
}
