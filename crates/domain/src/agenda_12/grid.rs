//! La grille d'un agenda 12 (spécification `doc/specs/agenda-12.md` § 5) : douze cases, une par
//! mois, calculées à la lecture et jamais écrites ; l'ordre dans une case, le filtre par étiquette,
//! la liste des étiquettes et l'ordre des archives.

use std::cmp::Ordering;

use super::event::Agenda12Event;
use super::month::Month;
use crate::NotePath;
use crate::crm::folded;
use crate::tag::{same_tag, sort_key};

/// Un événement lu avec le chemin de sa note.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlacedEvent {
    /// Le chemin de la note de l'événement.
    pub path: NotePath,
    /// L'événement lu.
    pub event: Agenda12Event,
}

/// Une case : un mois et ses événements dans l'ordre de la case.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cell {
    /// Le mois de la case.
    pub month: Month,
    /// Ses événements, dans l'ordre de la case (§ 5.2).
    pub events: Vec<PlacedEvent>,
}

/// L'ordre de deux événements d'une même case : par année croissante (ceux sans année en dernier),
/// puis par jour croissant (ceux sans jour après ceux qui en ont un), puis par titre sans compter
/// les majuscules ni les accents ; à égalité, par chemin.
#[must_use]
pub fn cell_order(a: &PlacedEvent, b: &PlacedEvent) -> Ordering {
    let (da, db) = (&a.event.date, &b.event.date);
    last_when_absent(da.year(), db.year())
        .then_with(|| last_when_absent(da.day(), db.day()))
        .then_with(|| folded(&a.event.title).cmp(&folded(&b.event.title)))
        .then_with(|| a.path.cmp(&b.path))
}

/// L'ordre croissant de deux valeurs facultatives, la valeur absente après toutes les autres.
fn last_when_absent<T: Ord>(a: Option<T>, b: Option<T>) -> Ordering {
    match (a, b) {
        (Some(a), Some(b)) => a.cmp(&b),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
}

/// Les douze cases de janvier à décembre. Avec `tag`, seuls les événements qui portent cette
/// étiquette (majuscules et accents ignorés) sont montrés ; sans filtre, tous.
#[must_use]
pub fn grid(events: Vec<PlacedEvent>, tag: Option<&str>) -> Vec<Cell> {
    Month::ALL
        .into_iter()
        .map(|month| {
            let mut inside: Vec<PlacedEvent> = events
                .iter()
                .filter(|placed| placed.event.date.month() == month)
                .filter(|placed| tag.is_none_or(|tag| carries(&placed.event, tag)))
                .cloned()
                .collect();
            inside.sort_by(cell_order);
            Cell {
                month,
                events: inside,
            }
        })
        .collect()
}

fn carries(event: &Agenda12Event, tag: &str) -> bool {
    event.tags.iter().any(|own| same_tag(own, tag))
}

/// Les étiquettes portées par les événements, chacune une fois (majuscules et accents ignorés, la
/// première écriture rencontrée gardée), par ordre alphabétique sans compter les majuscules ni les
/// accents : la liste du filtre.
#[must_use]
pub fn event_tags(events: &[PlacedEvent]) -> Vec<String> {
    let mut found: Vec<String> = Vec::new();
    for tag in events.iter().flat_map(|placed| &placed.event.tags) {
        if !found.iter().any(|known| same_tag(known, tag)) {
            found.push(tag.clone());
        }
    }
    found.sort_by_key(|tag| (sort_key(tag), tag.clone()));
    found
}

/// L'ordre des archives : du plus récemment clos au plus ancien ; un événement qui n'a pas retenu
/// son jour de clôture vient en dernier ; à égalité, par titre puis par chemin.
#[must_use]
pub fn archives_order(events: Vec<PlacedEvent>) -> Vec<PlacedEvent> {
    let mut events = events;
    events.sort_by(|a, b| {
        last_when_absent(
            a.event
                .closed_on
                .map(|day| std::cmp::Reverse(day.days_since_epoch())),
            b.event
                .closed_on
                .map(|day| std::cmp::Reverse(day.days_since_epoch())),
        )
        .then_with(|| folded(&a.event.title).cmp(&folded(&b.event.title)))
        .then_with(|| a.path.cmp(&b.path))
    });
    events
}

#[cfg(test)]
#[path = "grid_tests.rs"]
mod tests;
