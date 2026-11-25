//! Un jour du calendrier, écrit `2026-11-24` : la date d'une action, le début et la fin d'un
//! passage dans un parcours. Le jour d'aujourd'hui est donné par l'horloge, jamais lu ici.

use std::fmt;

use crate::Moment;

/// Un jour du calendrier grégorien, de l'an 1 à l'an 9999, sans heure ; les jours se rangent
/// du plus ancien au plus récent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Day {
    year: i32,
    month: u32,
    day: u32,
}

/// Jour refusé : ce n'est pas une date du calendrier écrite `AAAA-MM-JJ`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidDay(pub String);

impl fmt::Display for InvalidDay {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "jour invalide : « {} » (attendu : AAAA-MM-JJ)", self.0)
    }
}

impl std::error::Error for InvalidDay {}

const MIN_YEAR: i32 = 1;
const MAX_YEAR: i32 = 9999;
const DAYS_PER_WEEK: i64 = 7;
/// Le 1er janvier 1970, un jeudi, est à trois jours après le lundi de sa semaine.
const EPOCH_DAYS_FROM_MONDAY: i64 = 3;

impl Day {
    /// Le jour de ce calendrier.
    ///
    /// # Errors
    ///
    /// [`InvalidDay`] si l'année n'est pas entre 1 et 9999, ou si le mois et le jour ne forment pas
    /// une date qui existe (29 février d'une année non bissextile, 31 avril…).
    pub fn new(year: i32, month: u32, day: u32) -> Result<Self, InvalidDay> {
        let valid = (MIN_YEAR..=MAX_YEAR).contains(&year)
            && (1..=12).contains(&month)
            && (1..=days_in_month(year, month)).contains(&day);
        if valid {
            Ok(Self { year, month, day })
        } else {
            Err(InvalidDay(format!("{year:04}-{month:02}-{day:02}")))
        }
    }

    /// Le jour de ce moment de l'horloge.
    ///
    /// # Errors
    ///
    /// [`InvalidDay`] si le jour du mois n'existe pas ce mois-là (31 février).
    pub fn from_moment(moment: Moment) -> Result<Self, InvalidDay> {
        let (year, month, day, _, _) = moment.parts();
        Self::new(year, month, day)
    }

    /// Le jour écrit `AAAA-MM-JJ` (quatre chiffres, puis deux, puis deux).
    ///
    /// # Errors
    ///
    /// [`InvalidDay`] si le texte n'a pas cette forme ou n'est pas une date qui existe.
    pub fn parse(text: &str) -> Result<Self, InvalidDay> {
        let invalid = || InvalidDay(text.to_owned());
        let mut parts = text.split('-');
        let mut number = |digits: usize| {
            parts
                .next()
                .filter(|part| part.len() == digits && part.bytes().all(|b| b.is_ascii_digit()))
                .and_then(|part| part.parse::<u32>().ok())
        };
        let (year, month, day) = (
            number(4).ok_or_else(invalid)?,
            number(2).ok_or_else(invalid)?,
            number(2).ok_or_else(invalid)?,
        );
        if parts.next().is_some() {
            return Err(invalid());
        }
        let year = i32::try_from(year).map_err(|_| invalid())?;
        Self::new(year, month, day).map_err(|_| invalid())
    }

    /// L'année.
    #[must_use]
    pub fn year(self) -> i32 {
        self.year
    }

    /// Le mois, de 1 à 12.
    #[must_use]
    pub fn month(self) -> u32 {
        self.month
    }

    /// Le jour du mois, à partir de 1.
    #[must_use]
    pub fn day_of_month(self) -> u32 {
        self.day
    }

    /// Le nombre de jours depuis le 1er janvier 1970 (négatif avant).
    #[must_use]
    pub fn days_since_epoch(self) -> i64 {
        // Algorithme de Howard Hinnant : l'année commence en mars, le 29 février finit l'année.
        let year = i64::from(self.year) - i64::from(self.month <= 2);
        let era = year.div_euclid(400);
        let year_of_era = year.rem_euclid(400);
        let shifted_month = (i64::from(self.month) + 9) % 12;
        let day_of_year = (153 * shifted_month + 2) / 5 + i64::from(self.day) - 1;
        let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
        era * 146_097 + day_of_era - 719_468
    }

    /// Le jour situé `days` jours après le 1er janvier 1970.
    fn from_days_since_epoch(days: i64) -> Self {
        let shifted = days + 719_468;
        let era = shifted.div_euclid(146_097);
        let day_of_era = shifted.rem_euclid(146_097);
        let year_of_era =
            (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
        let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
        let shifted_month = (5 * day_of_year + 2) / 153;
        let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
        let month = if shifted_month < 10 {
            shifted_month + 3
        } else {
            shifted_month - 9
        };
        let year = year_of_era + era * 400 + i64::from(month <= 2);
        Self {
            year: i32::try_from(year).unwrap_or(MAX_YEAR),
            month: u32::try_from(month).unwrap_or(1),
            day: u32::try_from(day).unwrap_or(1),
        }
    }

    /// Le jour situé `days` jours plus tard (plus tôt si négatif), borné à l'an 1 et à l'an 9999.
    #[must_use]
    pub fn plus_days(self, days: i64) -> Self {
        let first = Self {
            year: MIN_YEAR,
            month: 1,
            day: 1,
        };
        let last = Self {
            year: MAX_YEAR,
            month: 12,
            day: 31,
        };
        let moved = self.days_since_epoch().saturating_add(days);
        if moved <= first.days_since_epoch() {
            first
        } else if moved >= last.days_since_epoch() {
            last
        } else {
            Self::from_days_since_epoch(moved)
        }
    }

    /// Le nombre de jours qu'il faut ajouter à ce jour pour atteindre `later` (négatif si `later`
    /// est avant).
    #[must_use]
    pub fn days_until(self, later: Self) -> i64 {
        later.days_since_epoch() - self.days_since_epoch()
    }

    /// Le nombre de jours depuis le lundi de sa semaine : 0 pour un lundi, 6 pour un dimanche.
    #[must_use]
    pub fn days_since_monday(self) -> i64 {
        (self.days_since_epoch() + EPOCH_DAYS_FROM_MONDAY).rem_euclid(DAYS_PER_WEEK)
    }

    /// Le lundi de sa semaine : la semaine commence le lundi.
    #[must_use]
    pub fn monday(self) -> Self {
        self.plus_days(-self.days_since_monday())
    }
}

impl fmt::Display for Day {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }
}

/// Un jour et une heure à la minute, écrits `2026-11-24 10:32` : le moment d'un commentaire (heure du
/// Mac). Les moments se rangent du plus ancien au plus récent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct DayTime {
    day: Day,
    hour: u32,
    minute: u32,
}

impl DayTime {
    /// Le moment de ce jour à `hour` heures et `minute` minutes ; rien si l'heure n'est pas entre 0 et
    /// 23 ou la minute entre 0 et 59.
    #[must_use]
    pub fn new(day: Day, hour: u32, minute: u32) -> Option<Self> {
        (hour < 24 && minute < 60).then_some(Self { day, hour, minute })
    }

    /// Le moment de l'horloge, à la minute.
    ///
    /// # Errors
    ///
    /// [`InvalidDay`] si le jour du mois n'existe pas ce mois-là (31 février).
    pub fn from_moment(moment: Moment) -> Result<Self, InvalidDay> {
        let (_, _, _, hour, minute) = moment.parts();
        Ok(Self {
            day: Day::from_moment(moment)?,
            hour,
            minute,
        })
    }

    /// Le moment écrit `AAAA-MM-JJ HH:MM` (deux chiffres pour l'heure et la minute) ; rien si le texte
    /// n'a pas cette forme.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        let (day, time) = text.split_once(' ')?;
        let (hour, minute) = time.split_once(':')?;
        let two_digits = |part: &str| {
            (part.len() == 2 && part.bytes().all(|b| b.is_ascii_digit()))
                .then(|| part.parse::<u32>().ok())
                .flatten()
        };
        Self::new(
            Day::parse(day).ok()?,
            two_digits(hour)?,
            two_digits(minute)?,
        )
    }

    /// Le jour.
    #[must_use]
    pub fn day(self) -> Day {
        self.day
    }
}

impl fmt::Display for DayTime {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} {:02}:{:02}", self.day, self.hour, self.minute)
    }
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        2 if is_leap(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

fn is_leap(year: i32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(text: &str) -> Day {
        Day::parse(text).unwrap()
    }

    #[test]
    fn a_day_and_a_time_are_those_of_the_clock() {
        let moment = Moment::new(2026, 11, 24, 10, 32).unwrap();
        assert_eq!(Day::from_moment(moment), Ok(day("2026-11-24")));
        assert_eq!(
            DayTime::from_moment(moment).map(|t| t.to_string()),
            Ok("2026-11-24 10:32".to_owned())
        );
        let impossible = Moment::new(2026, 2, 31, 10, 32).unwrap();
        assert!(Day::from_moment(impossible).is_err());
        assert!(DayTime::from_moment(impossible).is_err());
    }

    #[test]
    fn a_day_is_read_from_and_written_as_year_month_day() {
        let parsed = day("2026-11-24");
        assert_eq!(
            (parsed.year(), parsed.month(), parsed.day_of_month()),
            (2026, 11, 24)
        );
        assert_eq!(parsed.to_string(), "2026-11-24");
        assert_eq!(day("0001-01-01").to_string(), "0001-01-01");
        assert_eq!(day("9999-12-31").to_string(), "9999-12-31");
    }

    #[test]
    fn a_text_that_is_not_a_date_of_the_calendar_is_refused() {
        for text in [
            "",
            "2026-11",
            "2026-11-24-1",
            "26-11-24",
            "2026-1-24",
            "2026-11-4",
            "2026/11/24",
            "2026-11-24 ",
            "2026-13-01",
            "2026-00-10",
            "2026-11-00",
            "2026-11-31",
            "2026-02-29",
            "0000-01-01",
            "+026-11-24",
            "2026-11-2a",
            "date",
        ] {
            assert_eq!(Day::parse(text), Err(InvalidDay(text.to_owned())), "{text}");
        }
        assert_eq!(
            Day::parse("2026-02-30").unwrap_err().to_string(),
            "jour invalide : « 2026-02-30 » (attendu : AAAA-MM-JJ)"
        );
    }

    #[test]
    fn the_last_day_of_each_month_is_the_one_of_the_calendar() {
        let last = |year, month| (28..=32).rev().find(|d| Day::new(year, month, *d).is_ok());
        let lasts: Vec<_> = (1..=12).map(|month| last(2026, month)).collect();
        assert_eq!(
            lasts,
            [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31].map(Some)
        );
        assert_eq!(last(2028, 2), Some(29));
        assert_eq!(last(1900, 2), Some(28));
        assert_eq!(last(2000, 2), Some(29));
    }

    #[test]
    fn a_year_out_of_range_is_refused() {
        assert!(Day::new(0, 1, 1).is_err());
        assert!(Day::new(10_000, 1, 1).is_err());
        assert!(Day::new(-5, 1, 1).is_err());
    }

    #[test]
    fn days_are_counted_from_the_first_of_january_1970() {
        assert_eq!(day("1970-01-01").days_since_epoch(), 0);
        assert_eq!(day("1970-01-02").days_since_epoch(), 1);
        assert_eq!(day("1969-12-31").days_since_epoch(), -1);
        assert_eq!(day("2000-03-01").days_since_epoch(), 11_017);
        assert_eq!(day("2026-11-24").days_since_epoch(), 20_781);
    }

    #[test]
    fn adding_days_crosses_months_and_years() {
        assert_eq!(day("2026-11-24").plus_days(0), day("2026-11-24"));
        assert_eq!(day("2026-11-24").plus_days(6), day("2026-11-30"));
        assert_eq!(day("2026-11-24").plus_days(7), day("2026-12-01"));
        assert_eq!(day("2026-12-31").plus_days(1), day("2027-01-01"));
        assert_eq!(day("2026-03-01").plus_days(-1), day("2026-02-28"));
        assert_eq!(day("2026-01-01").plus_days(-1), day("2025-12-31"));
    }

    #[test]
    fn adding_days_crosses_leap_days_and_whole_years() {
        assert_eq!(day("2028-02-28").plus_days(1), day("2028-02-29"));
        assert_eq!(day("2027-02-28").plus_days(1), day("2027-03-01"));
        assert_eq!(day("2026-11-24").plus_days(-365), day("2025-11-24"));
        assert_eq!(day("2000-01-01").plus_days(366), day("2001-01-01"));
    }

    #[test]
    fn adding_days_stops_at_the_first_and_the_last_day_of_the_calendar() {
        assert_eq!(day("0001-01-02").plus_days(-5), day("0001-01-01"));
        assert_eq!(day("0001-01-01").plus_days(-1), day("0001-01-01"));
        assert_eq!(day("9999-12-30").plus_days(5), day("9999-12-31"));
        assert_eq!(day("9999-12-31").plus_days(1), day("9999-12-31"));
        assert_eq!(day("2026-01-01").plus_days(i64::MAX), day("9999-12-31"));
        assert_eq!(day("2026-01-01").plus_days(i64::MIN), day("0001-01-01"));
    }

    #[test]
    fn a_distance_between_two_days_is_counted_in_days() {
        assert_eq!(day("2026-11-24").days_until(day("2026-11-25")), 1);
        assert_eq!(day("2026-11-25").days_until(day("2026-11-24")), -1);
        assert_eq!(day("2026-11-24").days_until(day("2026-11-24")), 0);
        assert_eq!(day("2025-11-24").days_until(day("2026-11-24")), 365);
    }

    #[test]
    fn a_week_starts_on_monday() {
        // Le 23/11/2026 est un lundi.
        let week: Vec<_> = (23..=29)
            .map(|d| day(&format!("2026-11-{d}")).days_since_monday())
            .collect();
        assert_eq!(week, [0, 1, 2, 3, 4, 5, 6]);
        assert_eq!(day("2026-11-29").monday(), day("2026-11-23"));
        assert_eq!(day("2026-11-23").monday(), day("2026-11-23"));
        assert_eq!(day("2026-11-30").monday(), day("2026-11-30"));
        assert_eq!(day("2026-01-01").monday(), day("2025-12-29"));
        assert_eq!(day("1970-01-01").days_since_monday(), 3);
        assert_eq!(day("1969-12-29").days_since_monday(), 0);
    }

    #[test]
    fn days_are_ordered_from_the_oldest_to_the_most_recent() {
        assert!(day("2026-11-24") < day("2026-11-25"));
        assert!(day("2026-11-30") < day("2026-12-01"));
        assert!(day("2025-12-31") < day("2026-01-01"));
    }

    #[test]
    fn a_moment_is_written_as_a_day_and_a_time_to_the_minute() {
        let moment = DayTime::parse("2026-11-24 10:32").unwrap();
        assert_eq!(moment.day(), day("2026-11-24"));
        assert_eq!(moment.to_string(), "2026-11-24 10:32");
        assert_eq!(
            DayTime::parse("2026-11-24 00:00").unwrap().to_string(),
            "2026-11-24 00:00"
        );
        assert_eq!(
            DayTime::parse("2026-11-24 23:59").unwrap().to_string(),
            "2026-11-24 23:59"
        );
        assert_eq!(
            DayTime::new(day("2026-11-24"), 9, 5).unwrap().to_string(),
            "2026-11-24 09:05"
        );
    }

    #[test]
    fn a_text_that_is_not_a_moment_is_refused() {
        for text in [
            "",
            "2026-11-24",
            "2026-11-24 10",
            "2026-11-24 10:3",
            "2026-11-24 1:32",
            "2026-11-24 24:00",
            "2026-11-24 10:60",
            "2026-11-31 10:32",
            "2026-11-24  10:32",
            "2026-11-24 10:32:00",
            "2026-11-24 ab:cd",
            "2026-11-24T10:32",
        ] {
            assert_eq!(DayTime::parse(text), None, "{text:?}");
        }
        assert_eq!(DayTime::new(day("2026-11-24"), 24, 0), None);
        assert_eq!(DayTime::new(day("2026-11-24"), 0, 60), None);
    }

    #[test]
    fn moments_are_ordered_from_the_oldest_to_the_most_recent() {
        let at = |text| DayTime::parse(text).unwrap();
        assert!(at("2026-11-24 10:32") < at("2026-11-24 10:33"));
        assert!(at("2026-11-24 10:59") < at("2026-11-24 11:00"));
        assert!(at("2026-11-24 23:59") < at("2026-11-25 00:00"));
    }

    #[test]
    fn days_far_from_the_epoch_go_through_their_count_and_back() {
        let first = day("0001-01-01").days_since_epoch();
        let last = day("9999-12-31").days_since_epoch();
        for count in (first..=last).step_by(997) {
            let back = Day::from_days_since_epoch(count);
            assert_eq!(back.days_since_epoch(), count, "{back}");
        }
        assert_eq!(Day::from_days_since_epoch(last), day("9999-12-31"));
        assert_eq!(Day::from_days_since_epoch(first), day("0001-01-01"));
    }

    #[test]
    fn centuries_that_are_not_leap_have_no_february_29() {
        assert_eq!(day("1900-02-28").plus_days(1), day("1900-03-01"));
        assert_eq!(day("2100-02-28").plus_days(1), day("2100-03-01"));
        assert_eq!(day("2400-02-28").plus_days(1), day("2400-02-29"));
        assert_eq!(day("1600-03-01").plus_days(-1), day("1600-02-29"));
        assert_eq!(day("0400-03-01").plus_days(-366), day("0399-03-01"));
    }

    #[test]
    fn every_day_of_several_years_goes_through_its_count_and_back() {
        let first = day("1999-12-25").days_since_epoch();
        for count in first..first + 3000 {
            let back = Day::from_days_since_epoch(count);
            assert_eq!(back.days_since_epoch(), count, "{back}");
            assert_eq!(Day::parse(&back.to_string()), Ok(back));
        }
    }
}
