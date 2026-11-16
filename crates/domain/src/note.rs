//! Résumé d'une note, tel que l'affiche la liste.

use crate::FileName;
use crate::title::displayed_title;

/// Date de dernière modification, en millisecondes depuis le 1er janvier 1970.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Modified(pub u64);

/// Une note telle que l'affiche la liste.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteSummary {
    pub file_name: FileName,
    pub title: String,
    pub modified: Modified,
}

impl NoteSummary {
    #[must_use]
    pub fn new(file_name: FileName, content: &str, modified: Modified) -> Self {
        Self {
            file_name,
            title: displayed_title(content),
            modified,
        }
    }
}

/// Les notes, la plus récemment modifiée en premier ; à date égale, par nom de fichier.
#[must_use]
pub fn sort_by_recent(mut notes: Vec<NoteSummary>) -> Vec<NoteSummary> {
    notes.sort_by(|a, b| {
        b.modified
            .cmp(&a.modified)
            .then_with(|| a.file_name.cmp(&b.file_name))
    });
    notes
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::FileName;

    fn summary(name: &str, modified: u64) -> NoteSummary {
        NoteSummary::new(
            FileName::parse(name).unwrap(),
            "# Titre",
            Modified(modified),
        )
    }

    #[test]
    fn summary_shows_the_displayed_title() {
        let note = NoteSummary::new(
            FileName::parse("x.md").unwrap(),
            "sans titre ici",
            Modified(0),
        );
        assert_eq!(note.title, "Sans titre");
    }

    #[test]
    fn most_recently_modified_notes_come_first() {
        let sorted = sort_by_recent(vec![
            summary("a.md", 1),
            summary("b.md", 3),
            summary("c.md", 2),
        ]);
        let names: Vec<_> = sorted.iter().map(|n| n.file_name.as_str()).collect();
        assert_eq!(names, ["b.md", "c.md", "a.md"]);
    }

    #[test]
    fn same_date_is_ordered_by_file_name() {
        let sorted = sort_by_recent(vec![summary("b.md", 1), summary("a.md", 1)]);
        let names: Vec<_> = sorted.iter().map(|n| n.file_name.as_str()).collect();
        assert_eq!(names, ["a.md", "b.md"]);
    }
}
