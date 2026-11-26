//! La lecture d'un canvas par une IA (fiche 0079) : la taille qu'elle ne dépasse pas. Elle rend
//! les cartes et les flèches en données ; ce qui dépasse est coupé, et la coupure est toujours dite.

/// Combien de cartes au plus une lecture rend.
pub const MAX_READ_CANVAS_CARDS: usize = 150;
/// Combien de flèches au plus une lecture rend.
pub const MAX_READ_CANVAS_ARROWS: usize = 150;
/// Combien de caractères de texte de cartes (tous les textes ensemble) au plus une lecture rend :
/// avec les cartes et les flèches, de quoi tenir sous la limite de réponse d'un outil de Claude Code.
pub const MAX_READ_CANVAS_TEXT_CHARACTERS: usize = 20_000;

/// Le début de `text` qui tient dans `room` caractères, et si le reste est coupé.
#[must_use]
pub fn text_within(text: &str, room: usize) -> (&str, bool) {
    match text.char_indices().nth(room) {
        Some((end, _)) => (&text[..end], true),
        None => (text, false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_limits_are_the_ones_of_the_decision() {
        assert_eq!(MAX_READ_CANVAS_CARDS, 150);
        assert_eq!(MAX_READ_CANVAS_ARROWS, 150);
        assert_eq!(MAX_READ_CANVAS_TEXT_CHARACTERS, 20_000);
    }

    #[test]
    fn a_text_that_fits_is_whole_and_a_longer_one_is_cut_on_a_character() {
        assert_eq!(text_within("abc", 3), ("abc", false));
        assert_eq!(text_within("abc", 4), ("abc", false));
        assert_eq!(text_within("abc", 2), ("ab", true));
        assert_eq!(text_within("été", 2), ("ét", true));
        assert_eq!(text_within("abc", 0), ("", true));
        assert_eq!(text_within("", 0), ("", false));
    }
}
