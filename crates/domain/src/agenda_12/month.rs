//! Un mois de l'année, de janvier à décembre : la case d'un événement et le mois de sa fin.

/// Un mois, de 1 (janvier) à 12 (décembre).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Month(u32);

/// Les noms des mois, de janvier à décembre.
const NAMES: [&str; 12] = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
];

/// Le nombre de jours de chaque mois, février compté pour 29 : le jour le plus haut que le mois
/// permet pour au moins une année.
const LONGEST: [u32; 12] = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

impl Month {
    /// Les douze mois, de janvier à décembre.
    pub const ALL: [Self; 12] = [
        Self(1),
        Self(2),
        Self(3),
        Self(4),
        Self(5),
        Self(6),
        Self(7),
        Self(8),
        Self(9),
        Self(10),
        Self(11),
        Self(12),
    ];

    /// Le mois de ce numéro, de 1 à 12 ; rien pour un autre nombre.
    #[must_use]
    pub fn new(number: u32) -> Option<Self> {
        (1..=12).contains(&number).then_some(Self(number))
    }

    /// Son numéro, de 1 (janvier) à 12 (décembre).
    #[must_use]
    pub fn number(self) -> u32 {
        self.0
    }

    /// Son nom en français, en minuscules (`février`).
    #[must_use]
    pub fn name(self) -> &'static str {
        NAMES[self.0 as usize - 1]
    }

    /// Le jour le plus haut que ce mois permet, février compté pour 29 quand l'année n'est pas
    /// donnée ou bissextile, 28 sinon.
    #[must_use]
    pub fn last_day(self, year: Option<i32>) -> u32 {
        match year {
            Some(year) if self.0 == 2 && !is_leap(year) => 28,
            _ => LONGEST[self.0 as usize - 1],
        }
    }
}

/// L'année est bissextile : divisible par 4, sauf les siècles qui ne le sont pas par 400.
fn is_leap(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_month_is_a_number_from_one_to_twelve() {
        assert_eq!(Month::new(0), None);
        assert_eq!(Month::new(1).map(Month::number), Some(1));
        assert_eq!(Month::new(12).map(Month::number), Some(12));
        assert_eq!(Month::new(13), None);
    }

    #[test]
    fn all_the_months_run_from_january_to_december() {
        let numbers: Vec<u32> = Month::ALL.iter().map(|month| month.number()).collect();
        assert_eq!(numbers, (1..=12).collect::<Vec<u32>>());
    }

    #[test]
    fn a_month_has_its_french_name() {
        let names: Vec<&str> = Month::ALL.iter().map(|month| month.name()).collect();
        assert_eq!(
            names,
            [
                "janvier",
                "février",
                "mars",
                "avril",
                "mai",
                "juin",
                "juillet",
                "août",
                "septembre",
                "octobre",
                "novembre",
                "décembre"
            ]
        );
    }

    #[test]
    fn the_last_day_of_each_month_without_a_year_allows_the_29th_of_february() {
        let last: Vec<u32> = Month::ALL.iter().map(|m| m.last_day(None)).collect();
        assert_eq!(last, [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    }

    #[test]
    fn february_has_29_days_only_in_a_leap_year() {
        let february = Month::new(2).unwrap();
        assert_eq!(february.last_day(Some(2028)), 29);
        assert_eq!(february.last_day(Some(2027)), 28);
        assert_eq!(february.last_day(Some(1900)), 28);
        assert_eq!(february.last_day(Some(2000)), 29);
        assert_eq!(Month::new(4).unwrap().last_day(Some(2027)), 30);
    }
}
