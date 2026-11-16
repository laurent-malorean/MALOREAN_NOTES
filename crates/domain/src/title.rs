//! Titre d'une note : son premier titre `#`.

use crate::front_matter;

/// Titre affiché quand une note n'a pas de titre `#`.
pub const UNTITLED: &str = "Sans titre";

const HEADING_PREFIX: &str = "# ";
const CODE_FENCES: [&str; 2] = ["```", "~~~"];

/// Premier titre `#` d'une note, hors en-tête et hors bloc de code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Title(String);

impl Title {
    /// Le titre de la note, s'il existe et n'est pas vide.
    #[must_use]
    pub fn of(content: &str) -> Option<Self> {
        let (_, body) = front_matter::split(content);
        let mut in_code = false;
        for line in body.split(['\n', '\r']) {
            if CODE_FENCES
                .iter()
                .any(|fence| line.trim_start().starts_with(fence))
            {
                in_code = !in_code;
                continue;
            }
            if in_code {
                continue;
            }
            if let Some(text) = heading_text(line) {
                return Some(Self(text));
            }
        }
        None
    }

    /// Le texte du titre.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Le texte d'un titre `#`, espaces et tabulations ramenés à une seule espace.
fn heading_text(line: &str) -> Option<String> {
    let raw = line
        .strip_prefix(HEADING_PREFIX)?
        .trim()
        .trim_end_matches('#');
    let text = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    (!text.is_empty()).then_some(text)
}

/// Le titre tel qu'il s'affiche : le titre `#`, ou « Sans titre ».
#[must_use]
pub fn displayed_title(content: &str) -> String {
    Title::of(content).map_or_else(|| UNTITLED.to_owned(), |t| t.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_is_the_first_level_one_heading() {
        let title = Title::of("Intro\n# Mon idée du jour\n## Sous-titre\n# Autre");
        assert_eq!(
            title.map(|t| t.as_str().to_owned()),
            Some("Mon idée du jour".into())
        );
    }

    #[test]
    fn note_without_level_one_heading_has_no_title() {
        assert_eq!(Title::of("## Seulement un sous-titre\ntexte"), None);
        assert_eq!(Title::of(""), None);
        assert_eq!(Title::of("#sans espace"), None);
    }

    #[test]
    fn heading_inside_code_block_is_not_a_title() {
        let content = "```\n# commentaire shell\n```\n# Vrai titre";
        assert_eq!(
            Title::of(content).map(|t| t.as_str().to_owned()),
            Some("Vrai titre".into())
        );
    }

    #[test]
    fn front_matter_is_skipped() {
        let content = "---\n# pas un titre\ntags: [a]\n---\n# Titre après en-tête";
        assert_eq!(
            Title::of(content).map(|t| t.as_str().to_owned()),
            Some("Titre après en-tête".into())
        );
    }

    #[test]
    fn closing_hashes_and_spaces_are_trimmed() {
        assert_eq!(
            Title::of("#   Titre   ##").map(|t| t.as_str().to_owned()),
            Some("Titre".into())
        );
    }

    #[test]
    fn empty_heading_is_not_a_title() {
        assert_eq!(Title::of("# \ntexte"), None);
    }

    #[test]
    fn title_stops_at_a_lone_carriage_return() {
        assert_eq!(
            Title::of("# Haut\rBas").map(|t| t.as_str().to_owned()),
            Some("Haut".into())
        );
    }

    #[test]
    fn tabs_inside_the_title_are_kept_as_spaces() {
        assert_eq!(
            Title::of("# A\tB").map(|t| t.as_str().to_owned()),
            Some("A B".into())
        );
    }

    #[test]
    fn displayed_title_falls_back_to_untitled() {
        assert_eq!(displayed_title("pas de titre"), UNTITLED);
        assert_eq!(displayed_title("# Courses"), "Courses");
    }
}
