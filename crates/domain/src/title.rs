//! Titre d'une note : son premier titre `#`.

use crate::FileName;
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
        title_line(body).map(|line| Self(line.text))
    }

    /// Le texte du titre.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// La ligne du titre dans le corps d'une note : où elle commence, sa longueur, son texte.
struct TitleLine {
    start: usize,
    len: usize,
    text: String,
}

/// Le premier titre `#` du corps, hors bloc de code.
fn title_line(body: &str) -> Option<TitleLine> {
    let mut in_code = false;
    let mut start = 0;
    for piece in body.split_inclusive(['\n', '\r']) {
        let line = piece.trim_end_matches(['\n', '\r']);
        if CODE_FENCES
            .iter()
            .any(|fence| line.trim_start().starts_with(fence))
        {
            in_code = !in_code;
        } else if !in_code && let Some(text) = heading_text(line) {
            return Some(TitleLine {
                start,
                len: line.len(),
                text,
            });
        }
        start += piece.len();
    }
    None
}

/// Le texte avec `title` pour titre : la ligne de son titre `#` remplacée par `# title`, ou,
/// s'il n'en a pas, `# title` en tête du corps, après l'en-tête.
#[must_use]
pub fn retitled(content: &str, title: &str) -> String {
    let (_, body) = front_matter::split(content);
    let head = &content[..content.len() - body.len()];
    match title_line(body) {
        Some(line) => format!(
            "{head}{}# {title}{}",
            &body[..line.start],
            &body[line.start + line.len..]
        ),
        None => format!("{head}# {title}\n{body}"),
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

/// Le titre d'une note tel qu'il s'affiche : son titre `#` ; à défaut, le nom de son fichier sans
/// `.md` (une note importée n'a pas forcément de titre `#`) ; « Sans titre » si ce nom est celui
/// d'une note neuve (`sans-titre`, `sans-titre-2`…).
#[must_use]
pub fn displayed_title_of_note(content: &str, name: &FileName) -> String {
    // Un canvas est du JSON : son titre est son nom, jamais une ligne de son contenu.
    let title = if name.is_canvas() {
        None
    } else {
        Title::of(content)
    };
    match title {
        Some(title) => title.0,
        None if name.is_untitled() => UNTITLED.to_owned(),
        None => name.stem().to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn displayed(content: &str, name: &str) -> String {
        displayed_title_of_note(content, &FileName::parse(name).unwrap())
    }

    #[test]
    fn a_canvas_shows_its_file_name_without_the_extension() {
        assert_eq!(
            displayed("# Pas un titre", "Plan du projet.canvas"),
            "Plan du projet"
        );
        assert_eq!(displayed("{}", "sans-titre-2.canvas"), "Sans titre");
    }

    #[test]
    fn a_note_without_title_shows_its_file_name_without_the_extension() {
        assert_eq!(
            displayed("## Idée centrale", "Habitus (de classe).md"),
            "Habitus (de classe)"
        );
        assert_eq!(
            displayed("", "2403232023 -Le style de vie.md"),
            "2403232023 -Le style de vie"
        );
        assert_eq!(displayed("texte", "a.b.md"), "a.b");
    }

    #[test]
    fn a_title_comes_before_the_file_name() {
        assert_eq!(displayed("# Mon titre", "autre.md"), "Mon titre");
    }

    #[test]
    fn a_new_note_without_title_is_untitled() {
        assert_eq!(displayed("", "sans-titre.md"), "Sans titre");
        assert_eq!(displayed("", "sans-titre-3.md"), "Sans titre");
    }

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

    #[test]
    fn retitled_replaces_the_title_line_only() {
        assert_eq!(
            retitled("Intro\n#  Journal  \n# Autre\n", "18 novembre 2026"),
            "Intro\n# 18 novembre 2026\n# Autre\n"
        );
        assert_eq!(retitled("# Journal\r\ntexte", "Lundi"), "# Lundi\r\ntexte");
    }

    #[test]
    fn retitled_skips_the_header_and_code_blocks() {
        assert_eq!(
            retitled(
                "---\n# pas un titre\n---\n```\n# code\n```\n# Journal",
                "Lundi"
            ),
            "---\n# pas un titre\n---\n```\n# code\n```\n# Lundi"
        );
    }

    #[test]
    fn retitled_puts_the_title_first_when_there_is_none() {
        assert_eq!(
            retitled("---\ntags: [a]\n---\ntexte\n", "Lundi"),
            "---\ntags: [a]\n---\n# Lundi\ntexte\n"
        );
        assert_eq!(retitled("", "Lundi"), "# Lundi\n");
    }
}
