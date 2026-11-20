//! Liens vers les pièces jointes d'une note.

use crate::FileName;

const LINK_OPENINGS: [&str; 2] = ["](", "](<"];

/// Le contenu avec le lien `link` ajouté à la fin, sur sa propre ligne, après une ligne vide.
#[must_use]
pub fn with_link_appended(content: &str, link: &str) -> String {
    let kept = content.trim_end_matches(['\n', '\r', ' ', '\t']);
    if kept.is_empty() {
        format!("{link}\n")
    } else {
        format!("{kept}\n\n{link}\n")
    }
}

/// Le contenu dont les liens vers les pièces jointes suivent la note renommée.
#[must_use]
pub fn relink(content: &str, old: &FileName, new: &FileName) -> String {
    LINK_OPENINGS
        .iter()
        .fold(content.to_owned(), |text, opening| {
            let from = format!("{opening}{}/", old.attachment_folder());
            let to = format!("{opening}{}/", new.attachment_folder());
            text.replace(&from, &to)
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::FileName;

    #[test]
    fn links_follow_a_renamed_note() {
        let old = FileName::parse("ancien.md").unwrap();
        let new = FileName::parse("nouveau.md").unwrap();
        let content =
            "![Vue](ancien.assets/vue.png) et [doc](<ancien.assets/a b.pdf>)\nancien.assets/ seul";
        assert_eq!(
            relink(content, &old, &new),
            "![Vue](nouveau.assets/vue.png) et [doc](<nouveau.assets/a b.pdf>)\nancien.assets/ seul"
        );
    }

    #[test]
    fn other_links_are_untouched() {
        let old = FileName::parse("a.md").unwrap();
        let new = FileName::parse("b.md").unwrap();
        let content = "[x](aa.assets/x.png) [y](https://a.assets/y)";
        assert_eq!(relink(content, &old, &new), content);
    }

    #[test]
    fn a_link_is_appended_on_its_own_line_after_a_blank_line() {
        assert_eq!(
            with_link_appended("# A\ntexte", "![x](a.assets/x.png)"),
            "# A\ntexte\n\n![x](a.assets/x.png)\n"
        );
        assert_eq!(
            with_link_appended("# A\n\n\n", "[d](a.assets/d.pdf)"),
            "# A\n\n[d](a.assets/d.pdf)\n"
        );
        assert_eq!(
            with_link_appended(" \n", "[d](a.assets/d.pdf)"),
            "[d](a.assets/d.pdf)\n"
        );
    }
}
