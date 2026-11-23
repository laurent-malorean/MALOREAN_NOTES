//! Les notes découpées en segments pour la recherche par le sens (todo « Recherche par le sens »).

use crate::front_matter;

/// Au-delà de ce nombre de caractères, un segment est coupé : un petit modèle de sens lit un
/// texte court, et un segment trop long noie son sujet.
pub const MAX_SEGMENT_CHARS: usize = 1_200;

/// Un morceau d'une note, avec le titre de sa note et celui de sa section.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Segment {
    note_title: String,
    section: Option<String>,
    text: String,
}

impl Segment {
    /// Le titre de la note et celui de la section, séparés par « > » ; le titre de la note seul
    /// pour le texte qui précède le premier titre.
    #[must_use]
    pub fn heading(&self) -> String {
        match &self.section {
            Some(section) => format!("{} > {section}", self.note_title),
            None => self.note_title.clone(),
        }
    }

    /// Le texte du segment, sans espaces autour.
    #[must_use]
    pub fn text(&self) -> &str {
        &self.text
    }
}

/// Les segments de la note de titre `note_title` et de texte `content`, dans l'ordre de la note.
#[must_use]
pub fn segments(note_title: &str, content: &str) -> Vec<Segment> {
    let (_, body) = front_matter::split(content);
    sections(note_title, body)
        .into_iter()
        .flat_map(|(section, text)| {
            cut(&text).into_iter().map(move |text| Segment {
                note_title: note_title.to_owned(),
                section: section.clone(),
                text,
            })
        })
        .collect()
}

const FENCES: [&str; 2] = ["```", "~~~"];
const HEADING_MARK: char = '#';
const MAX_HEADING_LEVEL: usize = 6;

/// Le texte de chaque section, avec son titre ; `None` pour ce qui précède le premier titre et
/// sous le titre de la note elle-même.
fn sections(note_title: &str, body: &str) -> Vec<(Option<String>, String)> {
    let mut found = vec![(None, String::new())];
    let mut in_code = false;
    for line in body.lines() {
        if FENCES
            .iter()
            .any(|fence| line.trim_start().starts_with(fence))
        {
            in_code = !in_code;
        }
        match heading(line).filter(|_| !in_code) {
            Some(text) if text == note_title && found.len() == 1 => {}
            Some(text) => found.push((Some(text), String::new())),
            None => {
                if let Some((_, lines)) = found.last_mut() {
                    lines.push_str(line);
                    lines.push('\n');
                }
            }
        }
    }
    found
}

/// Le texte du titre `#` de la ligne, sans ses marques ; rien si la ligne n'est pas un titre.
fn heading(line: &str) -> Option<String> {
    let rest = line.trim_start_matches(HEADING_MARK);
    let level = line.len() - rest.len();
    if level == 0 || level > MAX_HEADING_LEVEL || !rest.starts_with([' ', '\t']) {
        return None;
    }
    let text = rest.trim().trim_end_matches(HEADING_MARK).trim();
    (!text.is_empty()).then(|| text.to_owned())
}

/// Le texte d'une section coupé en morceaux d'au plus `MAX_SEGMENT_CHARS` caractères : les
/// paragraphes voisins réunis tant qu'ils tiennent, un paragraphe trop long coupé entre ses mots.
fn cut(text: &str) -> Vec<String> {
    let mut pieces: Vec<String> = Vec::new();
    for paragraph in paragraphs(text).into_iter().flat_map(|p| words_cut(&p)) {
        match pieces.last_mut() {
            Some(last)
                if length(last) + PARAGRAPH_GAP.len() + length(&paragraph) <= MAX_SEGMENT_CHARS =>
            {
                last.push_str(PARAGRAPH_GAP);
                last.push_str(&paragraph);
            }
            _ => pieces.push(paragraph),
        }
    }
    pieces
}

const PARAGRAPH_GAP: &str = "\n\n";

fn length(text: &str) -> usize {
    text.chars().count()
}

/// Les paragraphes (séparés par des lignes vides) qui ont du texte, sans espaces autour.
fn paragraphs(text: &str) -> Vec<String> {
    let mut found = vec![String::new()];
    for line in text.lines() {
        if line.trim().is_empty() {
            found.push(String::new());
        } else if let Some(last) = found.last_mut() {
            if !last.is_empty() {
                last.push('\n');
            }
            last.push_str(line.trim_end());
        }
    }
    found.retain(|paragraph| !paragraph.trim().is_empty());
    found
}

/// Le paragraphe tel quel s'il tient ; sinon des morceaux de mots entiers, aussi longs que
/// possible, un mot trop long étant coupé au maximum.
fn words_cut(paragraph: &str) -> Vec<String> {
    if length(paragraph) <= MAX_SEGMENT_CHARS {
        return vec![paragraph.to_owned()];
    }
    let mut pieces: Vec<String> = Vec::new();
    for word in paragraph.split(' ') {
        match pieces.last_mut() {
            Some(last) if length(last) + 1 + length(word) <= MAX_SEGMENT_CHARS => {
                last.push(' ');
                last.push_str(word);
            }
            _ => pieces.extend(chars_cut(word)),
        }
    }
    pieces
}

/// Le mot coupé tous les `MAX_SEGMENT_CHARS` caractères.
fn chars_cut(word: &str) -> Vec<String> {
    let letters: Vec<char> = word.chars().collect();
    letters
        .chunks(MAX_SEGMENT_CHARS)
        .map(|part| part.iter().collect())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headings_and_texts(content: &str) -> Vec<(String, String)> {
        segments("Ma note", content)
            .iter()
            .map(|s| (s.heading(), s.text().to_owned()))
            .collect()
    }

    fn pair(heading: &str, text: &str) -> (String, String) {
        (heading.to_owned(), text.to_owned())
    }

    #[test]
    fn a_note_without_text_has_no_segment() {
        assert!(segments("Ma note", "").is_empty());
        assert!(segments("Ma note", "# Ma note\n\n").is_empty());
    }

    #[test]
    fn text_without_heading_is_one_segment_under_the_note_title() {
        assert_eq!(
            headings_and_texts("Bonjour\n\nle monde\n"),
            vec![pair("Ma note", "Bonjour\n\nle monde")]
        );
    }

    #[test]
    fn the_note_own_heading_is_not_a_section() {
        assert_eq!(
            headings_and_texts("# Ma note\n\nintro"),
            vec![pair("Ma note", "intro")]
        );
    }

    #[test]
    fn each_heading_starts_a_segment_with_its_title() {
        let content = "# Ma note\n\nintro\n\n## A\n\nun\n\n### B\n\ndeux\n";
        assert_eq!(
            headings_and_texts(content),
            vec![
                pair("Ma note", "intro"),
                pair("Ma note > A", "un"),
                pair("Ma note > B", "deux"),
            ]
        );
    }

    #[test]
    fn a_heading_without_text_makes_no_segment() {
        assert_eq!(
            headings_and_texts("## Vide\n\n## Plein\n\ntexte"),
            vec![pair("Ma note > Plein", "texte")]
        );
    }

    #[test]
    fn the_front_matter_is_not_text() {
        assert_eq!(
            headings_and_texts("---\ntags: [a]\n---\n# Ma note\n\ntexte"),
            vec![pair("Ma note", "texte")]
        );
    }

    #[test]
    fn heading_marks_and_closing_hashes_are_removed() {
        assert_eq!(
            headings_and_texts("###### Fin ######\n\ntexte"),
            vec![pair("Ma note > Fin", "texte")]
        );
    }

    #[test]
    fn a_hash_without_space_is_text_not_a_heading() {
        assert_eq!(
            headings_and_texts("#etiquette en début de ligne"),
            vec![pair("Ma note", "#etiquette en début de ligne")]
        );
    }

    #[test]
    fn a_mark_without_title_is_text() {
        assert_eq!(
            headings_and_texts("## \n\ntexte"),
            vec![pair("Ma note", "##\n\ntexte")]
        );
    }

    #[test]
    fn seven_hashes_or_an_indented_line_is_text_not_a_heading() {
        assert_eq!(
            headings_and_texts("####### sept\n\n un retrait"),
            vec![pair("Ma note", "####### sept\n\n un retrait")]
        );
    }

    #[test]
    fn paragraphs_are_gathered_up_to_exactly_the_maximum() {
        let (short, long) = ("a".repeat(599), "b".repeat(600));
        assert_eq!(
            headings_and_texts(&format!("{short}\n\n{short}")),
            vec![pair("Ma note", &format!("{short}\n\n{short}"))]
        );
        assert_eq!(
            headings_and_texts(&format!("{long}\n\n{short}")),
            vec![pair("Ma note", &long), pair("Ma note", &short)]
        );
    }

    #[test]
    fn words_of_a_long_paragraph_are_gathered_up_to_exactly_the_maximum() {
        let (a, b, c) = ("a".repeat(599), "b".repeat(600), "c".repeat(10));
        assert_eq!(
            headings_and_texts(&format!("{a} {b} {c}")),
            vec![pair("Ma note", &format!("{a} {b}")), pair("Ma note", &c)]
        );
        let (d, e) = ("d".repeat(600), "e".repeat(600));
        assert_eq!(
            headings_and_texts(&format!("{d} {e} f")),
            vec![pair("Ma note", &d), pair("Ma note", &format!("{e} f"))]
        );
    }

    #[test]
    fn a_hash_line_in_a_code_block_is_not_a_heading() {
        let content = "## Script\n\n```bash\n# commentaire\nls\n```\n";
        assert_eq!(
            headings_and_texts(content),
            vec![pair("Ma note > Script", "```bash\n# commentaire\nls\n```")]
        );
    }

    #[test]
    fn a_long_section_is_cut_between_paragraphs() {
        let paragraph = "a".repeat(700);
        let content = format!("## Long\n\n{paragraph}\n\n{paragraph}\n\n{paragraph}");
        let found = headings_and_texts(&content);
        assert_eq!(
            found,
            vec![
                pair("Ma note > Long", &paragraph),
                pair("Ma note > Long", &paragraph),
                pair("Ma note > Long", &paragraph),
            ]
        );
    }

    #[test]
    fn small_paragraphs_are_gathered_up_to_the_maximum() {
        let paragraph = "a".repeat(500);
        let content = format!("{paragraph}\n\n{paragraph}\n\n{paragraph}");
        let found = headings_and_texts(&content);
        assert_eq!(
            found,
            vec![
                pair("Ma note", &format!("{paragraph}\n\n{paragraph}")),
                pair("Ma note", &paragraph),
            ]
        );
    }

    #[test]
    fn a_paragraph_longer_than_the_maximum_is_cut_between_words() {
        let words = vec!["mot"; 500].join(" ");
        let found = headings_and_texts(&words);
        assert_eq!(found.len(), 2);
        assert!(
            found
                .iter()
                .all(|(_, text)| text.chars().count() <= MAX_SEGMENT_CHARS)
        );
        assert!(
            found
                .iter()
                .all(|(_, text)| text.split(' ').all(|w| w == "mot"))
        );
        let rejoined: Vec<_> = found.iter().map(|(_, text)| text.as_str()).collect();
        assert_eq!(rejoined.join(" "), words);
    }

    #[test]
    fn the_maximum_counts_characters_not_bytes() {
        let paragraph = "é".repeat(MAX_SEGMENT_CHARS);
        assert_eq!(
            headings_and_texts(&paragraph),
            vec![pair("Ma note", &paragraph)]
        );
    }

    #[test]
    fn a_word_longer_than_the_maximum_is_cut_at_the_maximum() {
        let word = "x".repeat(MAX_SEGMENT_CHARS + 5);
        let found = headings_and_texts(&word);
        assert_eq!(
            found,
            vec![
                pair("Ma note", &"x".repeat(MAX_SEGMENT_CHARS)),
                pair("Ma note", "xxxxx"),
            ]
        );
    }
}
