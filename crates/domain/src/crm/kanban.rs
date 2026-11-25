//! Le Kanban (spécification § 7.1) : une colonne par statut, les cartes dans leur ordre, et la
//! place d'une carte lâchée entre deux autres.

use std::cmp::Ordering;
use std::num::NonZeroU32;

use super::action::Action;
use super::action_view::Urgency;
use super::day::Day;
use super::reference::Reference;
use super::stage::{Stages, Status};

/// Combien de cartes montre une colonne terminée, et combien de plus à chaque clic sur « Afficher
/// 10 de plus ».
pub const CLOSED_PAGE: usize = 10;

/// Une colonne du Kanban : un statut et ses cartes, toutes, dans l'ordre où elles se montrent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KanbanColumn<'a> {
    /// Le statut de la colonne.
    pub status: Status,
    /// Ses cartes : pour une colonne ouverte, les classées (par rang) puis les autres par date, la
    /// plus ancienne d'abord ; pour une colonne terminée, de la plus récente à la plus ancienne.
    pub cards: Vec<&'a Action>,
}

/// Ce qu'une colonne montre : ses premières cartes et ce qui reste à afficher.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Shown<'a, 'b> {
    /// Les cartes montrées.
    pub cards: &'b [&'a Action],
    /// Le nombre de cartes cachées, dit par « Afficher 10 de plus (N restantes) » ; 0 sans ce pied.
    pub remaining: usize,
}

impl<'a> KanbanColumn<'a> {
    /// Le nombre de cartes de la colonne, montré dans son en-tête.
    #[must_use]
    pub fn count(&self) -> usize {
        self.cards.len()
    }

    /// Le nombre de cartes en retard le jour `today`, montré en rouge dans l'en-tête s'il n'est pas
    /// nul.
    #[must_use]
    pub fn late_count(&self, today: Day) -> usize {
        self.cards
            .iter()
            .filter(|card| matches!(card.urgency(today), Some(Urgency::Late(_))))
            .count()
    }

    /// Ce que la colonne montre quand on a cliqué `more` fois sur « Afficher 10 de plus » : une
    /// colonne ouverte montre toutes ses cartes ; une colonne terminée montre les 10 plus récentes,
    /// puis 10 de plus à chaque clic.
    #[must_use]
    pub fn shown(&self, more: usize) -> Shown<'a, '_> {
        if self.status.is_open() {
            return Shown {
                cards: &self.cards,
                remaining: 0,
            };
        }
        let limit = CLOSED_PAGE.saturating_mul(more.saturating_add(1));
        let count = self.cards.len().min(limit);
        Shown {
            cards: &self.cards[..count],
            remaining: self.cards.len() - count,
        }
    }
}

/// Les colonnes d'un Kanban dont le CRM a ces `stages` : « TODO », les étapes, « Done », « Cancel »,
/// chacune avec les actions de son statut. Une action dont l'étape n'existe plus est rangée dans
/// « TODO ».
#[must_use]
pub fn columns<'a>(stages: &Stages, actions: &'a [Action]) -> Vec<KanbanColumn<'a>> {
    let mut columns: Vec<KanbanColumn<'a>> = Status::columns(stages)
        .into_iter()
        .map(|status| KanbanColumn {
            status,
            cards: Vec::new(),
        })
        .collect();
    for action in actions {
        let at = columns
            .iter()
            .position(|column| column.status == action.status)
            .unwrap_or(0);
        columns[at].cards.push(action);
    }
    for column in &mut columns {
        if column.status.is_open() {
            column.cards.sort_by(|a, b| open_order(a, b));
        } else {
            column.cards.sort_by(|a, b| closed_order(a, b));
        }
    }
    columns
}

/// Les cartes classées d'abord, par rang ; puis les autres par date, la plus ancienne d'abord, une
/// carte sans date à la fin ; à égalité, par nom de fichier (l'ordre de création).
fn open_order(a: &Action, b: &Action) -> Ordering {
    match (a.rank, b.rank) {
        (Some(x), Some(y)) => x.cmp(&y),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => oldest_first(a.date, b.date),
    }
    .then_with(|| a.name.cmp(&b.name))
}

/// De la plus récente à la plus ancienne, une carte sans date à la fin ; à égalité, la dernière
/// créée d'abord.
fn closed_order(a: &Action, b: &Action) -> Ordering {
    match (a.date, b.date) {
        (Some(x), Some(y)) => y.cmp(&x),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
    .then_with(|| b.name.cmp(&a.name))
}

fn oldest_first(a: Option<Day>, b: Option<Day>) -> Ordering {
    match (a, b) {
        (Some(x), Some(y)) => x.cmp(&y),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => Ordering::Equal,
    }
}

/// Les rangs à écrire quand la carte `moved` est lâchée dans une colonne ouverte dont les cartes,
/// dans leur ordre, sont `cards` : juste avant la carte `before`, ou tout en bas si `before` est
/// vide ou n'est pas dans la colonne. Chaque carte de la colonne prend son numéro de place, à partir
/// de 1 ; seules celles dont le rang change sont rendues. Une carte qui vient d'une autre colonne
/// n'a plus de rang (son statut vient de changer). Une carte lâchée sur elle-même ne bouge pas.
#[must_use]
pub fn placed_ranks(
    cards: &[&Action],
    moved: &Reference,
    before: Option<&Reference>,
) -> Vec<(Reference, NonZeroU32)> {
    if before == Some(moved) {
        return Vec::new();
    }
    let mut order: Vec<&Reference> = cards
        .iter()
        .map(|card| &card.name)
        .filter(|name| *name != moved)
        .collect();
    let at = before
        .and_then(|before| order.iter().position(|name| *name == before))
        .unwrap_or(order.len());
    order.insert(at, moved);
    order
        .into_iter()
        .zip(1_u32..)
        .filter_map(|(name, place)| {
            let rank = NonZeroU32::new(place)?;
            let current = cards
                .iter()
                .find(|card| card.name == *name)
                .and_then(|card| card.rank);
            (current != Some(rank)).then(|| (name.clone(), rank))
        })
        .collect()
}

#[cfg(test)]
#[path = "kanban_tests.rs"]
mod tests;
