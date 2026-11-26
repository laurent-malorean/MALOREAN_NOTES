//! La taille de la lecture d'un CRM par une IA (fiche 0081) : chaque partie (actions, personnes,
//! entreprises, projets) a sa place en caractères, mesurée sur ce qui est écrit ; les premiers
//! éléments sont rendus tant qu'ils tiennent, jamais de coupure silencieuse.

use domain::canvas_reading::text_within;
use serde::Serialize;

/// Combien de caractères écrits les actions d'une lecture occupent au plus (toutes les colonnes
/// ensemble, dans leur ordre).
pub(super) const MAX_READ_CRM_ACTION_CHARACTERS: usize = 34_000;
/// Combien de caractères écrits les personnes d'une lecture occupent au plus.
pub(super) const MAX_READ_CRM_PERSON_CHARACTERS: usize = 16_000;
/// Combien de caractères écrits les entreprises d'une lecture occupent au plus.
pub(super) const MAX_READ_CRM_COMPANY_CHARACTERS: usize = 10_000;
/// Combien de caractères écrits les projets d'une lecture occupent au plus.
pub(super) const MAX_READ_CRM_PROJECT_CHARACTERS: usize = 6_000;

/// La place qui reste pour les textes libres d'un élément (description, éléments de listes à
/// cocher, commentaires, notes libres) : un texte plus long est coupé.
pub(super) struct Room {
    left: usize,
}

impl Room {
    /// La place de `left` caractères.
    pub(super) const fn of(left: usize) -> Self {
        Self { left }
    }

    /// Le début de `text` qui tient encore ; `cut` devient vrai si la fin est coupée.
    pub(super) fn take(&mut self, text: &str, cut: &mut bool) -> String {
        let (shown, was_cut) = text_within(text, self.left);
        self.left -= shown.chars().count();
        *cut |= was_cut;
        shown.to_owned()
    }
}

/// Une partie de la lecture : sa place, ce qu'elle a rendu, et ce qu'elle a vu passer.
pub(super) struct Section {
    left: usize,
    given: usize,
    seen: usize,
    full: bool,
}

impl Section {
    /// Une partie de `characters` caractères écrits.
    pub(super) const fn of(characters: usize) -> Self {
        Self {
            left: characters,
            given: 0,
            seen: 0,
            full: false,
        }
    }

    /// L'élément que `make` fabrique, s'il tient dans ce qui reste : les textes libres n'y
    /// dépassent pas ce qui reste. Le premier élément est toujours rendu (coupé s'il le faut) : une
    /// lecture ne rend jamais rien quand il y a quelque chose à lire. Après un élément qui ne tient
    /// pas, plus aucun n'est rendu : l'ordre est celui de l'écran.
    pub(super) fn add<T: Serialize>(&mut self, make: impl FnOnce(&mut Room) -> T) -> Option<T> {
        self.seen += 1;
        if self.full {
            return None;
        }
        let item = make(&mut Room::of(self.left));
        let size = serde_json::to_string(&item).map_or(0, |written| written.chars().count());
        if size > self.left && self.given > 0 {
            self.full = true;
            return None;
        }
        self.left = self.left.saturating_sub(size);
        self.given += 1;
        Some(item)
    }

    /// Combien d'éléments la partie a rendus.
    pub(super) const fn given(&self) -> usize {
        self.given
    }

    /// Combien d'éléments ont été présentés à la partie.
    pub(super) const fn seen(&self) -> usize {
        self.seen
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    /// Un élément qui s'écrit sur `characters` caractères.
    fn item(characters: usize) -> serde_json::Value {
        json!("a".repeat(characters - 2))
    }

    #[test]
    fn items_are_given_while_they_fit_and_the_first_one_that_does_not_closes_the_part() {
        let mut part = Section::of(30);
        assert!(part.add(|_| item(10)).is_some());
        assert!(part.add(|_| item(10)).is_some());
        // Il reste 10 : un élément de 11 caractères ne tient pas, un de 10 tiendrait.
        assert!(part.add(|_| item(11)).is_none());
        assert!(part.add(|_| item(1 + 1)).is_none());
        assert_eq!((part.given(), part.seen()), (2, 4));
    }

    #[test]
    fn an_item_that_exactly_fills_what_is_left_is_given() {
        let mut part = Section::of(20);
        assert!(part.add(|_| item(10)).is_some());
        assert!(part.add(|_| item(10)).is_some());
        assert!(part.add(|_| item(2)).is_none());
        assert_eq!(part.given(), 2);
    }

    #[test]
    fn the_first_item_is_always_given_even_when_it_is_larger_than_the_part() {
        let mut part = Section::of(10);
        assert!(part.add(|_| item(50)).is_some());
        assert!(part.add(|_| item(2)).is_none());
        assert_eq!((part.given(), part.seen()), (1, 2));
    }

    #[test]
    fn the_texts_of_an_item_have_the_room_that_is_left_and_an_item_they_overflow_is_left_out() {
        let mut part = Section::of(100);
        let mut cut = false;
        let first = part
            .add(|room| room.take(&"é".repeat(60), &mut cut))
            .unwrap();
        assert_eq!(first.chars().count(), 60);
        assert!(!cut);
        // 62 caractères écrits ont été pris : il en reste 38, et le texte suivant, coupé à 38,
        // s'écrit sur 40 : l'élément ne tient pas.
        let second = part.add(|room| room.take(&"é".repeat(60), &mut cut));
        assert_eq!(second, None);
        assert!(cut);
        assert_eq!((part.given(), part.seen()), (1, 2));
    }

    #[test]
    fn the_texts_of_the_first_item_have_the_whole_part() {
        let mut part = Section::of(100);
        let mut cut = false;
        let first = part
            .add(|room| room.take(&"é".repeat(150), &mut cut))
            .unwrap();
        assert_eq!(first.chars().count(), 100);
        assert!(cut);
    }

    #[test]
    fn a_room_keeps_what_is_left_after_each_text() {
        let mut room = Room::of(5);
        let mut cut = false;
        assert_eq!(room.take("abc", &mut cut), "abc");
        assert!(!cut);
        assert_eq!(room.take("defg", &mut cut), "de");
        assert!(cut);
        assert_eq!(room.take("h", &mut cut), "");
    }

    #[test]
    fn the_limits_are_the_ones_of_the_decision() {
        assert_eq!(MAX_READ_CRM_ACTION_CHARACTERS, 34_000);
        assert_eq!(MAX_READ_CRM_PERSON_CHARACTERS, 16_000);
        assert_eq!(MAX_READ_CRM_COMPANY_CHARACTERS, 10_000);
        assert_eq!(MAX_READ_CRM_PROJECT_CHARACTERS, 6_000);
    }
}
