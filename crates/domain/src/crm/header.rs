//! Lire et écrire les propriétés de l'en-tête d'une fiche. L'en-tête est du YAML simple : une
//! valeur seule (`site: https://acme.fr`), une liste entre crochets (`tags: [a, b]`) ou une
//! liste YAML (`- a` sur chaque ligne). Écrire une propriété ne change que ses lignes : les autres
//! propriétés, les commentaires et le texte inconnu restent identiques octet pour octet
//! (spécification § 4.8).

use crate::front_matter::{split, with_key_line};

const QUOTES: [char; 2] = ['"', '\''];
const COMMENT: char = '#';
const LIST_ITEM: char = '-';
/// Les signes qui, en tête d'une valeur, la feraient lire autrement que comme du texte.
const SPECIAL_FIRST: [char; 17] = [
    '[', ']', '{', '}', '&', '*', '!', '|', '>', '\'', '"', '%', '@', '`', '#', ',', '?',
];
/// Les signes qui changeraient le sens d'une liste entre crochets.
const FLOW_SIGNS: [char; 5] = [',', '[', ']', '{', '}'];
/// Les mots que YAML lit comme autre chose que du texte.
const NON_TEXT_WORDS: [&str; 11] = [
    "true", "false", "yes", "no", "on", "off", "null", "~", "y", "n", "nan",
];

/// Comment une valeur s'écrit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Style {
    /// Toujours entre apostrophes : les références et les dates.
    Always,
    /// Jamais entre apostrophes : un entier, que YAML lit comme un nombre.
    Bare,
    /// Telle quelle, entre apostrophes seulement si YAML la lirait autrement : une valeur seule.
    Line,
    /// Comme `Line`, et aussi entre apostrophes si elle contient un signe de liste : un élément
    /// d'une liste entre crochets.
    Flow,
}

/// Ce que l'en-tête dit d'une clé : le texte après les deux-points, commentaire retiré, et les
/// éléments de la liste YAML qui suit quand ce texte est vide.
struct Property {
    value: String,
    block_items: Vec<String>,
}

fn property(content: &str, key: &str) -> Option<Property> {
    let yaml = split(content).0?;
    let lines: Vec<&str> = yaml.lines().collect();
    let (at, value) = lines
        .iter()
        .enumerate()
        .find_map(|(at, line)| key_value(line, key).map(|value| (at, value)))?;
    let value = without_comment(value).trim().to_owned();
    let block_items = if value.is_empty() {
        lines[at + 1..]
            .iter()
            .map_while(|line| list_item(line))
            .map(|item| unquoted(without_comment(item)))
            .collect()
    } else {
        Vec::new()
    };
    Some(Property { value, block_items })
}

/// Ce qui suit les deux-points si la ligne porte la clé `key` (au premier niveau).
fn key_value<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let rest = line.strip_prefix(key)?;
    rest.trim_start_matches([' ', '\t']).strip_prefix(':')
}

/// Le texte d'un élément de liste YAML (`- a`), ou rien si la ligne n'en est pas un.
fn list_item(line: &str) -> Option<&str> {
    let item = line.trim_start().strip_prefix(LIST_ITEM)?;
    (item.is_empty() || item.starts_with([' ', '\t'])).then_some(item)
}

/// Le texte sans son commentaire YAML : ce qui suit un `#` précédé d'un blanc, hors guillemets.
fn without_comment(value: &str) -> &str {
    let mut quote = None;
    let mut previous = ' ';
    for (at, c) in value.char_indices() {
        match quote {
            Some(open) if c == open => quote = None,
            Some(_) => {}
            None if QUOTES.contains(&c) && previous.is_whitespace() => quote = Some(c),
            None if c == COMMENT && previous.is_whitespace() => return &value[..at],
            None => {}
        }
        previous = c;
    }
    value
}

/// La valeur sans ses guillemets (`'a''b'` donne `a'b`, `"a\"b"` donne `a"b`).
fn unquoted(value: &str) -> String {
    let value = value.trim();
    for quote in QUOTES {
        let inner = value
            .strip_prefix(quote)
            .and_then(|rest| rest.strip_suffix(quote));
        if let Some(inner) = inner {
            return if quote == '\'' {
                inner.replace("''", "'")
            } else {
                inner.replace("\\\"", "\"").replace("\\\\", "\\")
            };
        }
    }
    value.to_owned()
}

/// Les éléments d'une liste entre crochets, séparés par des virgules hors guillemets et hors
/// crochets imbriqués (`[[acme]]` écrit sans guillemets reste un seul élément).
fn flow_items(inside: &str) -> Vec<&str> {
    let mut items = Vec::new();
    let (mut quote, mut depth, mut start) = (None, 0_usize, 0);
    let mut at_item_start = true;
    for (at, c) in inside.char_indices() {
        match (quote, c) {
            (Some(open), c) if c == open => quote = None,
            // Une apostrophe au milieu d'un texte (`l'an`) n'ouvre pas de guillemets.
            (None, c) if QUOTES.contains(&c) && at_item_start => quote = Some(c),
            (None, '[') => depth += 1,
            (None, ']') => depth = depth.saturating_sub(1),
            (None, ',') if depth == 0 => {
                items.push(&inside[start..at]);
                start = at + c.len_utf8();
                at_item_start = true;
                continue;
            }
            _ => {}
        }
        at_item_start = at_item_start && c.is_whitespace();
    }
    items.push(&inside[start..]);
    items
}

/// La clé `key` est dans l'en-tête, même sans valeur.
pub(crate) fn has_key(content: &str, key: &str) -> bool {
    property(content, key).is_some()
}

/// La valeur seule de la clé `key`, sans guillemets ; rien si la clé est absente ou vide.
pub(crate) fn scalar(content: &str, key: &str) -> Option<String> {
    let value = unquoted(&property(content, key)?.value);
    (!value.is_empty()).then_some(value)
}

/// Les éléments de la clé `key`, sans guillemets, dans l'ordre : ceux d'une liste entre crochets,
/// ceux d'une liste YAML, ou la valeur seule comme unique élément. Un élément vide est ignoré.
pub(crate) fn items(content: &str, key: &str) -> Vec<String> {
    let Some(Property { value, block_items }) = property(content, key) else {
        return Vec::new();
    };
    let words: Vec<String> = match value.strip_prefix('[') {
        Some(rest) if is_flow_list(&value) => flow_items(rest.strip_suffix(']').unwrap_or(rest))
            .into_iter()
            .map(unquoted)
            .collect(),
        _ if value.is_empty() => block_items,
        _ => vec![unquoted(&value)],
    };
    words.into_iter().filter(|word| !word.is_empty()).collect()
}

/// Une valeur entre crochets est une liste, sauf si elle est une référence `[[…]]` entière.
fn is_flow_list(value: &str) -> bool {
    value.ends_with(']') && !(value.starts_with("[[") && value.matches('[').count() == 2)
}

/// La valeur écrite selon `style`.
pub(crate) fn rendered(value: &str, style: Style) -> String {
    let value = value.replace(['\r', '\n'], " ");
    let plain = match style {
        Style::Always => false,
        Style::Bare => true,
        Style::Line => !needs_quotes(&value),
        Style::Flow => !needs_quotes(&value) && !value.contains(FLOW_SIGNS),
    };
    if plain {
        value
    } else {
        format!("'{}'", value.replace('\'', "''"))
    }
}

/// YAML lirait cette valeur autrement que comme le texte qu'elle est.
fn needs_quotes(value: &str) -> bool {
    value.is_empty()
        || value != value.trim()
        || value.starts_with(SPECIAL_FIRST)
        || value.starts_with("- ")
        || value == "-"
        || value.contains(": ")
        || value.ends_with(':')
        || value.contains(" #")
        || NON_TEXT_WORDS.contains(&value.to_lowercase().as_str())
        || value.parse::<f64>().is_ok()
}

/// La ligne `clé: valeur`.
pub(crate) fn scalar_line(key: &str, value: &str, style: Style) -> String {
    format!("{key}: {}", rendered(value, style))
}

/// La ligne `clé: [a, b]`.
pub(crate) fn items_line(key: &str, items: &[String], style: Style) -> String {
    let written: Vec<String> = items.iter().map(|item| rendered(item, style)).collect();
    format!("{key}: [{}]", written.join(", "))
}

/// Combien de lignes, à partir de la première, portent la clé `key` : sa ligne, et la liste YAML
/// qui la suit si sa valeur est vide ; aucune si la première ligne ne la porte pas.
fn key_lines(key: &str, lines: &[&str]) -> usize {
    let Some(value) = lines.first().and_then(|line| key_value(line, key)) else {
        return 0;
    };
    if without_comment(value).trim().is_empty() {
        1 + lines[1..]
            .iter()
            .take_while(|line| list_item(line).is_some())
            .count()
    } else {
        1
    }
}

/// Le texte dont la clé `key` est remplacée par `line` (retirée si `line` est vide), le reste de
/// l'en-tête et du texte inchangé ; un en-tête est créé pour une ligne ajoutée à un texte qui n'en a pas.
pub(crate) fn with_line(content: &str, key: &str, line: Option<&str>) -> String {
    with_key_line(content, |lines| key_lines(key, lines), line)
}

/// Le texte avec la valeur seule `value` pour la clé `key` ; la clé est retirée si `value` est
/// vide ou absente.
pub(crate) fn with_scalar(content: &str, key: &str, value: Option<&str>, style: Style) -> String {
    let line = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| scalar_line(key, value, style));
    with_line(content, key, line.as_deref())
}

/// Le texte avec `items` pour la clé `key` ; la clé est retirée si la liste est vide.
pub(crate) fn with_items(content: &str, key: &str, items: &[String], style: Style) -> String {
    let line = (!items.is_empty()).then(|| items_line(key, items, style));
    with_line(content, key, line.as_deref())
}

#[cfg(test)]
#[path = "header_tests.rs"]
mod tests;
