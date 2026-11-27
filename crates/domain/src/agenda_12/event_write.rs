//! Écrire un événement (format `doc/format/agenda-12.md` §§ 4.2, 6 et 7) : un geste ne change que la
//! clé touchée, à sa place ; une clé absente est ajoutée après les autres ; une valeur vidée retire
//! la clé ; le titre, le texte et les clés inconnues restent identiques octet pour octet.

use std::fmt;

use super::country::Country;
use super::date::EventEnd;
use super::event::{
    Agenda12Event, CITY_KEY, CLOSED_KEY, COUNTRY_KEY, DAY_KEY, END_DAY_KEY, END_MONTH_KEY,
    EVENT_TYPE, MONTH_KEY, YEAR_KEY,
};
use super::month::Month;
use crate::crm::Day;
use crate::crm::header::{self, Style};
use crate::tag::{retagged, written_tags};
use crate::title::retitled;

/// Pourquoi un titre est refusé.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TitleError {
    /// Le titre est vide.
    Empty,
    /// Le titre tient sur plusieurs lignes.
    NotOneLine,
}

impl fmt::Display for TitleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Empty => "Le titre est vide.",
            Self::NotOneLine => "Le titre tient sur une seule ligne.",
        })
    }
}

impl std::error::Error for TitleError {}

/// Le titre que dit `text`, sans espaces autour.
///
/// # Errors
///
/// [`TitleError::Empty`] s'il est vide, [`TitleError::NotOneLine`] s'il tient sur plusieurs lignes.
pub fn clean_title(text: &str) -> Result<String, TitleError> {
    let text = text.trim();
    if text.is_empty() {
        Err(TitleError::Empty)
    } else if text.contains(['\n', '\r']) {
        Err(TitleError::NotOneLine)
    } else {
        Ok(text.to_owned())
    }
}

/// Le texte d'un événement neuf : l'en-tête avec son type et son mois, et le titre.
#[must_use]
pub fn new_event_content(title: &str, month: Month) -> String {
    format!(
        "---\ntype: {EVENT_TYPE}\n{MONTH_KEY}: {}\n---\n# {title}\n",
        month.number()
    )
}

/// Le texte de l'événement avec ce titre : la ligne de son titre `#` remplacée, le nom de fichier
/// ne changeant jamais.
#[must_use]
pub fn with_title(content: &str, title: &str) -> String {
    retitled(content, title)
}

/// Le texte avec ce mois de début.
#[must_use]
pub fn with_month(content: &str, month: Month) -> String {
    number_line(content, MONTH_KEY, Some(month.number()))
}

/// Le texte avec ce jour de début ; la clé est retirée sans jour.
#[must_use]
pub fn with_day(content: &str, day: Option<u32>) -> String {
    number_line(content, DAY_KEY, day)
}

/// Le texte avec cette année de début ; la clé est retirée sans année.
#[must_use]
pub fn with_year(content: &str, year: Option<i32>) -> String {
    number_line(content, YEAR_KEY, year)
}

/// Le texte avec cette fin, pour un événement qui commence en `start` : le jour de fin, et le mois
/// de fin seulement s'il diffère du mois du début. Sans fin, les deux clés sont retirées.
#[must_use]
pub fn with_end(content: &str, start: Month, end: Option<EventEnd>) -> String {
    let with_day = number_line(content, END_DAY_KEY, end.map(|end| end.day));
    let month = end.map(|end| end.month).filter(|month| *month != start);
    number_line(&with_day, END_MONTH_KEY, month.map(Month::number))
}

/// Le texte avec ce pays, écrit par son code en majuscules ; la clé est retirée sans pays.
#[must_use]
pub fn with_country(content: &str, country: Option<Country>) -> String {
    header::with_scalar(
        content,
        COUNTRY_KEY,
        country.map(Country::code),
        Style::Line,
    )
}

/// Le texte avec cette ville ; la clé est retirée si elle est vide.
#[must_use]
pub fn with_city(content: &str, city: Option<&str>) -> String {
    header::with_scalar(content, CITY_KEY, city, Style::Line)
}

/// Le texte avec ces étiquettes, nettoyées comme pour toute note (sans doublon, la casse ne compte
/// pas) ; sans étiquette, la propriété est retirée.
#[must_use]
pub fn with_tags(content: &str, tags: &[String]) -> String {
    retagged(content, &written_tags(tags))
}

/// Le texte de l'événement clos le `day` : la clé `clos-le` écrite, le reste inchangé.
#[must_use]
pub fn closed_on(content: &str, day: Day) -> String {
    header::with_scalar(content, CLOSED_KEY, Some(&day.to_string()), Style::Line)
}

/// Le texte de l'événement rouvert : la clé `clos-le` retirée.
#[must_use]
pub fn reopened(content: &str) -> String {
    header::with_scalar(content, CLOSED_KEY, None, Style::Line)
}

/// Le texte de l'événement qui prépare le suivant d'un événement clos : son titre, son mois, son
/// pays, sa ville et ses étiquettes ; ni jour, ni année, ni fin, ni texte.
#[must_use]
pub fn successor_content(event: &Agenda12Event) -> String {
    let fresh = new_event_content(&event.title, event.date.month());
    let with_country = with_country(&fresh, event.country);
    let with_city = with_city(&with_country, event.city.as_deref());
    with_tags(&with_city, &event.tags)
}

/// Le texte avec ce nombre pour la clé `key`, nu ; la clé est retirée sans nombre.
fn number_line(content: &str, key: &str, number: Option<impl ToString>) -> String {
    header::with_scalar(
        content,
        key,
        number.map(|number| number.to_string()).as_deref(),
        Style::Bare,
    )
}

#[cfg(test)]
#[path = "event_write_tests.rs"]
mod tests;
