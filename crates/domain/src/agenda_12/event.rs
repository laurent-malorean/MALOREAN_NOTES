//! Un événement d'un agenda 12 (spécification `doc/specs/agenda-12.md` § 4, format
//! `doc/format/agenda-12.md` § 6) : un titre, un mois, et ce que l'utilisateur a voulu dire de plus.

use std::fmt;

use super::country::Country;
use super::date::{EventDate, EventEnd, MAX_YEAR, MIN_YEAR};
use super::month::Month;
use crate::crm::Day;
use crate::crm::header;
use crate::front_matter::{declared_type, split};
use crate::tag::tags;
use crate::title::Title;

/// La valeur de `type:` d'un événement.
pub const EVENT_TYPE: &str = "agenda-12-evenement";

/// Les clés de l'en-tête d'un événement, dans l'ordre où l'application les écrit.
pub(super) const MONTH_KEY: &str = "mois";
pub(super) const DAY_KEY: &str = "jour";
pub(super) const YEAR_KEY: &str = "annee";
pub(super) const END_DAY_KEY: &str = "jour-fin";
pub(super) const END_MONTH_KEY: &str = "mois-fin";
pub(super) const COUNTRY_KEY: &str = "pays";
pub(super) const CITY_KEY: &str = "ville";
pub(super) const CLOSED_KEY: &str = "clos-le";

/// Pourquoi un événement est laissé de côté : jamais effacé, seulement non lu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventUnreadable {
    /// L'en-tête ne déclare pas `type: agenda-12-evenement`.
    WrongType,
    /// L'événement n'a pas de titre `#`.
    NoTitle,
    /// Le mois est absent ou illisible.
    NoMonth,
}

impl fmt::Display for EventUnreadable {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::WrongType => "Ce fichier n'est pas un événement d'un agenda 12.",
            Self::NoTitle => "Cet événement n'a pas de titre.",
            Self::NoMonth => "Cet événement n'a pas de mois lisible.",
        })
    }
}

impl std::error::Error for EventUnreadable {}

/// Un événement lu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Agenda12Event {
    /// Son titre : le premier titre `#` de la note.
    pub title: String,
    /// Sa date : le mois, et le jour, l'année et la fin qu'il porte.
    pub date: EventDate,
    /// Son pays, s'il est donné et connu de la norme.
    pub country: Option<Country>,
    /// Sa ville, si elle est donnée.
    pub city: Option<String>,
    /// Ses étiquettes (`tags` de l'en-tête, comme toute note).
    pub tags: Vec<String>,
    /// Le jour de sa clôture, s'il est clos et l'a retenu.
    pub closed_on: Option<Day>,
}

impl Agenda12Event {
    /// L'événement que dit `content`. Un champ illisible autre que le mois est ignoré, sans que le
    /// fichier change ; une fin illisible aussi (l'événement reste sans fin).
    ///
    /// # Errors
    ///
    /// [`EventUnreadable`] si ce n'est pas une note `type: agenda-12-evenement`, si elle n'a pas de
    /// titre ou si son mois est absent ou illisible.
    pub fn parse(content: &str) -> Result<Self, EventUnreadable> {
        if declared_type(content) != Some(EVENT_TYPE) {
            return Err(EventUnreadable::WrongType);
        }
        let title = Title::of(content).ok_or(EventUnreadable::NoTitle)?;
        let month = number(content, MONTH_KEY)
            .and_then(Month::new)
            .ok_or(EventUnreadable::NoMonth)?;
        Ok(Self {
            title: title.as_str().to_owned(),
            date: read_date(content, month),
            country: header::scalar(content, COUNTRY_KEY)
                .and_then(|code| Country::from_code(&code)),
            city: header::scalar(content, CITY_KEY),
            tags: tags(content),
            closed_on: header::scalar(content, CLOSED_KEY).and_then(|day| Day::parse(&day).ok()),
        })
    }
}

/// Ce que la recherche par les mots lit d'un événement : sa ville, le nom de son pays, ses
/// étiquettes, puis son texte (titre compris) ; jamais ses propriétés techniques (mois, jour, année,
/// fin, jour de clôture). Rien si l'événement ne se lit pas : son texte entier est alors cherché.
#[must_use]
pub fn searchable_text(content: &str) -> Option<String> {
    let event = Agenda12Event::parse(content).ok()?;
    let mut parts: Vec<&str> = event.city.as_deref().into_iter().collect();
    parts.extend(event.country.map(Country::name));
    parts.extend(event.tags.iter().map(String::as_str));
    parts.push(split(content).1);
    Some(parts.join("\n"))
}

/// Un nombre écrit en chiffres, sans signe ni décimale ; les zéros de tête sont permis.
fn number(content: &str, key: &str) -> Option<u32> {
    let written = header::scalar(content, key)?;
    written
        .chars()
        .all(|c| c.is_ascii_digit())
        .then(|| written.parse().ok())
        .flatten()
}

/// La date d'un événement de ce mois : ce qui est illisible ou incohérent est laissé de côté, la
/// fin d'abord (le jour, puis l'année, tiennent aussi ou sont ignorés).
fn read_date(content: &str, month: Month) -> EventDate {
    let year = number(content, YEAR_KEY)
        .and_then(|year| i32::try_from(year).ok())
        .filter(|year| (MIN_YEAR..=MAX_YEAR).contains(year));
    let day = number(content, DAY_KEY);
    let plain = EventDate::new(month, day, year, None)
        .or_else(|_| EventDate::new(month, None, year, None))
        .unwrap_or_else(|_| unreachable!("un mois seul est une date"));
    read_end(content, month)
        .and_then(|end| EventDate::new(month, plain.day(), plain.year(), Some(end)).ok())
        .unwrap_or(plain)
}

/// La fin que dit l'en-tête : un jour de fin, dans le mois de fin ou, sans mois de fin, dans le
/// mois du début. Rien si l'un des deux est illisible, ou sans jour de fin.
fn read_end(content: &str, month: Month) -> Option<EventEnd> {
    let day = number(content, END_DAY_KEY)?;
    let end_month = if header::scalar(content, END_MONTH_KEY).is_some() {
        number(content, END_MONTH_KEY).and_then(Month::new)?
    } else {
        month
    };
    Some(EventEnd {
        day,
        month: end_month,
    })
}

#[cfg(test)]
#[path = "event_tests.rs"]
mod tests;
