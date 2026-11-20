//! En-tête YAML optionnel d'une note, et l'épinglage qu'il porte.

const DELIMITER: &str = "---";
const PINNED_KEY: &str = "pinned";
const PINNED_LINE: &str = "pinned: true";
/// Valeurs YAML qui épinglent la note, sans tenir compte de la casse.
const PINNED_VALUES: [&str; 2] = ["true", "yes"];
/// La clé qui déclare le type de contenu d'une note (fiches 0034 et 0041).
const TYPE_KEY: &str = "type";
/// Les guillemets permis autour d'une valeur YAML simple.
const QUOTES: [char; 2] = ['"', '\''];
const COMMENT: char = '#';

/// Sépare l'en-tête YAML (s'il existe et est fermé) du contenu de la note.
#[must_use]
pub fn split(content: &str) -> (Option<&str>, &str) {
    match Header::of(content) {
        Some(header) => {
            let yaml = &content[header.yaml_start..header.close_start];
            (
                Some(yaml.trim_end_matches(['\r', '\n'])),
                &content[header.close_end..],
            )
        }
        None => (None, content),
    }
}

/// L'en-tête d'une note, repéré par ses positions dans le texte.
struct Header<'a> {
    content: &'a str,
    /// Début de la première ligne YAML, juste après le délimiteur d'ouverture.
    yaml_start: usize,
    /// Début de la ligne du délimiteur de fermeture.
    close_start: usize,
    /// Fin de la ligne du délimiteur de fermeture : début du contenu.
    close_end: usize,
}

impl<'a> Header<'a> {
    fn of(content: &'a str) -> Option<Self> {
        let after_open = strip_delimiter_line(content)?;
        let yaml_start = content.len() - after_open.len();
        let mut offset = yaml_start;
        for line in after_open.split_inclusive('\n') {
            if line.trim_end_matches(['\r', '\n']) == DELIMITER {
                return Some(Self {
                    content,
                    yaml_start,
                    close_start: offset,
                    close_end: offset + line.len(),
                });
            }
            offset += line.len();
        }
        None
    }

    /// Les lignes YAML, chacune avec sa fin de ligne.
    fn lines(&self) -> std::str::SplitInclusive<'a, char> {
        self.content[self.yaml_start..self.close_start].split_inclusive('\n')
    }

    /// La fin de ligne du délimiteur d'ouverture, reprise pour une ligne ajoutée.
    fn newline(&self) -> &'a str {
        let opening = &self.content[..self.yaml_start];
        &opening[opening.trim_end_matches(['\r', '\n']).len()..]
    }

    /// La note avec ces lignes YAML à la place des anciennes.
    fn with_yaml(&self, yaml: &str) -> String {
        let (before, after) = (
            &self.content[..self.yaml_start],
            &self.content[self.close_start..],
        );
        format!("{before}{yaml}{after}")
    }
}

/// La valeur de la clé `key` si la ligne la porte (au premier niveau), commentaire retiré.
fn key_value<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let rest = line.strip_prefix(key)?;
    let value = rest.trim_start_matches([' ', '\t']).strip_prefix(':')?;
    value.split(COMMENT).next().map(str::trim)
}

/// La valeur de la clé `pinned` si la ligne la porte (au premier niveau), commentaire retiré.
fn pinned_value(line: &str) -> Option<&str> {
    key_value(line, PINNED_KEY)
}

/// Le type de contenu que l'en-tête déclare par sa clé `type:` (la première, au premier
/// niveau), commentaire et guillemets retirés ; rien sans en-tête ni clé.
#[must_use]
pub fn declared_type(content: &str) -> Option<&str> {
    Header::of(content)?
        .lines()
        .find_map(|line| key_value(line, TYPE_KEY))
        .map(|value| value.trim_matches(QUOTES))
}

fn line_ending(line: &str) -> &str {
    &line[line.trim_end_matches(['\r', '\n']).len()..]
}

/// La note est épinglée : son en-tête porte `pinned: true` (ou `yes`).
#[must_use]
pub fn is_pinned(content: &str) -> bool {
    Header::of(content).is_some_and(|header| {
        header
            .lines()
            .filter_map(pinned_value)
            .any(|value| PINNED_VALUES.iter().any(|v| value.eq_ignore_ascii_case(v)))
    })
}

/// La note épinglée : `pinned: true` ajouté à son en-tête (créé s'il n'existe pas),
/// le reste du texte inchangé.
#[must_use]
pub fn pinned(content: &str) -> String {
    if is_pinned(content) {
        return content.to_owned();
    }
    let Some(header) = Header::of(content) else {
        let newline = if content.contains("\r\n") {
            "\r\n"
        } else {
            "\n"
        };
        return format!("{DELIMITER}{newline}{PINNED_LINE}{newline}{DELIMITER}{newline}{content}");
    };
    let mut yaml = String::new();
    let mut replaced = false;
    for line in header.lines() {
        if !replaced && pinned_value(line).is_some() {
            yaml.push_str(PINNED_LINE);
            yaml.push_str(line_ending(line));
            replaced = true;
        } else {
            yaml.push_str(line);
        }
    }
    if !replaced {
        yaml.push_str(PINNED_LINE);
        yaml.push_str(header.newline());
    }
    header.with_yaml(&yaml)
}

/// La note désépinglée : la clé `pinned` retirée de son en-tête, et l'en-tête retiré
/// s'il ne contient plus rien. Une note sans clé `pinned` reste telle quelle.
#[must_use]
pub fn unpinned(content: &str) -> String {
    let Some(header) = Header::of(content) else {
        return content.to_owned();
    };
    if header.lines().all(|line| pinned_value(line).is_none()) {
        return content.to_owned();
    }
    let yaml: String = header
        .lines()
        .filter(|line| pinned_value(line).is_none())
        .collect();
    let rest = &content[header.close_end..];
    // Un en-tête vide est retiré, sauf si le texte en dessous passerait alors pour un en-tête.
    if yaml.trim().is_empty() && Header::of(rest).is_none() {
        rest.to_owned()
    } else {
        header.with_yaml(&yaml)
    }
}

/// La note dont la clé de l'en-tête que repère `key_lines` est remplacée par `line`, à sa place
/// (toutes ses lignes retirées), ajoutée après les autres clés si l'en-tête ne l'a pas, ou retirée
/// si `line` est vide ; un en-tête est créé pour une ligne ajoutée à une note qui n'en a pas, et
/// retiré s'il ne contient plus rien une fois la clé retirée. Seule la première occurrence de la
/// clé compte. `key_lines` dit combien des lignes données, à partir de la première, portent la
/// clé (aucune si la première ne la porte pas).
pub(crate) fn with_key_line(
    content: &str,
    key_lines: impl Fn(&[&str]) -> usize,
    line: Option<&str>,
) -> String {
    let Some(header) = Header::of(content) else {
        let Some(line) = line else {
            return content.to_owned();
        };
        let newline = if content.contains("\r\n") {
            "\r\n"
        } else {
            "\n"
        };
        return format!("{DELIMITER}{newline}{line}{newline}{DELIMITER}{newline}{content}");
    };
    let lines: Vec<&str> = header.lines().collect();
    let found = (0..lines.len()).find_map(|at| {
        let count = key_lines(&lines[at..]);
        (count > 0).then_some((at, count))
    });
    let mut yaml: String = match found {
        Some((at, _)) => lines[..at].concat(),
        None => lines.concat(),
    };
    match (found, line) {
        (Some((at, _)), Some(line)) => {
            yaml.push_str(line);
            yaml.push_str(line_ending(lines[at]));
        }
        (None, Some(line)) => {
            yaml.push_str(line);
            yaml.push_str(header.newline());
        }
        (None, None) => return content.to_owned(),
        (Some(_), None) => {}
    }
    if let Some((at, count)) = found {
        yaml.push_str(&lines[at + count..].concat());
    }
    let rest = &content[header.close_end..];
    // Un en-tête vidé est retiré, sauf si le texte en dessous passerait alors pour un en-tête.
    if line.is_none() && yaml.trim().is_empty() && Header::of(rest).is_none() {
        rest.to_owned()
    } else {
        header.with_yaml(&yaml)
    }
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
    fn unpinning_keeps_an_empty_header_when_the_text_below_would_pass_for_one() {
        let note = "---\npinned: true\n---\n---\n# T\n---";
        assert_eq!(unpinned(note), "---\n---\n---\n# T\n---");
    }

    #[test]
    fn a_note_declares_its_type_by_the_first_type_key_of_its_header() {
        let declared = |content| declared_type(content);
        assert_eq!(declared("---\ntype: kanban\n---\n# T"), Some("kanban"));
        assert_eq!(
            declared("---\ntags: [a]\ntype :  \"cahier\" # c\ntype: autre\n---"),
            Some("cahier")
        );
        assert_eq!(declared("---\ntype: 'cahier'\n---"), Some("cahier"));
        assert_eq!(declared("---\ntypes: a\n  type: b\n---"), None);
        assert_eq!(declared("# T\ntype: kanban"), None);
        assert_eq!(declared("---\ntype: kanban"), None);
    }

    #[test]
    fn a_note_is_pinned_by_its_header() {
        assert!(is_pinned("---\npinned: true\n---\n# T"));
        assert!(is_pinned(
            "---\ntags: [a]\npinned:   YES # épinglée\n---\n# T"
        ));
        assert!(is_pinned("---\npinned : True\n---"));
        assert!(!is_pinned("---\npinned: false\n---\n# T"));
        assert!(!is_pinned("# T\npinned: true"));
        assert!(!is_pinned("---\n  pinned: true\n---\n"));
        assert!(!is_pinned("---\npinnedx: true\n---\n"));
        assert!(!is_pinned("---\npinned: true"));
    }

    #[test]
    fn pinning_creates_a_header_when_there_is_none() {
        assert_eq!(
            pinned("# Titre\ntexte"),
            "---\npinned: true\n---\n# Titre\ntexte"
        );
        assert_eq!(pinned(""), "---\npinned: true\n---\n");
    }

    #[test]
    fn pinning_adds_the_key_after_the_other_keys() {
        assert_eq!(
            pinned("---\ntags: [a, b]   # mes étiquettes\n---\n# T"),
            "---\ntags: [a, b]   # mes étiquettes\npinned: true\n---\n# T"
        );
    }

    #[test]
    fn pinning_replaces_a_false_value_in_place() {
        assert_eq!(
            pinned("---\npinned: false\ntags: [a]\n---\n# T"),
            "---\npinned: true\ntags: [a]\n---\n# T"
        );
    }

    #[test]
    fn pinning_a_pinned_note_changes_nothing() {
        let note = "---\npinned: yes\n---\n# T";
        assert_eq!(pinned(note), note);
    }

    #[test]
    fn pinning_keeps_windows_line_endings() {
        assert_eq!(
            pinned("---\r\na: 1\r\n---\r\n# T"),
            "---\r\na: 1\r\npinned: true\r\n---\r\n# T"
        );
        assert_eq!(pinned("# T\r\nx"), "---\r\npinned: true\r\n---\r\n# T\r\nx");
    }

    #[test]
    fn pinning_fills_an_empty_header() {
        assert_eq!(pinned("---\n---\n# T"), "---\npinned: true\n---\n# T");
    }

    #[test]
    fn pinning_a_header_that_ends_the_note() {
        assert_eq!(pinned("---\na: 1\n---"), "---\na: 1\npinned: true\n---");
    }

    #[test]
    fn unpinning_removes_only_the_key() {
        assert_eq!(
            unpinned("---\ntags: [a]\npinned: true\ndate: 2026\n---\n# T"),
            "---\ntags: [a]\ndate: 2026\n---\n# T"
        );
    }

    #[test]
    fn unpinning_removes_a_header_left_empty() {
        assert_eq!(unpinned("---\npinned: true\n---\n# T"), "# T");
        assert_eq!(unpinned("---\r\npinned: true\r\n\r\n---\r\n# T"), "# T");
    }

    #[test]
    fn unpinning_a_note_whose_header_has_no_pin_changes_nothing() {
        assert_eq!(unpinned("---\n---\n# T"), "---\n---\n# T");
    }

    #[test]
    fn unpinning_a_note_without_header_changes_nothing() {
        assert_eq!(unpinned("# T\npinned: true"), "# T\npinned: true");
        assert_eq!(unpinned("---\nx: 1\n---\n# T"), "---\nx: 1\n---\n# T");
    }

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
