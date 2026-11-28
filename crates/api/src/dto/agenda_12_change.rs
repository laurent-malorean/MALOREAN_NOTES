//! Ce que l'interface demande à un agenda 12 (fiche 0104) : mois, pays, colonnes, vue, gestes sur un
//! événement. Tout est converti à la frontière, une fois, en types de l'application.

use application::AppError;
use application::use_cases::{Closing, EventChange};
use domain::agenda_12::{Columns, Country, DateChange, EventEnd, Layout, Month};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::Agenda12EndItem;

/// Le mois de ce numéro.
pub(crate) fn month(number: u32) -> Result<Month, AppError> {
    Month::new(number).ok_or(AppError::UnknownMonth(number))
}

/// Le pays de ce code.
pub(crate) fn country(code: &str) -> Result<Country, AppError> {
    Country::from_code(code).ok_or_else(|| AppError::UnknownCountry(code.to_owned()))
}

/// Le nombre de colonnes de la grille.
pub(crate) fn columns(count: u32) -> Result<Columns, AppError> {
    Columns::new(count).ok_or(AppError::UnknownColumns(count))
}

impl TryFrom<Agenda12EndItem> for EventEnd {
    type Error = AppError;

    fn try_from(item: Agenda12EndItem) -> Result<Self, AppError> {
        Ok(Self {
            day: item.day,
            month: month(item.month)?,
        })
    }
}

/// Un geste sur un événement : un seul champ change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum Agenda12EventChangeItem {
    /// Son titre.
    Title {
        /// Le nouveau titre.
        title: String,
    },
    /// Son mois de début : sa case.
    Month {
        /// Le mois, de 1 à 12.
        month: u32,
    },
    /// Son jour de début ; `null` pour l'effacer (refusé s'il a une fin).
    Day {
        /// Le jour.
        day: Option<u32>,
    },
    /// Son année de début ; `null` pour l'effacer.
    Year {
        /// L'année.
        year: Option<i32>,
    },
    /// Sa fin ; `null` pour l'effacer.
    End {
        /// La fin.
        end: Option<Agenda12EndItem>,
    },
    /// Son pays, par son code ; `null` pour l'effacer.
    Country {
        /// Le code ISO 3166-1 sur deux lettres.
        country: Option<String>,
    },
    /// Sa ville ; `null` ou vide pour l'effacer.
    City {
        /// La ville.
        city: Option<String>,
    },
    /// Ses étiquettes, toutes ; vide pour les retirer.
    Tags {
        /// Les étiquettes.
        tags: Vec<String>,
    },
}

impl TryFrom<Agenda12EventChangeItem> for EventChange {
    type Error = AppError;

    fn try_from(item: Agenda12EventChangeItem) -> Result<Self, AppError> {
        Ok(match item {
            Agenda12EventChangeItem::Title { title } => Self::Title(title),
            Agenda12EventChangeItem::Month { month: number } => {
                Self::Date(DateChange::Month(month(number)?))
            }
            Agenda12EventChangeItem::Day { day } => Self::Date(DateChange::Day(day)),
            Agenda12EventChangeItem::Year { year } => Self::Date(DateChange::Year(year)),
            Agenda12EventChangeItem::End { end } => {
                Self::Date(DateChange::End(end.map(EventEnd::try_from).transpose()?))
            }
            Agenda12EventChangeItem::Country { country: code } => {
                Self::Country(code.as_deref().map(country).transpose()?)
            }
            Agenda12EventChangeItem::City { city } => Self::City(city),
            Agenda12EventChangeItem::Tags { tags } => Self::Tags(tags),
        })
    }
}

/// Ce que devient l'événement qu'on clôt.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Agenda12ClosingItem {
    /// « Clore » : sans copie.
    Alone,
    /// « Clore et préparer le suivant » : avec sa copie.
    WithSuccessor,
}

impl From<Agenda12ClosingItem> for Closing {
    fn from(item: Agenda12ClosingItem) -> Self {
        match item {
            Agenda12ClosingItem::Alone => Self::Alone,
            Agenda12ClosingItem::WithSuccessor => Self::WithSuccessor,
        }
    }
}

/// La vue d'un agenda 12 : la grille ou la liste.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum Agenda12LayoutItem {
    /// La grille de 12 cases.
    Grid,
    /// La liste, groupée par mois.
    List,
}

impl From<Agenda12LayoutItem> for Layout {
    fn from(item: Agenda12LayoutItem) -> Self {
        match item {
            Agenda12LayoutItem::Grid => Self::Grid,
            Agenda12LayoutItem::List => Self::List,
        }
    }
}

impl From<Layout> for Agenda12LayoutItem {
    fn from(layout: Layout) -> Self {
        match layout {
            Layout::Grid => Self::Grid,
            Layout::List => Self::List,
        }
    }
}

#[cfg(test)]
#[path = "agenda_12_change_tests.rs"]
mod tests;
