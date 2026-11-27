//! Changer la date d'un événement (spécification § 4.1) : un geste change un champ à la fois ; le
//! résultat doit rester une date valide, sinon le geste est refusé avec un message.

use super::date::{DateError, EventDate, EventEnd};
use super::event::{Agenda12Event, END_MONTH_KEY};
use super::event_write::{with_day, with_end, with_month, with_year};
use super::month::Month;
use crate::crm::header;

/// Un geste sur la date d'un événement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DateChange {
    /// Son mois de début : sa case. Une fin dans le même mois que le début le suit.
    Month(Month),
    /// Son jour de début ; sans jour, plus de fin possible.
    Day(Option<u32>),
    /// Son année de début.
    Year(Option<i32>),
    /// Sa fin ; une fin le jour du début n'est pas une fin.
    End(Option<EventEnd>),
}

/// La date de `event` après `change`, et le texte `content` de l'événement avec la clé touchée
/// réécrite, le reste inchangé.
///
/// # Errors
///
/// [`DateError`] si la date qui en résulte n'existe pas : jour absent du mois, année hors de 1 à
/// 9999, fin sans jour de début ou avant le début.
pub fn change_date(
    content: &str,
    event: &Agenda12Event,
    change: DateChange,
) -> Result<(EventDate, String), DateError> {
    let old = event.date;
    let (mut month, mut day, mut year, mut end) = (old.month(), old.day(), old.year(), old.end());
    match change {
        DateChange::Month(to) => {
            end = end.map(|end| follow_month(content, end, month, to));
            month = to;
        }
        DateChange::Day(to) => day = to,
        DateChange::Year(to) => year = to,
        DateChange::End(to) => end = to,
    }
    let new = EventDate::new(month, day, year, end)?;
    let written = match change {
        DateChange::Month(month) => with_month(content, month),
        DateChange::Day(_) => with_day(content, new.day()),
        DateChange::Year(_) => with_year(content, new.year()),
        DateChange::End(_) => with_end(content, new.month(), new.end()),
    };
    Ok((new, written))
}

/// La fin d'un événement dont le début passe de `from` à `to` : une fin sans mois écrit tombe le même
/// mois que le début, donc le suit ; une fin dans un mois écrit reste où elle est.
fn follow_month(content: &str, end: EventEnd, from: Month, to: Month) -> EventEnd {
    if end.month == from && header::scalar(content, END_MONTH_KEY).is_none() {
        EventEnd {
            day: end.day,
            month: to,
        }
    } else {
        end
    }
}

#[cfg(test)]
#[path = "event_change_tests.rs"]
mod tests;
