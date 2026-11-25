//! Le texte sous le titre d'une fiche : les notes libres d'une entreprise ou d'une personne, le
//! texte d'une action, le texte d'un projet (gardé tel quel, jamais montré).

use crate::title::text_start;

/// Le texte qui suit la ligne du titre, tel qu'écrit.
pub(crate) fn text(content: &str) -> &str {
    &content[text_start(content)..]
}

/// Le texte de la fiche avec `new_text` sous son titre : tout ce qui précède, en-tête et titre
/// compris, reste identique ; `new_text` remplace ce qui suivait.
pub(crate) fn with_text(content: &str, new_text: &str) -> String {
    let head = &content[..text_start(content)];
    let separator = if !head.is_empty() && !new_text.is_empty() && !head.ends_with(['\n', '\r']) {
        "\n"
    } else {
        ""
    };
    format!("{head}{separator}{new_text}")
}

/// Les notes libres que dit `text` : le texte sans les lignes vides autour.
pub(crate) fn notes_of(text: &str) -> String {
    text.trim_matches(['\n', '\r']).trim_end().to_owned()
}

/// Le texte sous le titre qui écrit ces notes : une ligne vide, les notes, un retour à la ligne ;
/// rien si les notes sont vides.
pub(crate) fn written_notes(notes: &str) -> String {
    let notes = notes.trim();
    if notes.is_empty() {
        String::new()
    } else {
        format!("\n{notes}\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_text_under_the_title_is_read_and_replaced_alone() {
        let content = "---\ntype: crm-projet\n---\n# Refonte\n\nNotes.\n";
        assert_eq!(text(content), "\nNotes.\n");
        assert_eq!(
            with_text(content, "\nAutres.\n"),
            "---\ntype: crm-projet\n---\n# Refonte\n\nAutres.\n"
        );
        assert_eq!(
            with_text(content, ""),
            "---\ntype: crm-projet\n---\n# Refonte\n"
        );
    }

    #[test]
    fn a_title_on_the_last_line_gets_a_line_break_before_new_text() {
        assert_eq!(with_text("# T", "x\n"), "# T\nx\n");
        assert_eq!(with_text("# T", ""), "# T");
        assert_eq!(with_text("", "x"), "x");
        assert_eq!(with_text("# T\r\nx", "y"), "# T\r\ny");
    }

    #[test]
    fn notes_are_written_between_blank_lines_and_read_without_them() {
        assert_eq!(written_notes("  Un\ndeux \n"), "\nUn\ndeux\n");
        assert_eq!(written_notes(" \n "), "");
        assert_eq!(notes_of("\n\nUn\ndeux  \n\n"), "Un\ndeux");
        assert_eq!(notes_of("  indenté\n"), "  indenté");
        assert_eq!(notes_of(""), "");
    }
}
