//! Retrouver des notes par les mots qu'elles contiennent, sans tenir compte
//! des majuscules ni des accents, et montrer un extrait autour du premier mot trouvé.

use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

use crate::front_matter::split;

/// Caractères montrés avant le premier mot trouvé.
pub const EXCERPT_BEFORE: usize = 30;
/// Longueur d'un extrait, en caractères, sans les « … ».
pub const EXCERPT_LENGTH: usize = 120;
const ELLIPSIS: &str = "…";

/// Les mots d'une recherche, déjà ramenés à leur forme sans majuscule ni accent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchQuery {
    words: Vec<Vec<char>>,
}

/// Un morceau d'extrait : du texte, ou un mot cherché trouvé là.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExcerptPart {
    /// Texte autour des mots trouvés.
    Text(String),
    /// Un mot cherché, tel qu'il est écrit dans la note.
    Match(String),
}

/// Court passage d'une note trouvée, sur une seule ligne, coupé par « … » s'il le faut.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Excerpt(Vec<ExcerptPart>);

impl SearchQuery {
    /// La recherche formée des mots de `text` ; rien si `text` ne contient aucun mot.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        let words: Vec<Vec<char>> = text
            .split_whitespace()
            .map(|word| Folded::of(word).chars)
            .filter(|word| !word.is_empty())
            .collect();
        (!words.is_empty()).then_some(Self { words })
    }

    /// Les mots cherchés, sans majuscule ni accent, comme les donne [`folded`].
    #[must_use]
    pub fn words(&self) -> Vec<String> {
        self.words
            .iter()
            .map(|word| word.iter().collect())
            .collect()
    }
}

/// Le texte sans majuscule ni accent, tel que la recherche le compare : une note contient un mot
/// cherché si son texte ainsi ramené contient le mot (voir [`SearchQuery::words`]).
#[must_use]
pub fn folded(text: &str) -> String {
    Folded::of(text).chars.into_iter().collect()
}

impl Excerpt {
    /// Les morceaux de l'extrait, dans l'ordre.
    #[must_use]
    pub fn parts(&self) -> &[ExcerptPart] {
        &self.0
    }
}

/// Un texte sans majuscule ni accent ; chaque caractère garde la place de celui d'origine.
struct Folded {
    chars: Vec<char>,
    origin: Vec<usize>,
}

impl Folded {
    fn of(text: &str) -> Self {
        let mut folded = Self {
            chars: Vec::new(),
            origin: Vec::new(),
        };
        for (index, c) in text.chars().enumerate() {
            for plain in c.to_lowercase().nfd().filter(|c| !is_combining_mark(*c)) {
                folded.chars.push(plain);
                folded.origin.push(index);
            }
        }
        folded
    }

    /// Les places (en caractères du texte d'origine) de chaque occurrence de `word`.
    fn occurrences<'a>(&'a self, word: &'a [char]) -> impl Iterator<Item = (usize, usize)> + 'a {
        self.chars
            .windows(word.len())
            .enumerate()
            .filter(move |(_, window)| *window == word)
            .map(|(start, _)| (self.origin[start], self.origin[start + word.len() - 1] + 1))
    }
}

/// L'extrait de la note `content` si elle contient tous les mots de `query`.
#[must_use]
pub fn search(query: &SearchQuery, content: &str) -> Option<Excerpt> {
    let whole = Folded::of(content);
    if !query
        .words
        .iter()
        .all(|word| whole.occurrences(word).next().is_some())
    {
        return None;
    }
    let (_, body) = split(content);
    let chars: Vec<char> = body.chars().collect();
    let folded = Folded::of(body);
    let first = query
        .words
        .iter()
        .filter_map(|word| folded.occurrences(word).next())
        .map(|(start, _)| start)
        .min()
        .unwrap_or(0);
    let start = first.saturating_sub(EXCERPT_BEFORE);
    let end = chars.len().min(start + EXCERPT_LENGTH);
    let window: String = chars[start..end].iter().collect();
    let line = window.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut parts = highlighted(query, &line);
    if start > 0 {
        parts.insert(0, ExcerptPart::Text(ELLIPSIS.to_owned()));
    }
    if end < chars.len() {
        parts.push(ExcerptPart::Text(ELLIPSIS.to_owned()));
    }
    Some(Excerpt(merged(parts)))
}

/// Le texte découpé en morceaux, les mots cherchés à part ; les mots qui se chevauchent ne font qu'un.
fn highlighted(query: &SearchQuery, line: &str) -> Vec<ExcerptPart> {
    let chars: Vec<char> = line.chars().collect();
    let folded = Folded::of(line);
    let mut ranges: Vec<(usize, usize)> = query
        .words
        .iter()
        .flat_map(|word| folded.occurrences(word))
        .collect();
    ranges.sort_unstable();
    let mut parts = Vec::new();
    let mut position = 0;
    for (start, end) in ranges {
        let start = start.max(position);
        if end <= position {
            continue;
        }
        parts.push(ExcerptPart::Text(chars[position..start].iter().collect()));
        parts.push(ExcerptPart::Match(chars[start..end].iter().collect()));
        position = end;
    }
    parts.push(ExcerptPart::Text(chars[position..].iter().collect()));
    parts
}

/// Les morceaux sans texte vide, deux morceaux voisins de même sorte réunis.
fn merged(parts: Vec<ExcerptPart>) -> Vec<ExcerptPart> {
    let mut result: Vec<ExcerptPart> = Vec::new();
    for part in parts {
        match (result.last_mut(), part) {
            (_, ExcerptPart::Text(t) | ExcerptPart::Match(t)) if t.is_empty() => {}
            (Some(ExcerptPart::Text(previous)), ExcerptPart::Text(t))
            | (Some(ExcerptPart::Match(previous)), ExcerptPart::Match(t)) => previous.push_str(&t),
            (_, part) => result.push(part),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use ExcerptPart::{Match, Text};

    fn found(query: &str, content: &str) -> Option<Vec<ExcerptPart>> {
        search(&SearchQuery::parse(query).unwrap(), content).map(|e| e.0)
    }

    fn text(s: &str) -> ExcerptPart {
        Text(s.to_owned())
    }

    fn matched(s: &str) -> ExcerptPart {
        Match(s.to_owned())
    }

    #[test]
    fn words_and_text_are_folded_alike() {
        let query = SearchQuery::parse("  ÉTÉ  Œuvre ").unwrap();
        assert_eq!(query.words(), ["ete", "œuvre"]);
        assert_eq!(folded("Un bel Été, İ"), "un bel ete, i");
    }

    #[test]
    fn a_query_without_words_searches_nothing() {
        assert_eq!(SearchQuery::parse(""), None);
        assert_eq!(SearchQuery::parse("  \t\n "), None);
    }

    #[test]
    fn a_note_is_found_by_a_word_it_contains() {
        assert_eq!(
            found("pain", "Acheter du pain demain"),
            Some(vec![text("Acheter du "), matched("pain"), text(" demain")])
        );
    }

    #[test]
    fn a_note_without_the_word_is_not_found() {
        assert_eq!(found("lait", "Acheter du pain"), None);
    }

    #[test]
    fn capitals_and_accents_do_not_count() {
        assert_eq!(
            found("ETE", "Un bel été."),
            Some(vec![text("Un bel "), matched("été"), text(".")])
        );
        assert_eq!(
            found("Été", "en ete"),
            Some(vec![text("en "), matched("ete")])
        );
    }

    #[test]
    fn every_word_must_be_in_the_note_in_any_order() {
        assert!(found("demain pain", "Acheter du pain demain").is_some());
        assert_eq!(found("pain lait", "Acheter du pain demain"), None);
    }

    #[test]
    fn a_word_is_found_inside_a_longer_word() {
        assert_eq!(
            found("cour", "# Courses"),
            Some(vec![text("# "), matched("Cour"), text("ses")])
        );
    }

    #[test]
    fn every_occurrence_of_every_word_is_highlighted() {
        assert_eq!(
            found("pain lait", "pain, lait et pain"),
            Some(vec![
                matched("pain"),
                text(", "),
                matched("lait"),
                text(" et "),
                matched("pain"),
            ])
        );
    }

    #[test]
    fn overlapping_words_are_highlighted_once() {
        assert_eq!(
            found("pai ain", "du pain"),
            Some(vec![text("du "), matched("pain")])
        );
    }

    #[test]
    fn the_excerpt_is_a_single_line() {
        assert_eq!(
            found("pain", "# Courses\n\n- pain\r\n- lait"),
            Some(vec![text("# Courses - "), matched("pain"), text(" - lait")])
        );
    }

    #[test]
    fn a_long_note_is_cut_around_the_first_word_found() {
        let content = format!("{}pain{}", "a".repeat(100), "b".repeat(200));
        let parts = found("pain", &content).unwrap();
        assert_eq!(
            parts,
            vec![
                text(&format!("…{}", "a".repeat(EXCERPT_BEFORE))),
                matched("pain"),
                text(&format!(
                    "{}…",
                    "b".repeat(EXCERPT_LENGTH - EXCERPT_BEFORE - "pain".len())
                )),
            ]
        );
    }

    #[test]
    fn the_excerpt_starts_at_the_first_word_found_in_the_text() {
        let content = format!("{}lait{}pain", "a".repeat(100), "b".repeat(10));
        let parts = found("pain lait", &content).unwrap();
        assert_eq!(parts[1], matched("lait"));
    }

    #[test]
    fn a_word_found_only_in_the_header_shows_the_start_of_the_text() {
        assert_eq!(
            found("projet", "---\ntags: projet\n---\n# Réunion"),
            Some(vec![text("# Réunion")])
        );
    }

    #[test]
    fn letters_whose_lower_case_is_longer_keep_their_place() {
        assert_eq!(found("x", "İx"), Some(vec![text("İ"), matched("x")]));
    }
}
