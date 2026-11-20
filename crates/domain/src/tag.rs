//! Étiquettes d'une note, lues dans son en-tête, et leur décompte dans l'espace de travail.

use std::collections::BTreeMap;

use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

use crate::front_matter::{self, split};

const TAGS_KEY: &str = "tags";
const LIST_ITEM: char = '-';
const QUOTES: [char; 2] = ['"', '\''];
const HASH: char = '#';

/// Les étiquettes de la note, dans l'ordre de l'en-tête : `tags: [a, b]`, `tags: a, b`,
/// ou une liste YAML (`- a` sur chaque ligne qui suit `tags:`). Guillemets et `#` de tête
/// retirés ; une étiquette vide ou répétée est ignorée.
#[must_use]
pub fn tags(content: &str) -> Vec<String> {
    let Some(yaml) = split(content).0 else {
        return Vec::new();
    };
    let mut lines = yaml.lines();
    let Some(value) = lines.by_ref().find_map(tags_value) else {
        return Vec::new();
    };
    let words: Vec<&str> = match value.trim_start().strip_prefix('[') {
        Some(rest) => rest
            .split_once(']')
            .map_or(rest, |(inside, _)| inside)
            .split(',')
            .collect(),
        None if without_comment(value).trim().is_empty() => lines.map_while(list_item).collect(),
        None => without_comment(value).split(',').collect(),
    };
    let mut found: Vec<String> = Vec::new();
    for word in words.into_iter().map(cleaned) {
        if !word.is_empty() && !found.iter().any(|tag| tag == word) {
            found.push(word.to_owned());
        }
    }
    found
}

/// Les signes qu'une étiquette écrite par l'application ne peut pas contenir : ils changeraient
/// le sens de la liste `tags: [a, b]` de l'en-tête.
const UNWRITABLE: [char; 10] = [',', '[', ']', '{', '}', ':', '"', '\'', '\n', '\r'];

/// L'étiquette telle que l'application l'écrit dans un en-tête : sans espaces autour ni `#` de
/// tête ; rien si elle est vide ou contient un signe qui changerait le sens de la liste.
#[must_use]
pub fn writable_tag(tag: &str) -> Option<String> {
    let tag = tag.trim().trim_start_matches(HASH).trim();
    (!tag.is_empty() && !tag.contains(UNWRITABLE)).then(|| tag.to_owned())
}

/// Vrai si les deux étiquettes sont la même, majuscules et accents ignorés.
#[must_use]
pub fn same_tag(a: &str, b: &str) -> bool {
    sort_key(a) == sort_key(b)
}

/// La note avec `new_tags` pour étiquettes, le reste du texte inchangé : la clé `tags` de son
/// en-tête réécrite à sa place (`tags: [a, b]`, la liste YAML qui la suivait retirée), ajoutée
/// après les autres clés, ou retirée si `new_tags` est vide (et l'en-tête avec elle s'il ne
/// contient plus rien) ; un en-tête est créé s'il n'y en a pas.
#[must_use]
pub fn retagged(content: &str, new_tags: &[String]) -> String {
    let line = (!new_tags.is_empty()).then(|| format!("{TAGS_KEY}: [{}]", new_tags.join(", ")));
    front_matter::with_key_line(content, tags_lines, line.as_deref())
}

/// Combien de lignes, à partir de la première, portent la clé `tags` : sa ligne, et la liste
/// YAML qui la suit si sa valeur est vide ; aucune si la première ligne ne la porte pas.
fn tags_lines(lines: &[&str]) -> usize {
    let Some(value) = lines.first().and_then(|line| tags_value(line)) else {
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

/// La valeur de la clé `tags` si la ligne la porte (au premier niveau), telle qu'écrite.
fn tags_value(line: &str) -> Option<&str> {
    let rest = line.strip_prefix(TAGS_KEY)?;
    rest.trim_start_matches([' ', '\t']).strip_prefix(':')
}

/// Le texte d'un élément de liste YAML (`- a`), ou rien si la ligne n'en est pas un.
fn list_item(line: &str) -> Option<&str> {
    let item = line.trim_start().strip_prefix(LIST_ITEM)?;
    (item.is_empty() || item.starts_with([' ', '\t'])).then(|| without_comment(item))
}

/// Le texte sans son commentaire YAML : ce qui suit un `#` précédé d'un blanc.
fn without_comment(value: &str) -> &str {
    value
        .match_indices(HASH)
        .find(|&(at, _)| value[..at].ends_with([' ', '\t']))
        .map_or(value, |(at, _)| &value[..at])
}

fn cleaned(word: &str) -> &str {
    let word = word.trim();
    let unquoted = word
        .strip_prefix(QUOTES)
        .and_then(|rest| rest.strip_suffix(QUOTES))
        .unwrap_or(word);
    unquoted.trim().trim_start_matches(HASH).trim()
}

/// Chaque étiquette avec son nombre de notes, par ordre alphabétique (majuscules et accents
/// ignorés, puis tels qu'écrits).
#[must_use]
pub fn tag_counts<'a>(notes: impl IntoIterator<Item = &'a [String]>) -> Vec<(String, usize)> {
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    for tags in notes {
        for tag in tags {
            *counts.entry(tag).or_default() += 1;
        }
    }
    let mut sorted: Vec<(String, usize)> = counts
        .into_iter()
        .map(|(tag, count)| (tag.to_owned(), count))
        .collect();
    sorted.sort_by_cached_key(|(tag, _)| (sort_key(tag), tag.clone()));
    sorted
}

/// Le texte (étiquette, titre) en minuscules et sans accents, pour le classement alphabétique.
pub(crate) fn sort_key(tag: &str) -> String {
    tag.chars()
        .flat_map(char::to_lowercase)
        .nfd()
        .filter(|c| !is_combining_mark(*c))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_note_without_header_has_no_tag() {
        assert!(tags("# T\ntags: [a]").is_empty());
        assert!(tags("---\npinned: true\n---\n# T").is_empty());
    }

    #[test]
    fn tags_are_read_from_an_inline_list() {
        assert_eq!(
            tags("---\ntags: [perso, loisirs]\n---\n# T"),
            ["perso", "loisirs"]
        );
        assert_eq!(tags("---\ntags : [ a ,b ] # c\n---"), ["a", "b"]);
        assert_eq!(tags("---\ntags: [a, b\n---"), ["a", "b"]);
    }

    #[test]
    fn tags_are_read_from_a_plain_value() {
        assert_eq!(tags("---\ntags: perso\n---"), ["perso"]);
        assert_eq!(
            tags("---\ntags: perso, loisirs # mes étiquettes\n---"),
            ["perso", "loisirs"]
        );
    }

    #[test]
    fn tags_are_read_from_a_yaml_list() {
        let note = "---\ntitle: x\ntags:\n  - perso\n  -   loisirs  # bien\n- voyage\n-\nnext: 1\n- autre\n---";
        assert_eq!(tags(note), ["perso", "loisirs", "voyage"]);
        assert_eq!(tags("---\ntags:\n  -perso\n---"), Vec::<String>::new());
        assert_eq!(tags("---\ntags:\n\t- a\n---"), ["a"]);
        assert_eq!(tags("---\ntags:\n  -\ta\n---"), ["a"]);
    }

    #[test]
    fn quotes_and_hashes_are_removed_and_repeats_ignored() {
        assert_eq!(
            tags("---\ntags: [\"perso\", 'loisirs', #voyage, perso, \"\", ' ']\n---"),
            ["perso", "loisirs", "voyage"]
        );
        assert_eq!(tags("---\ntags: [#a, b#c]\n---"), ["a", "b#c"]);
        assert_eq!(tags("---\ntags: \"a\n---"), ["\"a"]);
    }

    #[test]
    fn only_the_top_level_tags_key_counts() {
        assert!(tags("---\n  tags: [a]\n---").is_empty());
        assert!(tags("---\ntagsx: [a]\n---").is_empty());
        assert!(tags("---\ntags: # rien\n---").is_empty());
        assert_eq!(tags("---\ntags: [a]\ntags: [b]\n---"), ["a"]);
        assert_eq!(tags("---\r\ntags: [a]\r\n---\r\n"), ["a"]);
    }

    #[test]
    fn tags_are_counted_and_sorted_alphabetically() {
        let a = vec!["perso".to_owned(), "Loisirs".to_owned()];
        let b = vec!["perso".to_owned(), "été".to_owned(), "loisirs".to_owned()];
        let counts = tag_counts([a.as_slice(), b.as_slice()]);
        assert_eq!(
            counts,
            [
                ("été".to_owned(), 1),
                ("Loisirs".to_owned(), 1),
                ("loisirs".to_owned(), 1),
                ("perso".to_owned(), 2),
            ]
        );
    }

    #[test]
    fn a_tag_is_written_only_without_signs_that_would_change_the_list() {
        assert_eq!(writable_tag("  #maison "), Some("maison".to_owned()));
        assert_eq!(
            writable_tag("liste de courses"),
            Some("liste de courses".to_owned())
        );
        for refused in [
            "", " # ", "a,b", "[a", "a]", "{a", "a}", "a: b", "\"a", "'a", "a\nb", "a\rb",
        ] {
            assert_eq!(writable_tag(refused), None, "{refused:?}");
        }
    }

    #[test]
    fn two_tags_are_the_same_whatever_the_case_and_accents() {
        assert!(same_tag("Été", "ete"));
        assert!(!same_tag("été", "hiver"));
    }

    fn list(tags: &[&str]) -> Vec<String> {
        tags.iter().map(|tag| (*tag).to_owned()).collect()
    }

    #[test]
    fn retagging_rewrites_the_key_in_place_whatever_its_form() {
        assert_eq!(
            retagged(
                "---\ntitle: x\ntags: [a]\npinned: true\n---\n# T",
                &list(&["a", "b"])
            ),
            "---\ntitle: x\ntags: [a, b]\npinned: true\n---\n# T"
        );
        assert_eq!(
            retagged(
                "---\ntags:\n  - a\n  - b\npinned: true\n---\n# T",
                &list(&["c"])
            ),
            "---\ntags: [c]\npinned: true\n---\n# T"
        );
        assert_eq!(
            retagged("---\ntags: a, b # mes étiquettes\n---\n# T", &list(&["a"])),
            "---\ntags: [a]\n---\n# T"
        );
        assert_eq!(
            retagged("---\r\ntags: [a]\r\n---\r\n# T", &list(&["b"])),
            "---\r\ntags: [b]\r\n---\r\n# T"
        );
        let retagged_twice = retagged("---\ntags: [a]\ntags: [z]\n---\n", &list(&["b"]));
        assert_eq!(retagged_twice, "---\ntags: [b]\ntags: [z]\n---\n");
    }

    #[test]
    fn retagging_adds_the_key_after_the_others_or_creates_the_header() {
        assert_eq!(
            retagged("---\npinned: true\n---\n# T", &list(&["a"])),
            "---\npinned: true\ntags: [a]\n---\n# T"
        );
        assert_eq!(
            retagged("# T\ntexte", &list(&["a"])),
            "---\ntags: [a]\n---\n# T\ntexte"
        );
        assert_eq!(
            retagged("# T\r\n", &list(&["a"])),
            "---\r\ntags: [a]\r\n---\r\n# T\r\n"
        );
        assert_eq!(tags(&retagged("# T", &list(&["a b", "c"]))), ["a b", "c"]);
    }

    #[test]
    fn retagging_without_tags_removes_the_key_and_an_emptied_header() {
        assert_eq!(
            retagged("---\ntags: [a]\npinned: true\n---\n# T", &[]),
            "---\npinned: true\n---\n# T"
        );
        assert_eq!(retagged("---\ntags:\n- a\n---\n# T", &[]), "# T");
        assert_eq!(
            retagged("---\ntags: [a]\n---\n---\n# T\n---", &[]),
            "---\n---\n---\n# T\n---"
        );
        assert_eq!(retagged("# T", &[]), "# T");
        assert_eq!(retagged("---\n---\n# T", &[]), "---\n---\n# T");
        assert_eq!(
            retagged("---\npinned: true\n---\n# T", &[]),
            "---\npinned: true\n---\n# T"
        );
    }
}
