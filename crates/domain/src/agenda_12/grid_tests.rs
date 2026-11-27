use super::*;

fn placed(path: &str, header: &str, title: &str) -> PlacedEvent {
    let content = format!("---\ntype: agenda-12-evenement\n{header}---\n# {title}\n");
    PlacedEvent {
        path: NotePath::parse(path).unwrap(),
        event: Agenda12Event::parse(&content).unwrap(),
    }
}

fn titles(cell: &Cell) -> Vec<&str> {
    cell.events.iter().map(|p| p.event.title.as_str()).collect()
}

fn february(cells: &[Cell]) -> &Cell {
    &cells[1]
}

#[test]
fn the_grid_always_has_the_twelve_months_from_january_to_december() {
    let cells = grid(Vec::new(), None);
    let months: Vec<u32> = cells.iter().map(|cell| cell.month.number()).collect();
    assert_eq!(months, (1..=12).collect::<Vec<u32>>());
    assert!(cells.iter().all(|cell| cell.events.is_empty()));
}

#[test]
fn an_event_is_in_the_cell_of_its_month() {
    let cells = grid(vec![placed("a/x.md", "mois: 3\n", "Salon")], None);
    assert_eq!(titles(&cells[2]), ["Salon"]);
    assert_eq!(cells.iter().map(|c| c.events.len()).sum::<usize>(), 1);
}

#[test]
fn an_event_that_ends_in_another_month_stays_in_the_cell_of_its_start() {
    let events = vec![placed(
        "a/x.md",
        "mois: 1\njour: 30\njour-fin: 2\nmois-fin: 2\n",
        "Long",
    )];
    let cells = grid(events, None);
    assert_eq!(titles(&cells[0]), ["Long"]);
    assert!(cells[1].events.is_empty());
}

#[test]
fn a_cell_is_ordered_by_year_then_by_day_then_by_title() {
    let events = vec![
        placed("a/1.md", "mois: 2\n", "Zéro année"),
        placed("a/2.md", "mois: 2\nannee: 2029\n", "Domaine"),
        placed("a/3.md", "mois: 2\nannee: 2026\njour: 20\n", "Tard"),
        placed("a/4.md", "mois: 2\nannee: 2026\njour: 3\n", "Tôt"),
        placed("a/5.md", "mois: 2\nannee: 2026\n", "Sans jour"),
        placed("a/6.md", "mois: 2\njour: 1\n", "Sans année, jour"),
    ];
    let cells = grid(events, None);
    assert_eq!(
        titles(february(&cells)),
        [
            "Tôt",
            "Tard",
            "Sans jour",
            "Domaine",
            "Sans année, jour",
            "Zéro année"
        ]
    );
}

#[test]
fn titles_are_ordered_without_counting_case_or_accents() {
    let events = vec![
        placed("a/1.md", "mois: 2\n", "zèbre"),
        placed("a/2.md", "mois: 2\n", "Étoile"),
        placed("a/3.md", "mois: 2\n", "arbre"),
        placed("a/4.md", "mois: 2\n", "Zeste"),
    ];
    let cells = grid(events, None);
    assert_eq!(
        titles(february(&cells)),
        ["arbre", "Étoile", "zèbre", "Zeste"]
    );
}

#[test]
fn two_events_alike_are_ordered_by_path() {
    let events = vec![
        placed("a/b.md", "mois: 2\n", "Salon"),
        placed("a/a.md", "mois: 2\n", "Salon"),
    ];
    let cells = grid(events, None);
    let paths: Vec<String> = february(&cells)
        .events
        .iter()
        .map(|p| p.path.to_path())
        .collect();
    assert_eq!(paths, ["a/a.md", "a/b.md"]);
}

#[test]
fn an_old_event_never_closed_stays_in_its_cell() {
    let events = vec![placed("a/x.md", "mois: 2\nannee: 2019\n", "Vieux")];
    assert_eq!(titles(&grid(events, None)[1]), ["Vieux"]);
}

#[test]
fn the_tag_filter_shows_only_the_events_that_carry_the_tag() {
    let events = vec![
        placed("a/1.md", "mois: 2\ntags: [Salon, pro]\n", "Un"),
        placed("a/2.md", "mois: 2\ntags: [perso]\n", "Deux"),
        placed("a/3.md", "mois: 2\n", "Trois"),
    ];
    assert_eq!(titles(&grid(events.clone(), Some("salon"))[1]), ["Un"]);
    assert_eq!(titles(&grid(events.clone(), Some("perso"))[1]), ["Deux"]);
    assert!(grid(events.clone(), Some("absente"))[1].events.is_empty());
    assert_eq!(titles(&grid(events, None)[1]), ["Deux", "Trois", "Un"]);
}

#[test]
fn the_tags_of_the_events_are_listed_once_in_alphabetical_order() {
    let events = vec![
        placed("a/1.md", "mois: 2\ntags: [salon, Pro]\n", "Un"),
        placed("a/2.md", "mois: 3\ntags: [Salon, été]\n", "Deux"),
        placed("a/3.md", "mois: 4\n", "Trois"),
    ];
    assert_eq!(event_tags(&events), ["été", "Pro", "salon"]);
    assert!(event_tags(&[]).is_empty());
}

#[test]
fn the_archives_come_from_the_most_recently_closed_to_the_oldest() {
    let events = vec![
        placed("a/archives/1.md", "mois: 2\nclos-le: 2026-03-01\n", "Mars"),
        placed("a/archives/2.md", "mois: 2\n", "Sans jour"),
        placed(
            "a/archives/3.md",
            "mois: 2\nclos-le: 2026-11-27\n",
            "Novembre",
        ),
        placed("a/archives/4.md", "mois: 2\nclos-le: 2025-12-31\n", "Avant"),
        placed(
            "a/archives/5.md",
            "mois: 2\nclos-le: 2026-11-27\n",
            "Aaa même jour",
        ),
    ];
    let sorted: Vec<String> = archives_order(events)
        .iter()
        .map(|p| p.event.title.clone())
        .collect();
    assert_eq!(
        sorted,
        ["Aaa même jour", "Novembre", "Mars", "Avant", "Sans jour"]
    );
}
