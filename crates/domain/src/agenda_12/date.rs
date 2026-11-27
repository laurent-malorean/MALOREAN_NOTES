//! La date d'un événement (spécification `doc/specs/agenda-12.md` § 4.1, format
//! `doc/format/agenda-12.md` § 6.2) : un mois, et facultativement un jour, une année et une fin.

use std::fmt;

use super::month::Month;

/// L'année la plus basse et la plus haute qu'un événement peut porter.
pub const MIN_YEAR: i32 = 1;
/// Voir [`MIN_YEAR`].
pub const MAX_YEAR: i32 = 9999;

/// Pourquoi une date est refusée.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DateError {
    /// L'année n'est pas comprise entre 1 et 9999.
    YearOutOfRange,
    /// Le jour n'existe pas dans ce mois (31 février, 29 février d'une année non bissextile).
    NoSuchDay,
    /// Une fin est donnée sans jour de début.
    EndWithoutDay,
    /// La fin tombe avant le début.
    EndBeforeStart,
}

impl fmt::Display for DateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::YearOutOfRange => "L'année doit être comprise entre 1 et 9999.",
            Self::NoSuchDay => "Ce jour n'existe pas dans ce mois.",
            Self::EndWithoutDay => "La fin exige un jour de début.",
            Self::EndBeforeStart => "La fin est avant le début.",
        })
    }
}

impl std::error::Error for DateError {}

/// La fin d'un événement sur plusieurs jours : un jour, dans un mois.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EventEnd {
    /// Le jour de la fin.
    pub day: u32,
    /// Le mois de la fin ; le mois du début quand l'événement tient dans un seul mois.
    pub month: Month,
}

/// La date d'un événement : toujours valide, car on ne l'obtient que par [`EventDate::new`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EventDate {
    month: Month,
    day: Option<u32>,
    year: Option<i32>,
    end: Option<EventEnd>,
}

impl EventDate {
    /// La date de ce mois, de ce jour, de cette année et de cette fin. Une fin qui tombe le jour
    /// même du début n'est pas une fin : l'événement tient sur un jour. Une fin dans un mois plus
    /// petit que celui du début passe à l'année suivante (du 30 décembre au 2 janvier).
    ///
    /// # Errors
    ///
    /// [`DateError`] si l'année est hors de 1 à 9999, si le jour n'existe pas dans le mois, si une
    /// fin est donnée sans jour de début ou si elle tombe avant le début.
    pub fn new(
        month: Month,
        day: Option<u32>,
        year: Option<i32>,
        end: Option<EventEnd>,
    ) -> Result<Self, DateError> {
        if year.is_some_and(|year| !(MIN_YEAR..=MAX_YEAR).contains(&year)) {
            return Err(DateError::YearOutOfRange);
        }
        if day.is_some_and(|day| !exists(day, month, year)) {
            return Err(DateError::NoSuchDay);
        }
        let end = match (day, end) {
            (_, None) => None,
            (None, Some(_)) => return Err(DateError::EndWithoutDay),
            (Some(day), Some(end)) => checked_end(month, day, year, end)?,
        };
        Ok(Self {
            month,
            day,
            year,
            end,
        })
    }

    /// Le mois de début : la case de l'événement.
    #[must_use]
    pub fn month(&self) -> Month {
        self.month
    }

    /// Le jour de début, s'il est donné.
    #[must_use]
    pub fn day(&self) -> Option<u32> {
        self.day
    }

    /// L'année de début, si elle est donnée.
    #[must_use]
    pub fn year(&self) -> Option<i32> {
        self.year
    }

    /// La fin, pour un événement sur plusieurs jours.
    #[must_use]
    pub fn end(&self) -> Option<EventEnd> {
        self.end
    }
}

/// Le jour existe dans ce mois, pour cette année ou, sans année, pour au moins une année.
fn exists(day: u32, month: Month, year: Option<i32>) -> bool {
    (1..=month.last_day(year)).contains(&day)
}

/// La fin, valide pour un début le `day` de `month` : rien si elle tombe le jour du début.
fn checked_end(
    month: Month,
    day: u32,
    year: Option<i32>,
    end: EventEnd,
) -> Result<Option<EventEnd>, DateError> {
    let wraps = end.month < month;
    let end_year = year.map(|year| if wraps { year + 1 } else { year });
    if !exists(end.day, end.month, end_year) {
        return Err(DateError::NoSuchDay);
    }
    if end.month == month && end.day < day {
        return Err(DateError::EndBeforeStart);
    }
    Ok((end.month != month || end.day != day).then_some(end))
}

#[cfg(test)]
#[path = "date_tests.rs"]
mod tests;
