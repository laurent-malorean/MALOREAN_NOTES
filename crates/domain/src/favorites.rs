//! Les favoris (fiche 0102) : un contenu est en favori quand la note des favoris a une ligne faite
//! uniquement d'un lien entre notes qui le désigne. Règles pures : quelles lignes sont des favoris,
//! le texte obtenu en en ajoutant une ou en en retirant, et comment remettre exactement les lignes
//! retirées.
//!
//! - Une ligne de favori est un lien et rien d'autre, avec ou sans marque de liste (`- `, `* `,
//!   `1. `) et espaces autour ; `[[titre|texte]]` désigne `titre`. Un lien au milieu d'une phrase,
//!   plusieurs liens sur une ligne ou un lien qui ne désigne aucun contenu (ou plusieurs) ne font
//!   pas un favori : ils ne sont ni listés ni retirés.
//! - L'en-tête de la note n'est jamais lu ni changé.
//! - Les fins de ligne du texte (`\n` ou `\r\n`) sont gardées.

use crate::NotePath;
use crate::front_matter::split_exact;
use crate::links::{LinkIndex, Resolution, linked_targets};

const OPENING: &str = "[[";
const CLOSING: &str = "]]";
/// Les marques de liste à puce, suivies d'une espace.
const BULLETS: [&str; 2] = ["- ", "* "];
/// Ce qui suit le numéro d'une liste numérotée : `1. `.
const NUMBER_SUFFIX: &str = ". ";
const LINE_END: char = '\n';
const LINE_END_WINDOWS: &str = "\r\n";

/// Une ligne retirée de la note des favoris, avec sa place : de quoi la remettre à l'identique.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemovedLine {
    /// Le rang de la ligne (depuis 0) dans la note, en-tête non compté, avant le retrait.
    pub index: usize,
    /// La ligne telle qu'elle était écrite, fin de ligne comprise.
    pub text: String,
}

/// Le texte de la note des favoris après le retrait d'un contenu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Removal {
    /// Le texte sans les lignes qui désignaient le contenu.
    pub text: String,
    /// Les lignes retirées, dans l'ordre de la note ; vide si le contenu n'était pas en favori.
    pub removed: Vec<RemovedLine>,
}

/// Les lignes du texte après son en-tête, fins de ligne comprises.
fn body_lines(text: &str) -> impl Iterator<Item = &str> {
    split_exact(text).1.split_inclusive(LINE_END)
}

/// Ce que la ligne désigne par son lien, si elle n'est faite que d'un lien.
fn link_of_line(line: &str) -> Option<&str> {
    let link = without_list_mark(line.trim());
    let inside = link.strip_prefix(OPENING)?.strip_suffix(CLOSING)?;
    if inside.contains(OPENING) || inside.contains(CLOSING) {
        return None;
    }
    linked_targets(link).into_iter().next()
}

/// La ligne sans sa marque de liste (`- `, `* `, `1. `) ni les espaces qui la suivent.
fn without_list_mark(line: &str) -> &str {
    if let Some(rest) = BULLETS.iter().find_map(|mark| line.strip_prefix(mark)) {
        return rest.trim_start();
    }
    let digits = line.bytes().take_while(u8::is_ascii_digit).count();
    match line[digits..].strip_prefix(NUMBER_SUFFIX) {
        Some(rest) if digits > 0 => rest.trim_start(),
        _ => line,
    }
}

/// Le contenu que désigne la ligne : le sien seul, s'il est unique.
fn content_of_line(line: &str, links: &LinkIndex) -> Option<NotePath> {
    match links.resolve(link_of_line(line)?) {
        Resolution::Found(path) => Some(path),
        Resolution::Ambiguous(_) | Resolution::Missing => None,
    }
}

/// Les contenus en favori dans le texte de la note des favoris, dans l'ordre de la note, chacun
/// une seule fois.
#[must_use]
pub fn favorites_of(text: &str, links: &LinkIndex) -> Vec<NotePath> {
    let mut favorites: Vec<NotePath> = Vec::new();
    for path in body_lines(text).filter_map(|line| content_of_line(line, links)) {
        if !favorites.contains(&path) {
            favorites.push(path);
        }
    }
    favorites
}

/// Le contenu `content` est-il en favori dans ce texte ?
#[must_use]
pub fn is_favorite(text: &str, links: &LinkIndex, content: &NotePath) -> bool {
    body_lines(text).any(|line| content_of_line(line, links).as_ref() == Some(content))
}

/// Le texte avec, à la fin, une ligne `- [[link]]` ; `link` est ce que donne le menu des liens.
/// Le texte se termine toujours par une fin de ligne ensuite, du style de celles du texte.
#[must_use]
pub fn with_favorite(text: &str, link: &str) -> String {
    let line_end = if text.contains(LINE_END_WINDOWS) {
        LINE_END_WINDOWS
    } else {
        "\n"
    };
    let mut added = text.to_owned();
    if !added.is_empty() && !added.ends_with(LINE_END) {
        added.push_str(line_end);
    }
    added.push_str(&format!("- {OPENING}{link}{CLOSING}{line_end}"));
    added
}

/// Le texte sans toutes les lignes qui désignent `content` (doublons compris), et ces lignes.
#[must_use]
pub fn without_favorite(text: &str, links: &LinkIndex, content: &NotePath) -> Removal {
    let mut kept = split_exact(text).0.to_owned();
    let mut removed = Vec::new();
    for (index, line) in body_lines(text).enumerate() {
        if content_of_line(line, links).as_ref() == Some(content) {
            removed.push(RemovedLine {
                index,
                text: line.to_owned(),
            });
        } else {
            kept.push_str(line);
        }
    }
    Removal {
        text: kept,
        removed,
    }
}

/// Le texte avec les lignes `removed` remises à leur place. Si le texte a changé depuis, une ligne
/// dont la place n'existe plus va à la fin ; une ligne n'en recolle jamais deux.
#[must_use]
pub fn with_lines_back(text: &str, removed: &[RemovedLine]) -> String {
    let (header, body) = split_exact(text);
    let mut lines: Vec<String> = body.split_inclusive(LINE_END).map(str::to_owned).collect();
    let mut back: Vec<&RemovedLine> = removed.iter().collect();
    back.sort_by_key(|line| line.index);
    for line in back {
        let at = line.index.min(lines.len());
        if let Some(before) = lines[..at].last_mut().filter(|l| !l.ends_with(LINE_END)) {
            before.push(LINE_END);
        }
        let mut restored = line.text.clone();
        if at < lines.len() && !restored.ends_with(LINE_END) {
            restored.push(LINE_END);
        }
        lines.insert(at, restored);
    }
    format!("{header}{}", lines.concat())
}

#[cfg(test)]
#[path = "favorites_tests.rs"]
mod tests;
