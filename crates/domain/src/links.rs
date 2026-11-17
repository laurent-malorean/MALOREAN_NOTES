//! Liens entre notes : `[[titre]]` écrit dans une note désigne la note qui porte ce titre,
//! sans tenir compte des majuscules, des accents ni des espaces en trop.

use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

const OPENING: &str = "[[";
const CLOSING: &str = "]]";
/// Sépare le titre visé du texte montré : `[[titre|texte]]`.
const SHOWN_TEXT: char = '|';

/// Les titres visés par les liens du texte, dans l'ordre où ils apparaissent.
///
/// `[[titre|texte]]` vise `titre`. Un lien vide ou coupé par un retour à la ligne n'en est pas un.
#[must_use]
pub fn linked_titles(content: &str) -> Vec<&str> {
    let mut titles = Vec::new();
    let mut rest = content;
    while let Some(end) = rest.find(CLOSING) {
        let before = &rest[..end];
        if let Some(start) = before.rfind(OPENING) {
            let inside = &before[start + OPENING.len()..];
            let target = inside.split(SHOWN_TEXT).next().unwrap_or_default().trim();
            if !target.is_empty() && !inside.contains('\n') {
                titles.push(target);
            }
        }
        rest = &rest[end + CLOSING.len()..];
    }
    titles
}

/// Vrai si les deux titres désignent la même note : mêmes mots, majuscules et accents ignorés.
#[must_use]
pub fn same_title(a: &str, b: &str) -> bool {
    folded(a) == folded(b)
}

/// Vrai si le texte contient un lien vers la note de titre `title`.
#[must_use]
pub fn links_to(content: &str, title: &str) -> bool {
    linked_titles(content).iter().any(|t| same_title(t, title))
}

fn folded(title: &str) -> Vec<String> {
    title
        .split_whitespace()
        .map(|word| {
            word.chars()
                .flat_map(char::to_lowercase)
                .nfd()
                .filter(|c| !is_combining_mark(*c))
                .collect()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn every_link_of_the_text_is_found_in_order() {
        assert_eq!(
            linked_titles("Voir [[Courses]] et [[Recette de crêpes]].\n[[Agenda]]"),
            ["Courses", "Recette de crêpes", "Agenda"]
        );
    }

    #[test]
    fn a_link_with_a_shown_text_targets_its_title() {
        assert_eq!(linked_titles("[[Courses|la liste]]"), ["Courses"]);
    }

    #[test]
    fn spaces_around_the_title_are_ignored() {
        assert_eq!(linked_titles("[[  Courses  ]]"), ["Courses"]);
    }

    #[test]
    fn empty_or_broken_links_are_not_links() {
        assert!(linked_titles("[[]] [[ ]] [[|texte]] [[a\nb]] [[sans fin").is_empty());
        assert!(linked_titles("fin]] sans début").is_empty());
    }

    #[test]
    fn the_innermost_opening_starts_the_link() {
        assert_eq!(linked_titles("[[a [[Courses]]"), ["Courses"]);
        assert_eq!(linked_titles("[[Un]]]] [[Deux]]"), ["Un", "Deux"]);
    }

    #[test]
    fn titles_match_whatever_the_case_accents_and_spacing() {
        assert!(same_title("Recette de crêpes", "recette  DE crepes "));
        assert!(!same_title("Recette de crêpes", "Recette de galettes"));
        assert!(!same_title("Recettes", "Recette"));
    }

    #[test]
    fn a_text_links_to_a_note_only_through_a_link() {
        assert!(links_to("voir [[courses]]", "Courses"));
        assert!(!links_to("voir Courses", "Courses"));
        assert!(!links_to("voir [[Agenda]]", "Courses"));
    }

    proptest! {
        #[test]
        fn any_title_written_in_a_link_is_found(title in "[a-zA-Zéè]{1,8}( [a-zA-Zéè]{1,8}){0,3}") {
            let text = format!("avant [[{title}]] après");
            prop_assert_eq!(linked_titles(&text), [title.as_str()]);
            prop_assert!(links_to(&text, &title.to_uppercase()));
        }
    }
}
