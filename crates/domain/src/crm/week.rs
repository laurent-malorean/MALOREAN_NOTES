//! « Ma semaine » (spécification § 7.2) : les actions ouvertes rangées par jour, sur huit colonnes,
//! « En retard » puis lundi à dimanche.

use super::action::Action;
use super::day::Day;

/// Combien de jours a une semaine.
const DAYS: usize = 7;

/// Une semaine, du lundi au dimanche.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Week {
    monday: Day,
}

/// Les colonnes de « Ma semaine » : « En retard » et les sept jours, toujours visibles même vides.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WeekColumns<'a> {
    /// « En retard » : les actions ouvertes datées d'avant le lundi de la semaine, la plus ancienne
    /// d'abord.
    pub late: Vec<&'a Action>,
    /// Les sept jours, lundi à dimanche, chacun avec ses actions ouvertes, dans l'ordre de création.
    pub days: [(Day, Vec<&'a Action>); DAYS],
}

impl Week {
    /// La semaine qui contient ce jour ; elle commence le lundi.
    #[must_use]
    pub fn containing(day: Day) -> Self {
        Self {
            monday: day.monday(),
        }
    }

    /// La semaine d'avant.
    #[must_use]
    pub fn previous(self) -> Self {
        Self {
            monday: self.monday.plus_days(-7),
        }
    }

    /// La semaine d'après.
    #[must_use]
    pub fn next(self) -> Self {
        Self {
            monday: self.monday.plus_days(7),
        }
    }

    /// Le lundi de la semaine.
    #[must_use]
    pub fn monday(self) -> Day {
        self.monday
    }

    /// Le dimanche de la semaine.
    #[must_use]
    pub fn sunday(self) -> Day {
        self.monday.plus_days(6)
    }

    /// Les colonnes de la semaine pour ces actions : seules les actions ouvertes y sont ; une action
    /// sans date, ou datée d'après le dimanche, n'y est pas.
    #[must_use]
    pub fn columns<'a>(self, actions: &'a [Action]) -> WeekColumns<'a> {
        let mut open: Vec<&Action> = actions.iter().filter(|action| action.is_open()).collect();
        open.sort_by(|a, b| a.date.cmp(&b.date).then_with(|| a.name.cmp(&b.name)));
        let late = open
            .iter()
            .filter(|action| action.date.is_some_and(|date| date < self.monday))
            .copied()
            .collect();
        let days = std::array::from_fn(|n| {
            let day = self.monday.plus_days(i64::try_from(n).unwrap_or_default());
            let of_day = open
                .iter()
                .filter(|action| action.date == Some(day))
                .copied();
            (day, of_day.collect())
        });
        WeekColumns { late, days }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crm::{Reference, Stages};

    fn day(text: &str) -> Day {
        Day::parse(text).unwrap()
    }

    fn action(name: &str, yaml: &str) -> Action {
        let content = format!("---\ntype: crm-action\n{yaml}---\n# {name}\n");
        Action::parse(Reference::to(name).unwrap(), &content, &Stages::default()).unwrap()
    }

    fn dated(name: &str, date: &str) -> Action {
        action(name, &format!("date: '{date}'\n"))
    }

    fn names(cards: &[&Action]) -> Vec<String> {
        cards
            .iter()
            .map(|card| card.name.as_str().to_owned())
            .collect()
    }

    #[test]
    fn a_week_starts_on_monday_and_ends_on_sunday() {
        let week = Week::containing(day("2026-11-26"));
        assert_eq!(week.monday(), day("2026-11-23"));
        assert_eq!(week.sunday(), day("2026-11-29"));
        assert_eq!(
            Week::containing(day("2026-11-23")).monday(),
            day("2026-11-23")
        );
        assert_eq!(
            Week::containing(day("2026-11-29")).monday(),
            day("2026-11-23")
        );
    }

    #[test]
    fn the_arrows_go_to_the_previous_and_the_next_week() {
        let week = Week::containing(day("2026-11-26"));
        assert_eq!(week.previous().monday(), day("2026-11-16"));
        assert_eq!(week.next().monday(), day("2026-11-30"));
        assert_eq!(week.next().previous(), week);
    }

    #[test]
    fn the_columns_are_the_seven_days_even_when_empty_and_an_empty_late_column() {
        let columns = Week::containing(day("2026-11-26")).columns(&[]);
        let days: Vec<String> = columns.days.iter().map(|(d, _)| d.to_string()).collect();
        assert_eq!(
            days,
            [
                "2026-11-23",
                "2026-11-24",
                "2026-11-25",
                "2026-11-26",
                "2026-11-27",
                "2026-11-28",
                "2026-11-29"
            ]
        );
        assert!(columns.late.is_empty());
        assert!(columns.days.iter().all(|(_, cards)| cards.is_empty()));
    }

    #[test]
    fn an_open_action_is_in_the_column_of_its_day() {
        let actions = [
            dated("a", "2026-11-23"),
            dated("b", "2026-11-29"),
            dated("c", "2026-11-26"),
            dated("d", "2026-11-26"),
        ];
        let columns = Week::containing(day("2026-11-26")).columns(&actions);
        assert_eq!(names(&columns.days[0].1), ["a"]);
        assert_eq!(names(&columns.days[3].1), ["c", "d"]);
        assert_eq!(names(&columns.days[6].1), ["b"]);
        assert!(columns.days[1].1.is_empty());
    }

    #[test]
    fn the_late_column_holds_the_open_actions_dated_before_the_monday_oldest_first() {
        let actions = [
            dated("a", "2026-11-22"),
            dated("b", "2026-11-01"),
            dated("c", "2026-11-23"),
            dated("d", "2025-01-01"),
        ];
        let columns = Week::containing(day("2026-11-26")).columns(&actions);
        assert_eq!(names(&columns.late), ["d", "b", "a"]);
        assert_eq!(names(&columns.days[0].1), ["c"]);
    }

    #[test]
    fn another_week_has_its_own_late_column() {
        let actions = [dated("a", "2026-11-23"), dated("b", "2026-11-30")];
        let next = Week::containing(day("2026-11-26")).next().columns(&actions);
        assert_eq!(names(&next.late), ["a"]);
        assert_eq!(names(&next.days[0].1), ["b"]);
    }

    #[test]
    fn the_actions_of_the_same_date_are_in_the_order_of_their_creation() {
        let actions = [dated("b", "2026-11-24"), dated("a", "2026-11-24")];
        let columns = Week::containing(day("2026-11-24")).columns(&actions);
        assert_eq!(names(&columns.days[1].1), ["a", "b"]);
    }

    #[test]
    fn finished_actions_actions_without_date_and_later_ones_are_not_shown() {
        let actions = [
            action("a", "statut: Done\ndate: '2026-11-24'\n"),
            action("b", "statut: Cancel\ndate: '2026-11-01'\n"),
            action("c", ""),
            dated("d", "2026-11-30"),
            action("e", "statut: Progress\ndate: '2026-11-24'\n"),
        ];
        let columns = Week::containing(day("2026-11-24")).columns(&actions);
        assert!(columns.late.is_empty());
        assert_eq!(names(&columns.days[1].1), ["e"]);
        let shown: usize = columns.days.iter().map(|(_, cards)| cards.len()).sum();
        assert_eq!(shown, 1);
    }
}
