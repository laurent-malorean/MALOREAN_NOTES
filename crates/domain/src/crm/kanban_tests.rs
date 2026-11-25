use super::*;
use crate::crm::{Stage, Urgency};

fn reference(target: &str) -> Reference {
    Reference::to(target).unwrap()
}

fn day(text: &str) -> Day {
    Day::parse(text).unwrap()
}

fn action(name: &str, yaml: &str) -> Action {
    let content = format!("---\ntype: crm-action\n{yaml}---\n# {name}\n");
    Action::parse(reference(name), &content, &Stages::default()).unwrap()
}

fn names(cards: &[&Action]) -> Vec<String> {
    cards
        .iter()
        .map(|card| card.name.as_str().to_owned())
        .collect()
}

fn column<'a>(columns: &'a [KanbanColumn<'a>], status: &str) -> &'a KanbanColumn<'a> {
    columns
        .iter()
        .find(|column| column.status.name() == status)
        .unwrap()
}

#[test]
fn the_columns_are_the_statuses_of_the_crm_in_order() {
    let columns = columns(&Stages::default(), &[]);
    let titles: Vec<_> = columns.iter().map(|c| c.status.name()).collect();
    assert_eq!(titles, ["TODO", "Progress", "WaitingFor", "Done", "Cancel"]);
    assert!(columns.iter().all(|column| column.cards.is_empty()));
}

#[test]
fn a_crm_without_stages_has_three_columns() {
    let titles: Vec<_> = columns(&Stages::read(&[]), &[])
        .iter()
        .map(|c| c.status.name().to_owned())
        .collect();
    assert_eq!(titles, ["TODO", "Done", "Cancel"]);
}

#[test]
fn each_action_is_in_the_column_of_its_status() {
    let actions = [
        action("a", ""),
        action("b", "statut: Progress\n"),
        action("c", "statut: Done\n"),
        action("d", "statut: Cancel\n"),
        action("e", "statut: Inconnu\n"),
        action("f", "statut: WaitingFor\n"),
    ];
    let columns = columns(&Stages::default(), &actions);
    assert_eq!(names(&column(&columns, "TODO").cards), ["a", "e"]);
    assert_eq!(names(&column(&columns, "Progress").cards), ["b"]);
    assert_eq!(names(&column(&columns, "WaitingFor").cards), ["f"]);
    assert_eq!(names(&column(&columns, "Done").cards), ["c"]);
    assert_eq!(names(&column(&columns, "Cancel").cards), ["d"]);
}

#[test]
fn an_action_of_a_stage_that_no_longer_exists_is_in_todo() {
    let mut stale = action("a", "");
    stale.status = Status::Stage(Stage::parse("Retirée").unwrap());
    let actions = [stale];
    let columns = columns(&Stages::default(), &actions);
    assert_eq!(names(&column(&columns, "TODO").cards), ["a"]);
}

#[test]
fn the_ranked_cards_come_first_in_the_order_of_their_rank_then_the_others_by_date() {
    let actions = [
        action("a", "date: '2026-11-01'\n"),
        action("b", "rang: 2\ndate: '2026-12-01'\n"),
        action("c", "date: '2026-10-01'\n"),
        action("d", "rang: 1\ndate: '2026-12-31'\n"),
        action("e", ""),
        action("f", "date: '2026-10-15'\n"),
    ];
    let columns = columns(&Stages::default(), &actions);
    assert_eq!(
        names(&column(&columns, "TODO").cards),
        ["d", "b", "c", "f", "a", "e"]
    );
}

#[test]
fn cards_with_the_same_rank_or_the_same_date_are_in_the_order_of_their_file_name() {
    let actions = [
        action("b", "rang: 1\n"),
        action("a", "rang: 1\n"),
        action("d", "date: '2026-11-01'\n"),
        action("c", "date: '2026-11-01'\n"),
        action("f", ""),
        action("e", ""),
    ];
    let columns = columns(&Stages::default(), &actions);
    assert_eq!(
        names(&column(&columns, "TODO").cards),
        ["a", "b", "c", "d", "e", "f"]
    );
}

#[test]
fn a_stage_orders_its_cards_like_todo() {
    let actions = [
        action("a", "statut: Progress\ndate: '2026-11-05'\n"),
        action("b", "statut: Progress\nrang: 1\ndate: '2026-12-05'\n"),
        action("c", "statut: Progress\ndate: '2026-11-01'\n"),
    ];
    let columns = columns(&Stages::default(), &actions);
    assert_eq!(names(&column(&columns, "Progress").cards), ["b", "c", "a"]);
}

#[test]
fn a_finished_column_goes_from_the_most_recent_to_the_oldest() {
    let actions = [
        action("a", "statut: Done\ndate: '2026-11-01'\n"),
        action("b", "statut: Done\ndate: '2026-11-20'\nrang: 1\n"),
        action("c", "statut: Done\n"),
        action("d", "statut: Done\ndate: '2026-11-10'\n"),
        action("e", "statut: Done\ndate: '2026-11-10'\n"),
        action("f", "statut: Cancel\ndate: '2026-01-10'\n"),
        action("g", "statut: Cancel\ndate: '2026-02-10'\n"),
        action("h", "statut: Cancel\n"),
        action("i", "statut: Cancel\n"),
    ];
    let columns = columns(&Stages::default(), &actions);
    assert_eq!(
        names(&column(&columns, "Done").cards),
        ["b", "e", "d", "a", "c"]
    );
    assert_eq!(
        names(&column(&columns, "Cancel").cards),
        ["g", "f", "i", "h"]
    );
}

#[test]
fn a_column_counts_its_cards_and_the_late_ones() {
    let actions = [
        action("a", "date: '2026-11-20'\n"),
        action("b", "date: '2026-11-24'\n"),
        action("c", "date: '2026-11-30'\n"),
        action("d", "date: '2026-01-01'\n"),
        action("e", ""),
        action("f", "statut: Done\ndate: '2026-01-01'\n"),
    ];
    let columns = columns(&Stages::default(), &actions);
    let todo = column(&columns, "TODO");
    assert_eq!(todo.count(), 5);
    assert_eq!(todo.late_count(day("2026-11-24")), 2);
    assert_eq!(todo.late_count(day("2026-11-20")), 1);
    let done = column(&columns, "Done");
    assert_eq!((done.count(), done.late_count(day("2026-11-24"))), (1, 0));
    assert_eq!(
        actions[0].urgency(day("2026-11-24")),
        Some(Urgency::Late(4))
    );
}

fn finished(count: usize) -> Vec<Action> {
    (0..count)
        .map(|n| {
            action(
                &format!("a{n:02}"),
                &format!("statut: Done\ndate: '2026-01-{:02}'\n", n + 1),
            )
        })
        .collect()
}

#[test]
fn an_open_column_shows_all_its_cards() {
    let actions: Vec<Action> = (0..25).map(|n| action(&format!("a{n:02}"), "")).collect();
    let columns = columns(&Stages::default(), &actions);
    let shown = column(&columns, "TODO").shown(0);
    assert_eq!((shown.cards.len(), shown.remaining), (25, 0));
    assert_eq!(column(&columns, "TODO").shown(3).cards.len(), 25);
}

#[test]
fn a_finished_column_shows_the_ten_most_recent_cards_and_what_remains() {
    let actions = finished(25);
    let columns = columns(&Stages::default(), &actions);
    let done = column(&columns, "Done");
    let shown = done.shown(0);
    assert_eq!(shown.remaining, 15);
    assert_eq!(names(shown.cards).first().map(String::as_str), Some("a24"));
    assert_eq!(names(shown.cards).last().map(String::as_str), Some("a15"));
    assert_eq!(shown.cards.len(), 10);
    assert_eq!(done.count(), 25);
}

#[test]
fn showing_ten_more_reveals_the_next_ten() {
    let actions = finished(25);
    let columns = columns(&Stages::default(), &actions);
    let done = column(&columns, "Done");
    assert_eq!(
        (done.shown(1).cards.len(), done.shown(1).remaining),
        (20, 5)
    );
    assert_eq!(
        (done.shown(2).cards.len(), done.shown(2).remaining),
        (25, 0)
    );
    assert_eq!(
        (done.shown(9).cards.len(), done.shown(9).remaining),
        (25, 0)
    );
    assert_eq!(done.shown(usize::MAX).remaining, 0);
}

#[test]
fn a_finished_column_of_exactly_ten_cards_has_no_footer() {
    let actions = finished(10);
    let columns = columns(&Stages::default(), &actions);
    let shown = column(&columns, "Done").shown(0);
    assert_eq!((shown.cards.len(), shown.remaining), (10, 0));
    let empty = column(&columns, "Cancel").shown(0);
    assert_eq!((empty.cards.len(), empty.remaining), (0, 0));
}

fn column_of(count: usize) -> Vec<Action> {
    (1..=count)
        .map(|n| action(&format!("c{n}"), &format!("rang: {n}\n")))
        .collect()
}

fn placed(actions: &[Action], moved: &str, before: Option<&str>) -> Vec<(String, u32)> {
    let cards: Vec<&Action> = actions.iter().collect();
    let before = before.map(reference);
    placed_ranks(&cards, &reference(moved), before.as_ref())
        .into_iter()
        .map(|(name, rank)| (name.as_str().to_owned(), rank.get()))
        .collect()
}

#[test]
fn a_card_dropped_between_two_others_takes_the_place_and_pushes_the_next_ones() {
    let actions = column_of(4);
    assert_eq!(
        placed(&actions, "c4", Some("c2")),
        vec![
            ("c4".to_owned(), 2),
            ("c2".to_owned(), 3),
            ("c3".to_owned(), 4)
        ]
    );
}

#[test]
fn a_card_dropped_before_the_first_goes_first() {
    let actions = column_of(3);
    assert_eq!(
        placed(&actions, "c3", Some("c1")),
        vec![
            ("c3".to_owned(), 1),
            ("c1".to_owned(), 2),
            ("c2".to_owned(), 3)
        ]
    );
}

#[test]
fn a_card_dropped_outside_the_cards_goes_to_the_bottom() {
    let actions = column_of(3);
    assert_eq!(
        placed(&actions, "c1", None),
        vec![
            ("c2".to_owned(), 1),
            ("c3".to_owned(), 2),
            ("c1".to_owned(), 3)
        ]
    );
    assert_eq!(
        placed(&actions, "c1", Some("inconnue")),
        placed(&actions, "c1", None)
    );
}

#[test]
fn a_card_dropped_where_it_already_is_changes_nothing() {
    let actions = column_of(3);
    assert_eq!(
        placed(&actions, "c2", Some("c3")),
        Vec::<(String, u32)>::new()
    );
    assert_eq!(placed(&actions, "c3", None), Vec::<(String, u32)>::new());
    assert_eq!(
        placed(&actions, "c2", Some("c2")),
        Vec::<(String, u32)>::new()
    );
}

#[test]
fn a_card_dropped_right_after_itself_is_not_moved() {
    let actions = column_of(3);
    assert_eq!(
        placed(&actions, "c1", Some("c2")),
        Vec::<(String, u32)>::new()
    );
}

#[test]
fn every_card_of_an_unranked_column_gets_its_place() {
    let actions = [action("a", ""), action("b", ""), action("c", "")];
    assert_eq!(
        placed(&actions, "c", Some("a")),
        vec![
            ("c".to_owned(), 1),
            ("a".to_owned(), 2),
            ("b".to_owned(), 3)
        ]
    );
}

#[test]
fn a_card_that_comes_from_another_column_enters_without_rank() {
    let actions = column_of(2);
    let cards: Vec<&Action> = actions.iter().collect();
    let came = reference("autre");
    let ranks = placed_ranks(&cards, &came, Some(&reference("c2")));
    let ranks: Vec<_> = ranks
        .iter()
        .map(|(n, r)| (n.as_str().to_owned(), r.get()))
        .collect();
    assert_eq!(ranks, vec![("autre".to_owned(), 2), ("c2".to_owned(), 3)]);
}

#[test]
fn a_card_dropped_in_an_empty_column_takes_the_first_place() {
    let cards: Vec<&Action> = Vec::new();
    let ranks = placed_ranks(&cards, &reference("a"), None);
    assert_eq!(ranks.len(), 1);
    assert_eq!(ranks[0].1.get(), 1);
}
