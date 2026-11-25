//! Les compteurs des onglets Personnes, Entreprises et Projets (spécification §§ 7.3 à 7.5) : combien
//! d'actions ouvertes, en retard, à faire aujourd'hui.

use super::action::Action;
use super::action_view::Urgency;
use super::day::Day;

/// Le compte d'un ensemble d'actions le jour d'aujourd'hui.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Tally {
    /// Les actions ouvertes (« TODO » ou dans une étape).
    pub open: usize,
    /// Parmi elles, celles en retard : montrées en rouge.
    pub late: usize,
    /// Parmi elles, celles à faire aujourd'hui : montrées en orange.
    pub today: usize,
}

impl Tally {
    /// Le compte de ces actions le jour `today`.
    #[must_use]
    pub fn of<'a>(actions: impl IntoIterator<Item = &'a Action>, today: Day) -> Self {
        let mut tally = Self::default();
        for action in actions.into_iter().filter(|action| action.is_open()) {
            tally.open += 1;
            match action.urgency(today) {
                Some(Urgency::Late(_)) => tally.late += 1,
                Some(Urgency::Today) => tally.today += 1,
                None => {}
            }
        }
        tally
    }
}

/// Ces actions ouvertes, la plus en retard d'abord : par date, la plus ancienne en tête ; une action
/// sans date à la fin ; à date égale, dans l'ordre de création.
pub fn sort_most_late_first(actions: &mut [&Action]) {
    actions.sort_by(|a, b| {
        let dates = match (a.date, b.date) {
            (Some(x), Some(y)) => x.cmp(&y),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => std::cmp::Ordering::Equal,
        };
        dates.then_with(|| a.name.cmp(&b.name))
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crm::{Reference, Stages};

    fn action(name: &str, yaml: &str) -> Action {
        let content = format!("---\ntype: crm-action\n{yaml}---\n# {name}\n");
        Action::parse(Reference::to(name).unwrap(), &content, &Stages::default()).unwrap()
    }

    #[test]
    fn the_tally_counts_the_open_late_and_today_actions() {
        let today = Day::parse("2026-11-24").unwrap();
        let actions = [
            action("a", "date: '2026-11-20'\n"),
            action("b", "date: '2026-11-23'\nstatut: Progress\n"),
            action("c", "date: '2026-11-24'\n"),
            action("d", "date: '2026-12-01'\n"),
            action("e", ""),
            action("f", "date: '2026-11-01'\nstatut: Done\n"),
            action("g", "date: '2026-11-24'\nstatut: Cancel\n"),
        ];
        assert_eq!(
            Tally::of(&actions, today),
            Tally {
                open: 5,
                late: 2,
                today: 1
            }
        );
        assert_eq!(Tally::of([], today), Tally::default());
    }

    #[test]
    fn the_most_late_action_comes_first() {
        let actions = [
            action("c", ""),
            action("b", "date: '2026-11-01'\n"),
            action("a", "date: '2026-11-01'\n"),
            action("d", "date: '2025-01-01'\n"),
            action("e", "date: '2026-12-01'\n"),
        ];
        let mut sorted: Vec<&Action> = actions.iter().collect();
        sort_most_late_first(&mut sorted);
        let names: Vec<_> = sorted.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(names, ["d", "a", "b", "e", "c"]);
    }
}
