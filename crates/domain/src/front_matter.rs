//! En-tête YAML optionnel d'une note.

const DELIMITER: &str = "---";

/// Sépare l'en-tête YAML (s'il existe et est fermé) du contenu de la note.
#[must_use]
pub fn split(content: &str) -> (Option<&str>, &str) {
    let Some(after_open) = strip_delimiter_line(content) else {
        return (None, content);
    };
    let mut offset = 0;
    for line in after_open.split_inclusive('\n') {
        if line.trim_end_matches(['\r', '\n']) == DELIMITER {
            let yaml = after_open[..offset].trim_end_matches(['\r', '\n']);
            return (Some(yaml), &after_open[offset + line.len()..]);
        }
        offset += line.len();
    }
    (None, content)
}

fn strip_delimiter_line(content: &str) -> Option<&str> {
    let rest = content.strip_prefix(DELIMITER)?;
    rest.strip_prefix("\r\n")
        .or_else(|| rest.strip_prefix('\n'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_without_front_matter_is_all_body() {
        assert_eq!(split("# Titre\ntexte"), (None, "# Titre\ntexte"));
    }

    #[test]
    fn front_matter_is_separated_from_body() {
        assert_eq!(
            split("---\npinned: true\n---\n# Titre"),
            (Some("pinned: true"), "# Titre")
        );
    }

    #[test]
    fn unclosed_front_matter_is_body() {
        assert_eq!(
            split("---\npinned: true\n# Titre"),
            (None, "---\npinned: true\n# Titre")
        );
    }

    #[test]
    fn windows_line_endings_are_understood() {
        assert_eq!(
            split("---\r\na: 1\r\n---\r\ntexte"),
            (Some("a: 1"), "texte")
        );
    }
}
