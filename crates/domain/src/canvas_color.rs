//! Les couleurs d'un canvas : la palette de l'application (celle de la carte mentale) écrite avec les
//! préréglages `"1"` à `"6"` du format quand il en a un, en hexadécimal `#RRGGBB` pour le reste
//! (`doc/specs/canvas-comportement.md`, § 6).

/// Pour chaque couleur de la palette, ce que le fichier écrit.
const IN_FILE: [(&str, &str); 10] = [
    ("rouge", "1"),
    ("orange", "2"),
    ("jaune", "3"),
    ("vert", "4"),
    ("turquoise", "5"),
    ("bleu", "#2563eb"),
    ("violet", "6"),
    ("rose", "#ec6aa8"),
    ("marron", "#92643a"),
    ("ardoise", "#64748b"),
];

/// Ce que le fichier écrit pour la couleur `name` de la palette ; rien si `name` n'en est pas.
#[must_use]
pub fn file_color(name: &str) -> Option<&'static str> {
    IN_FILE
        .into_iter()
        .find(|(known, _)| *known == name)
        .map(|(_, written)| written)
}

/// La couleur de la palette que désigne la valeur `written` du fichier ; rien pour une couleur
/// hors palette (elle est alors montrée et gardée telle quelle).
#[must_use]
pub fn color_name(written: &str) -> Option<&'static str> {
    IN_FILE
        .into_iter()
        .find(|(_, value)| value.eq_ignore_ascii_case(written))
        .map(|(name, _)| name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mind_map::PALETTE;

    #[test]
    fn every_color_of_the_palette_has_its_written_form_and_back() {
        for name in PALETTE {
            let written = file_color(name).unwrap();
            assert_eq!(color_name(written), Some(name));
        }
        assert_eq!(file_color("rouge"), Some("1"));
        assert_eq!(file_color("turquoise"), Some("5"));
        assert_eq!(file_color("violet"), Some("6"));
        assert_eq!(file_color("bleu"), Some("#2563eb"));
        assert_eq!(file_color("fuchsia"), None);
    }

    #[test]
    fn a_hexadecimal_is_recognised_whatever_its_case_and_other_colors_are_not() {
        assert_eq!(color_name("#2563EB"), Some("bleu"));
        assert_eq!(color_name("#FF5733"), None);
        assert_eq!(color_name("7"), None);
        assert_eq!(color_name(""), None);
    }

    #[test]
    fn the_hexadecimal_colors_are_the_ones_of_the_theme() {
        let theme = include_str!("../../../ui/src/theme.css");
        for name in PALETTE {
            let written = file_color(name).unwrap();
            if written.starts_with('#') {
                assert!(
                    theme.contains(&format!("--palette-{name}: {written};")),
                    "{name}"
                );
            }
        }
    }
}
