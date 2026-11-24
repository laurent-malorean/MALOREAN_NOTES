//! La fusion de deux versions d'un canvas parties de la même version de départ (fiche 0052) : ce qu'on
//! enregistre quand le fichier a changé ailleurs depuis qu'on l'a lu. Carte par carte et flèche par
//! flèche, reconnues à leur identifiant : ce qui n'a changé que d'un côté est repris, ce qui a changé des
//! deux côtés prend la version de celui qui enregistre.

use crate::canvas::Canvas;

/// Ce qu'on fusionne : un élément qui a un identifiant.
trait Identified: Clone + PartialEq {
    fn id(&self) -> &str;
}

impl Identified for crate::canvas::CanvasCard {
    fn id(&self) -> &str {
        &self.id
    }
}

impl Identified for crate::canvas::CanvasArrow {
    fn id(&self) -> &str {
        &self.id
    }
}

fn find<'a, T: Identified>(items: &'a [T], id: &str) -> Option<&'a T> {
    items.iter().find(|item| item.id() == id)
}

/// Le sort d'un élément selon la version de départ `base`, la sienne `mine` et celle du fichier
/// `theirs`.
fn decided<T: Identified>(base: Option<&T>, mine: Option<&T>, theirs: Option<&T>) -> Option<T> {
    match (mine, theirs) {
        (Some(m), Some(t)) => Some(if base == Some(m) {
            t.clone()
        } else {
            m.clone()
        }),
        (Some(m), None) => (base != Some(m)).then(|| m.clone()),
        (None, Some(t)) => (base != Some(t)).then(|| t.clone()),
        (None, None) => None,
    }
}

fn merge_items<T: Identified>(base: &[T], mine: &[T], theirs: &[T]) -> Vec<T> {
    let at = |id: &str| decided(find(base, id), find(mine, id), find(theirs, id));
    let mut merged: Vec<T> = mine.iter().filter_map(|item| at(item.id())).collect();
    merged.extend(
        theirs
            .iter()
            .filter(|item| find(mine, item.id()).is_none())
            .filter_map(|item| at(item.id())),
    );
    merged
}

impl Canvas {
    /// Fusionne `mine` (ce que l'utilisateur a fait depuis `base`) avec `theirs` (ce que le fichier
    /// est devenu depuis `base`). Une flèche dont une carte a disparu disparaît aussi.
    #[must_use]
    pub fn merged(base: &Self, mine: &Self, theirs: &Self) -> Self {
        let cards = merge_items(&base.cards, &mine.cards, &theirs.cards);
        let mut arrows = merge_items(&base.arrows, &mine.arrows, &theirs.arrows);
        arrows.retain(|arrow| {
            [&arrow.from, &arrow.to]
                .iter()
                .all(|end| cards.iter().any(|card| &card.id == *end))
        });
        let extra = if mine.extra == base.extra {
            theirs.extra.clone()
        } else {
            mine.extra.clone()
        };
        Self {
            cards,
            arrows,
            extra,
        }
    }
}

#[cfg(test)]
#[path = "canvas_merge_tests.rs"]
mod tests;
