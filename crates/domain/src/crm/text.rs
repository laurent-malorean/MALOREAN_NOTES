//! Comparer des textes comme le CRM : sans majuscules, sans accents, et pour les noms sans
//! ponctuation.

use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

/// Le texte sans majuscules ni accents, ses espaces ramenés à une seule et sans espaces autour :
/// ce qui compte pour qu'un statut, une étape ou un canal soit le même qu'un autre.
pub(crate) fn folded(text: &str) -> String {
    let plain: String = text
        .chars()
        .flat_map(char::to_lowercase)
        .nfd()
        .filter(|c| !is_combining_mark(*c))
        .collect();
    plain.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Le nom sans majuscules, sans accents et sans ponctuation : ce qui compte pour que deux
/// entreprises, deux personnes ou deux projets aient le même nom.
pub(crate) fn name_key(name: &str) -> String {
    let without_punctuation: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();
    folded(&without_punctuation)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folding_ignores_case_accents_and_spacing() {
        assert_eq!(folded("  Réseau   Social "), "reseau social");
        assert_eq!(folded("WaitingFor"), "waitingfor");
        assert_eq!(folded("É\u{301}té"), "ete");
        assert_eq!(folded("e-mail"), "e-mail");
        assert_eq!(folded(""), "");
    }

    #[test]
    fn a_name_key_ignores_punctuation_too() {
        assert_eq!(name_key("Acme, S.A."), "acme sa");
        assert_eq!(name_key("L'Atelier"), "latelier");
        assert_eq!(name_key("ÉCOLE"), "ecole");
        assert_eq!(name_key("Jean-Pierre  Dupont"), "jeanpierre dupont");
        assert_eq!(name_key("N°1 !"), "n1");
    }
}
