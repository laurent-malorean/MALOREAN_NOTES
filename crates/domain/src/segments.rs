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
    /// Le chemin du nœud d'une carte mentale que ce segment dit (`1.0.2`) ; aucun pour une note.
    node: Option<String>,
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

    /// Le segment du nœud `node` (de titre `title`) de la carte mentale titrée `map_title` : son
    /// titre complet est celui de la carte puis celui du nœud, son texte est le détail du nœud.
    #[must_use]
    pub fn of_node(map_title: &str, title: &str, detail: &str, node: String) -> Self {
        Self {
            note_title: map_title.to_owned(),
            section: Some(title.to_owned()),
            text: detail.trim().to_owned(),
            node: Some(node),
        }
    }

    /// Les segments de la fiche de CRM titrée `title`, de texte utile `body` : son titre complet
    /// est celui de son CRM puis le sien (le sien seul si son CRM est inconnu), son texte est coupé
    /// comme celui d'une note. Une fiche sans texte donne tout de même un segment : son titre.
    #[must_use]
    pub fn of_fiche(crm_title: Option<&str>, title: &str, body: &str) -> Vec<Self> {
        let (note_title, section) = match crm_title {
            Some(crm) => (crm, Some(title)),
            None => (title, None),
        };
        let mut pieces = cut(body);
        if pieces.is_empty() {
            pieces.push(String::new());
        }
        pieces
            .into_iter()
            .map(|text| Self {
                note_title: note_title.to_owned(),
                section: section.map(str::to_owned),
                text,
                node: None,
            })
            .collect()
    }

    /// Le chemin du nœud de carte mentale que ce segment dit, s'il en dit un.
    #[must_use]
    pub fn node(&self) -> Option<&str> {
        self.node.as_deref()
    }

    /// Le texte du segment, sans espaces autour.
    #[must_use]
    pub fn text(&self) -> &str {
        &self.text
    }

    /// Ce que le moteur de sens lit pour calculer le vecteur du segment : son titre complet, une
    /// ligne vide, puis son texte. Le titre donne au modèle le sujet que le texte seul n'a pas.
    #[must_use]
    pub fn embedding_text(&self) -> String {
        format!("{}\n\n{}", self.heading(), self.text)
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
                node: None,
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

/// La clé d'un segment : un hachage stable de son contenu (titre complet et texte). Deux segments
/// de même contenu ont la même clé, d'une exécution à l'autre ; l'index de sens s'en sert pour
/// garder le vecteur d'un segment qui n'a pas changé.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct SegmentKey(u64);

impl SegmentKey {
    /// La clé de valeur `value` (celle que l'index a gardée).
    #[must_use]
    pub fn new(value: u64) -> Self {
        Self(value)
    }

    /// La valeur de la clé, à ranger dans l'index.
    #[must_use]
    pub fn value(self) -> u64 {
        self.0
    }
}

/// Sépare le titre complet du texte dans ce qu'on hache : « A » + « B » et « AB » + « » diffèrent.
const KEY_SEPARATOR: u8 = 0;
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0100_0000_01b3;

impl Segment {
    /// Sa clé : FNV-1a sur 64 bits de son titre complet, d'un octet nul, puis de son texte (même
    /// hachage que l'empreinte de dossier de la fiche 0028).
    #[must_use]
    pub fn key(&self) -> SegmentKey {
        let heading = self.heading();
        let bytes = heading
            .bytes()
            .chain([KEY_SEPARATOR])
            .chain(self.text.bytes())
            .chain(
                self.node
                    .iter()
                    .flat_map(|node| std::iter::once(KEY_SEPARATOR).chain(node.bytes())),
            );
        SegmentKey(bytes.fold(FNV_OFFSET, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(FNV_PRIME)
        }))
    }

    /// Le segment lu dans l'index : son titre complet, son texte et son nœud, tels qu'ils y ont été gardés.
    /// Il se comporte comme l'original (même titre complet, même texte, même clé).
    #[must_use]
    pub fn from_stored(heading: &str, text: &str, node: Option<&str>) -> Self {
        Self {
            note_title: heading.to_owned(),
            section: None,
            text: text.to_owned(),
            node: node.map(str::to_owned),
        }
    }
}

/// Ce qu'on garde et ce qu'on jette quand les segments d'une note changent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reuse<I> {
    /// Pour chaque nouveau segment, dans l'ordre, l'ancien à garder (de même clé), s'il y en a un.
    pub kept: Vec<Option<I>>,
    /// Les anciens segments qu'aucun nouveau ne reprend.
    pub removed: Vec<I>,
}

/// Apparie les nouveaux segments (leurs clés) aux anciens `(identifiant, clé)` : chaque ancien
/// sert au plus une fois, le premier de même clé d'abord ; deux segments identiques dans une note
/// s'apparient donc chacun au leur.
#[must_use]
pub fn reuse<I: Copy>(old: &[(I, SegmentKey)], new: &[SegmentKey]) -> Reuse<I> {
    let mut free: Vec<bool> = vec![true; old.len()];
    let kept = new
        .iter()
        .map(|key| {
            let found = old
                .iter()
                .enumerate()
                .find(|(index, (_, old_key))| free[*index] && old_key == key)?;
            free[found.0] = false;
            Some(found.1.0)
        })
        .collect();
    let removed = old
        .iter()
        .zip(&free)
        .filter(|(_, free)| **free)
        .map(|((id, _), _)| *id)
        .collect();
    Reuse { kept, removed }
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

    #[test]
    fn a_key_is_the_fnv_hash_of_the_heading_a_zero_byte_and_the_text() {
        let segment = &segments("Note", "## Titre\n\nle texte")[0];
        assert_eq!(segment.heading(), "Note > Titre");
        assert_eq!(segment.key(), SegmentKey::new(0xa4eb_4e45_a391_e5d0));
        assert_eq!(segment.key().value(), 0xa4eb_4e45_a391_e5d0);
    }

    #[test]
    fn the_embedding_text_is_the_full_heading_then_a_blank_line_then_the_text() {
        let found = segments("Ma note", "## Dessert\n\nTarte aux pommes");
        assert_eq!(
            found[0].embedding_text(),
            "Ma note > Dessert\n\nTarte aux pommes"
        );
        assert_eq!(
            Segment::from_stored("Ma note > Dessert", "Tarte", None).embedding_text(),
            "Ma note > Dessert\n\nTarte"
        );
    }

    #[test]
    fn the_separator_keeps_the_heading_and_the_text_apart() {
        assert_eq!(
            Segment::from_stored("", "", None).key().value(),
            0xaf63_bd4c_8601_b7df
        );
        assert_eq!(
            Segment::from_stored("a", "", None).key().value(),
            0x089b_e207_b544_f1e4
        );
        assert_eq!(
            Segment::from_stored("", "a", None).key().value(),
            0x0832_6707_b4eb_37da
        );
        assert_ne!(
            Segment::from_stored("a", "b", None).key(),
            Segment::from_stored("", "ab", None).key()
        );
    }

    #[test]
    fn a_key_changes_with_the_heading_or_the_text_only() {
        let first = segments("Note", "un")[0].key();
        assert_eq!(first, segments("Note", "un")[0].key());
        assert_ne!(first, segments("Autre", "un")[0].key());
        assert_ne!(first, segments("Note", "deux")[0].key());
        assert_eq!(first, segments("Note", "---\ntags: x\n---\nun")[0].key());
    }

    #[test]
    fn a_stored_segment_behaves_like_the_original() {
        for segment in segments("Ma note", "intro\n\n## Suite > et fin\n\ntexte") {
            let stored = Segment::from_stored(&segment.heading(), segment.text(), segment.node());
            assert_eq!(stored.heading(), segment.heading());
            assert_eq!(stored.text(), segment.text());
            assert_eq!(stored.key(), segment.key());
        }
    }

    fn key(value: u64) -> SegmentKey {
        SegmentKey::new(value)
    }

    #[test]
    fn unchanged_segments_are_kept_whatever_their_place() {
        let old = [(10, key(1)), (11, key(2)), (12, key(3))];
        let plan = reuse(&old, &[key(3), key(9), key(1)]);
        assert_eq!(plan.kept, [Some(12), None, Some(10)]);
        assert_eq!(plan.removed, [11]);
    }

    #[test]
    fn identical_segments_are_matched_one_to_one() {
        let old = [(1, key(5)), (2, key(5))];
        let plan = reuse(&old, &[key(5), key(5), key(5)]);
        assert_eq!(plan.kept, [Some(1), Some(2), None]);
        assert!(plan.removed.is_empty());
        let plan = reuse(&old, &[key(5)]);
        assert_eq!(plan.kept, [Some(1)]);
        assert_eq!(plan.removed, [2]);
    }

    #[test]
    fn nothing_old_or_nothing_new_is_handled() {
        assert_eq!(reuse::<u8>(&[], &[key(1)]).kept, [None]);
        let plan = reuse(&[(7, key(1))], &[]);
        assert!(plan.kept.is_empty());
        assert_eq!(plan.removed, [7]);
    }
}
