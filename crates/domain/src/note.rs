//! Résumé d'une note, tel que l'affiche la liste.

use crate::NotePath;
use crate::front_matter::is_pinned;
use crate::title::displayed_title;

/// Date de dernière modification, en millisecondes depuis le 1er janvier 1970.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Modified(pub u64);

/// Une note telle que l'affiche la liste.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteSummary {
    path: NotePath,
    title: String,
    modified: Modified,
    pinned: bool,
}

impl NoteSummary {
    /// Le résumé d'une note : son titre affiché et son épinglage sont tirés de son contenu.
    #[must_use]
    pub fn new(path: NotePath, content: &str, modified: Modified) -> Self {
        Self {
            path,
            title: displayed_title(content),
            modified,
            pinned: is_pinned(content),
        }
    }

    /// La note est épinglée en tête de liste.
    #[must_use]
    pub fn is_pinned(&self) -> bool {
        self.pinned
    }

    /// Le dossier et le nom de fichier de la note.
    #[must_use]
    pub fn path(&self) -> &NotePath {
        &self.path
    }

    /// Le titre affiché : le titre `#` de la note, ou « Sans titre ».
    #[must_use]
    pub fn title(&self) -> &str {
        &self.title
    }

    /// La date de dernière modification.
    #[must_use]
    pub fn modified(&self) -> Modified {
        self.modified
    }
}

/// Les notes, la plus récemment modifiée en premier ; à date égale, par chemin.
#[must_use]
pub fn sort_by_recent(mut notes: Vec<NoteSummary>) -> Vec<NoteSummary> {
    notes.sort_by(|a, b| {
        b.modified
            .cmp(&a.modified)
            .then_with(|| a.path.cmp(&b.path))
    });
    notes
}

/// L'ordre de la liste : les notes épinglées d'abord, puis les autres ; dans chaque groupe,
/// la plus récemment modifiée en premier.
#[must_use]
pub fn sort_pinned_first(notes: Vec<NoteSummary>) -> Vec<NoteSummary> {
    let mut sorted = sort_by_recent(notes);
    sorted.sort_by_key(|note| !note.pinned);
    sorted
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::NotePath;

    fn summary(name: &str, modified: u64) -> NoteSummary {
        NoteSummary::new(
            NotePath::parse(name).unwrap(),
            "# Titre",
            Modified(modified),
        )
    }

    #[test]
    fn summary_shows_the_displayed_title() {
        let note = NoteSummary::new(
            NotePath::parse("x.md").unwrap(),
            "sans titre ici",
            Modified(0),
        );
        assert_eq!(note.title(), "Sans titre");
    }

    #[test]
    fn most_recently_modified_notes_come_first() {
        let sorted = sort_by_recent(vec![
            summary("a.md", 1),
            summary("b.md", 3),
            summary("c.md", 2),
        ]);
        let names: Vec<_> = sorted.iter().map(|n| n.path().to_path()).collect();
        assert_eq!(names, ["b.md", "c.md", "a.md"]);
    }

    #[test]
    fn a_note_is_pinned_by_its_header() {
        let pinned = NoteSummary::new(
            NotePath::parse("x.md").unwrap(),
            "---\npinned: true\n---\n# Titre",
            Modified(0),
        );
        assert!(pinned.is_pinned());
        assert_eq!(pinned.title(), "Titre");
        assert!(!summary("y.md", 0).is_pinned());
    }

    #[test]
    fn pinned_notes_come_first_then_the_others_most_recent_first() {
        let pin = |name: &str, modified: u64| {
            NoteSummary::new(
                NotePath::parse(name).unwrap(),
                "---\npinned: true\n---\n# T",
                Modified(modified),
            )
        };
        let sorted = sort_pinned_first(vec![
            summary("a.md", 4),
            pin("b.md", 1),
            summary("c.md", 3),
            pin("d.md", 2),
        ]);
        let names: Vec<_> = sorted.iter().map(|n| n.path().to_path()).collect();
        assert_eq!(names, ["d.md", "b.md", "a.md", "c.md"]);
    }

    #[test]
    fn same_date_is_ordered_by_file_name() {
        let sorted = sort_by_recent(vec![summary("b.md", 1), summary("a.md", 1)]);
        let names: Vec<_> = sorted.iter().map(|n| n.path().to_path()).collect();
        assert_eq!(names, ["a.md", "b.md"]);
    }
}
