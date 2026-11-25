//! La référence : la façon dont une fiche en désigne une autre, `[[nom-de-fichier]]`, sans
//! dossier ni extension. Une action désigne de la même façon la note qu'elle lie, par son titre.

use std::fmt;

const OPENING: &str = "[[";
const CLOSING: &str = "]]";
/// Sépare la cible du texte montré : `[[cible|texte]]`.
const SHOWN_TEXT: char = '|';

/// Ce qu'une référence désigne : le nom de fichier d'une fiche, ou le titre d'une note.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Reference(String);

impl Reference {
    /// La référence à `target`, sans espaces autour ; rien si la cible est vide ou contient un
    /// crochet, une barre `|` ou un retour à la ligne, qui casseraient le lien.
    #[must_use]
    pub fn to(target: &str) -> Option<Self> {
        let target = target.trim();
        let valid = !target.is_empty() && !target.contains(['[', ']', SHOWN_TEXT, '\n', '\r']);
        valid.then(|| Self(target.to_owned()))
    }

    /// La référence écrite `[[cible]]` (ou `[[cible|texte]]`, dont seule la cible compte) : le
    /// texte doit en être entièrement fait, espaces autour permis.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        let inside = text.trim().strip_prefix(OPENING)?.strip_suffix(CLOSING)?;
        Self::to(inside.split(SHOWN_TEXT).next().unwrap_or_default())
    }

    /// La cible : le nom de fichier de la fiche, ou le titre de la note.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Reference {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{OPENING}{}{CLOSING}", self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reference(text: &str) -> Option<String> {
        Reference::parse(text).map(|r| r.as_str().to_owned())
    }

    #[test]
    fn a_reference_is_written_between_double_brackets() {
        let acme = Reference::to("acme").unwrap();
        assert_eq!(acme.to_string(), "[[acme]]");
        assert_eq!(acme.as_str(), "acme");
        assert_eq!(reference("[[acme]]"), Some("acme".to_owned()));
        assert_eq!(
            reference("  [[ Cahier des charges ]] "),
            Some("Cahier des charges".to_owned())
        );
    }

    #[test]
    fn a_shown_text_is_not_part_of_the_target() {
        assert_eq!(reference("[[acme|Acme SA]]"), Some("acme".to_owned()));
    }

    #[test]
    fn a_text_that_is_not_only_a_reference_is_not_one() {
        for text in [
            "",
            "acme",
            "[[]]",
            "[[ ]]",
            "[[|texte]]",
            "[acme]",
            "[[a]] x",
            "x [[a]]",
            "[[a",
            "[[a]",
            "[[a\nb]]",
            "[[a]][[b]]",
            "[[a[b]]",
        ] {
            assert_eq!(reference(text), None, "{text:?}");
        }
    }

    #[test]
    fn a_target_that_would_break_the_link_is_refused() {
        for target in ["", "  ", "a]b", "a[b", "a|b", "a\nb", "a\rb"] {
            assert_eq!(Reference::to(target), None, "{target:?}");
        }
        assert_eq!(Reference::to(" a b ").unwrap().as_str(), "a b");
    }
}
