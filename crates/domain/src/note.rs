//! Résumé d'une note, tel que l'affiche la liste, et le tri de la liste.

use std::cmp::Ordering;

use crate::front_matter::is_pinned;
use crate::tag::{sort_key, tags};
use crate::title::displayed_title;
use crate::{ContentType, NotePath};

/// Date de dernière modification, en millisecondes depuis le 1er janvier 1970.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Modified(pub u64);

/// Le tri de la liste : par date de modification (la plus récente d'abord), ou par titre (de A
/// à Z).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum NoteOrder {
    /// La plus récemment modifiée d'abord : l'ordre par défaut.
    #[default]
    Modified,
    /// Par titre, de A à Z, majuscules et accents ignorés.
    Title,
}

/// L'ordre de deux notes dans la liste : les épinglées d'abord, puis selon `order` ; à égalité,
/// par chemin.
#[must_use]
pub fn compare(a: &NoteSummary, b: &NoteSummary, order: NoteOrder) -> Ordering {
    let by_order = match order {
        NoteOrder::Modified => b.modified.cmp(&a.modified),
        NoteOrder::Title => sort_key(&a.title)
            .cmp(&sort_key(&b.title))
            .then_with(|| a.title.cmp(&b.title)),
    };
    b.pinned
        .cmp(&a.pinned)
        .then(by_order)
        .then_with(|| a.path.cmp(&b.path))
}

/// Les notes dans l'ordre de la liste : les épinglées d'abord, puis selon `order`.
#[must_use]
pub fn sorted(mut notes: Vec<NoteSummary>, order: NoteOrder) -> Vec<NoteSummary> {
    notes.sort_by(|a, b| compare(a, b, order));
    notes
}

/// Une note telle que l'affiche la liste.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteSummary {
    path: NotePath,
    title: String,
    modified: Modified,
    pinned: bool,
    tags: Vec<String>,
    content_type: ContentType,
    container: Option<NotePath>,
}

impl NoteSummary {
    /// Le résumé d'une note : son titre affiché, son épinglage, ses étiquettes et son type de
    /// contenu (la propriété `type:` de l'en-tête, fiche 0041) sont tirés de son contenu ; une
    /// note n'a pas de conteneur.
    #[must_use]
    pub fn new(path: NotePath, content: &str, modified: Modified) -> Self {
        Self {
            path,
            title: displayed_title(content),
            modified,
            pinned: is_pinned(content),
            tags: tags(content),
            content_type: ContentType::of(content),
            container: None,
        }
    }

    /// Le résumé d'une note dont le titre affiché, l'épinglage et les étiquettes sont déjà
    /// connus : tels que l'index les a gardés.
    #[must_use]
    pub fn indexed(
        path: NotePath,
        title: String,
        modified: Modified,
        pinned: bool,
        tags: Vec<String>,
    ) -> Self {
        Self {
            path,
            title,
            modified,
            pinned,
            tags,
            content_type: ContentType::Note,
            container: None,
        }
    }

    /// Le même résumé, avec le type de contenu et le conteneur que l'index a gardés.
    #[must_use]
    pub fn of_type(mut self, content_type: ContentType, container: Option<NotePath>) -> Self {
        self.content_type = content_type;
        self.container = container;
        self
    }

    /// Son type de contenu.
    #[must_use]
    pub fn content_type(&self) -> ContentType {
        self.content_type
    }

    /// L'élément auquel il appartient : le cahier de recherche d'une entrée ; aucun pour une
    /// note.
    #[must_use]
    pub fn container(&self) -> Option<&NotePath> {
        self.container.as_ref()
    }

    /// La note est épinglée en tête de liste.
    #[must_use]
    pub fn is_pinned(&self) -> bool {
        self.pinned
    }

    /// Les étiquettes de son en-tête, dans l'ordre où elles sont écrites.
    #[must_use]
    pub fn tags(&self) -> &[String] {
        &self.tags
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::NotePath;

    fn note(name: &str, content: &str, modified: u64) -> NoteSummary {
        NoteSummary::new(NotePath::parse(name).unwrap(), content, Modified(modified))
    }

    fn summary(name: &str, modified: u64) -> NoteSummary {
        note(name, "# Titre", modified)
    }

    fn names(notes: &[NoteSummary]) -> Vec<String> {
        notes.iter().map(|n| n.path().to_path()).collect()
    }

    #[test]
    fn summary_shows_the_displayed_title() {
        assert_eq!(note("x.md", "sans titre ici", 0).title(), "Sans titre");
    }

    #[test]
    fn an_indexed_summary_is_the_one_read_from_the_content() {
        let content = "---\ntags: [a, b]\npinned: true\n---\n# Titre";
        let read = note("x.md", content, 7);
        let indexed = NoteSummary::indexed(
            read.path().clone(),
            read.title().to_owned(),
            read.modified(),
            read.is_pinned(),
            read.tags().to_vec(),
        );
        assert_eq!(indexed, read);
    }

    #[test]
    fn a_note_is_of_the_type_its_header_declares_without_container() {
        for (content, kind) in [
            ("# Titre", ContentType::Note),
            ("---\ntype: note\n---\n# T", ContentType::Note),
            ("---\ntype: kanban\n---\n# T", ContentType::Note),
            (
                "---\ntype: cahier-de-recherche\n---\n# T",
                ContentType::ResearchNotebook,
            ),
        ] {
            let read = note("x.md", content, 0);
            assert_eq!(read.content_type(), kind);
            assert_eq!(read.container(), None);
        }
    }

    #[test]
    fn an_indexed_summary_keeps_the_type_and_container_given() {
        let board = NotePath::parse("CRM/tableau.md").unwrap();
        let card =
            note("CRM/carte.md", "# Carte", 0).of_type(ContentType::Note, Some(board.clone()));
        assert_eq!(card.container(), Some(&board));
        assert_eq!(card.title(), "Carte");
        assert_ne!(card, note("CRM/carte.md", "# Carte", 0));
    }

    #[test]
    fn a_summary_carries_its_modification_date() {
        assert_eq!(note("x.md", "# T", 5).modified(), Modified(5));
    }

    #[test]
    fn most_recently_modified_notes_come_first() {
        let sorted = sort_by_recent(vec![
            summary("a.md", 1),
            summary("b.md", 3),
            summary("c.md", 2),
        ]);
        assert_eq!(names(&sorted), ["b.md", "c.md", "a.md"]);
    }

    #[test]
    fn a_note_is_pinned_by_its_header() {
        let pinned = note("x.md", "---\npinned: true\n---\n# Titre", 0);
        assert!(pinned.is_pinned());
        assert_eq!(pinned.title(), "Titre");
        assert!(pinned.tags().is_empty());
        assert!(!summary("y.md", 0).is_pinned());
    }

    #[test]
    fn a_summary_carries_the_tags_of_its_header() {
        let tagged = note("x.md", "---\ntags: [perso, loisirs]\n---\n# Titre", 0);
        assert_eq!(tagged.tags(), ["perso", "loisirs"]);
    }

    #[test]
    fn pinned_notes_come_first_then_the_others_most_recent_first() {
        let pin = |name: &str, modified: u64| note(name, "---\npinned: true\n---\n# T", modified);
        let sorted = sorted(
            vec![
                summary("a.md", 4),
                pin("b.md", 1),
                summary("c.md", 3),
                pin("d.md", 2),
            ],
            NoteOrder::Modified,
        );
        assert_eq!(names(&sorted), ["d.md", "b.md", "a.md", "c.md"]);
    }

    #[test]
    fn the_default_order_is_by_modification_date() {
        assert_eq!(NoteOrder::default(), NoteOrder::Modified);
    }

    #[test]
    fn by_title_notes_go_from_a_to_z_ignoring_case_and_accents() {
        let sorted = sorted(
            vec![
                note("z.md", "# zèbre", 9),
                note("e.md", "# Été", 8),
                note("a.md", "# abricot", 1),
                note("f.md", "# Fraise", 7),
                note("p.md", "---\npinned: true\n---\n# Pomme", 0),
            ],
            NoteOrder::Title,
        );
        assert_eq!(names(&sorted), ["p.md", "a.md", "e.md", "f.md", "z.md"]);
    }

    #[test]
    fn by_title_case_does_not_count() {
        let sorted = sorted_by_title(&[
            ("c.md", "# cerise"),
            ("b.md", "# Banane"),
            ("a.md", "# avion"),
            ("e.md", "# ÉCLAIR"),
            ("d.md", "# dé"),
        ]);
        assert_eq!(sorted, ["a.md", "b.md", "c.md", "d.md", "e.md"]);
    }

    #[test]
    fn titles_equal_but_for_case_keep_a_fixed_order() {
        let sorted = sorted(
            vec![note("b.md", "# ete", 0), note("a.md", "# Ete", 0)],
            NoteOrder::Title,
        );
        assert_eq!(names(&sorted), ["a.md", "b.md"]);
        let same = sorted_by_title(&[("a.md", "# b"), ("b.md", "# B")]);
        assert_eq!(same, ["b.md", "a.md"]);
    }

    fn sorted_by_title(notes: &[(&str, &str)]) -> Vec<String> {
        let notes = notes.iter().map(|(n, c)| note(n, c, 0)).collect();
        names(&sorted(notes, NoteOrder::Title))
    }

    #[test]
    fn same_date_is_ordered_by_file_name() {
        let by_recent = sort_by_recent(vec![summary("b.md", 1), summary("a.md", 1)]);
        assert_eq!(names(&by_recent), ["a.md", "b.md"]);
        let in_order = sorted(
            vec![summary("b.md", 1), summary("a.md", 1)],
            NoteOrder::Modified,
        );
        assert_eq!(names(&in_order), ["a.md", "b.md"]);
    }
}
