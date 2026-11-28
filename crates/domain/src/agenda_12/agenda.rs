//! Le fichier d'un agenda 12 (format `doc/format/agenda-12.md` § 5) : un titre, le nombre de
//! colonnes de sa grille et sa vue (grille ou liste). Le texte sous son titre n'est jamais lu ni modifié.

use crate::crm::header::{self, Style};
use crate::front_matter::declared_type;
use crate::title::displayed_title;

/// La valeur de `type:` d'un agenda 12.
pub const AGENDA_TYPE: &str = "agenda-12";

const COLUMNS_KEY: &str = "colonnes";
const LAYOUT_KEY: &str = "vue";

/// Le nombre de colonnes de la grille : 3, 4 ou 6.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Columns(u32);

impl Columns {
    /// Le nombre de colonnes d'un agenda 12 qui n'en a pas choisi.
    pub const DEFAULT: Self = Self(4);

    /// Les trois choix, dans l'ordre où l'écran les propose.
    pub const ALL: [Self; 3] = [Self(3), Self(4), Self(6)];

    /// Ce nombre de colonnes ; rien s'il n'est ni 3, ni 4, ni 6.
    #[must_use]
    pub fn new(count: u32) -> Option<Self> {
        Self::ALL.into_iter().find(|columns| columns.0 == count)
    }

    /// Le nombre de colonnes.
    #[must_use]
    pub fn count(self) -> u32 {
        self.0
    }
}

/// La vue d'un agenda 12 : la grille de 12 cases, ou la liste groupée par mois.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Layout {
    /// La grille de 12 cases.
    Grid,
    /// La liste, groupée par mois.
    List,
}

impl Layout {
    /// La vue d'un agenda 12 qui n'en a pas choisi.
    pub const DEFAULT: Self = Self::Grid;

    /// Ce que le fichier écrit pour cette vue.
    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            Self::Grid => "grille",
            Self::List => "liste",
        }
    }

    /// La vue que dit ce texte du fichier ; rien s'il n'est ni `grille` ni `liste`.
    #[must_use]
    pub fn from_key(written: &str) -> Option<Self> {
        [Self::Grid, Self::List]
            .into_iter()
            .find(|layout| layout.key() == written)
    }
}

/// Un agenda 12 lu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Agenda12 {
    /// Le premier titre `#`, comme toute note ; « Sans titre » sans titre.
    pub title: String,
    /// Les colonnes de sa grille : 4 si la clé est absente ou a une autre valeur.
    pub columns: Columns,
    /// Sa vue : la grille si la clé est absente ou a une autre valeur.
    pub layout: Layout,
}

impl Agenda12 {
    /// L'agenda 12 que dit `content` ; rien si ce n'est pas une note `type: agenda-12`.
    #[must_use]
    pub fn parse(content: &str) -> Option<Self> {
        (declared_type(content) == Some(AGENDA_TYPE)).then(|| Self {
            title: displayed_title(content),
            columns: header::scalar(content, COLUMNS_KEY)
                .filter(|written| written.chars().all(|c| c.is_ascii_digit()))
                .and_then(|written| written.parse().ok())
                .and_then(Columns::new)
                .unwrap_or(Columns::DEFAULT),
            layout: header::scalar(content, LAYOUT_KEY)
                .and_then(|written| Layout::from_key(&written))
                .unwrap_or(Layout::DEFAULT),
        })
    }

    /// Le texte d'un agenda 12 neuf : l'en-tête `type: agenda-12` et le titre.
    #[must_use]
    pub fn new_content(title: &str) -> String {
        format!("---\ntype: {AGENDA_TYPE}\n---\n# {title}\n")
    }
}

/// Le texte de l'agenda 12 avec ce nombre de colonnes : la clé `colonnes` écrite à sa place, le reste
/// inchangé.
#[must_use]
pub fn with_columns(content: &str, columns: Columns) -> String {
    header::with_scalar(
        content,
        COLUMNS_KEY,
        Some(&columns.count().to_string()),
        Style::Bare,
    )
}

/// Le texte de l'agenda 12 avec cette vue : la clé `vue` écrite à sa place, le reste inchangé.
#[must_use]
pub fn with_layout(content: &str, layout: Layout) -> String {
    header::with_scalar(content, LAYOUT_KEY, Some(layout.key()), Style::Line)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_columns_are_three_four_or_six() {
        assert_eq!(Columns::new(3).map(Columns::count), Some(3));
        assert_eq!(Columns::new(4).map(Columns::count), Some(4));
        assert_eq!(Columns::new(6).map(Columns::count), Some(6));
        for other in [0, 1, 2, 5, 7, 12] {
            assert_eq!(Columns::new(other), None);
        }
        assert_eq!(Columns::DEFAULT.count(), 4);
        let all: Vec<u32> = Columns::ALL.iter().map(|c| c.count()).collect();
        assert_eq!(all, [3, 4, 6]);
    }

    #[test]
    fn an_agenda_is_read_with_its_title_and_its_columns() {
        let agenda = Agenda12::parse("---\ntype: agenda-12\ncolonnes: 6\n---\n# Salons\n").unwrap();
        assert_eq!(agenda.title, "Salons");
        assert_eq!(agenda.columns, Columns::new(6).unwrap());
    }

    #[test]
    fn an_agenda_without_columns_or_with_another_value_has_four() {
        for header in [
            "",
            "colonnes: 5\n",
            "colonnes: six\n",
            "colonnes: -3\n",
            "colonnes:\n",
        ] {
            let content = format!("---\ntype: agenda-12\n{header}---\n# Salons\n");
            assert_eq!(
                Agenda12::parse(&content).unwrap().columns,
                Columns::DEFAULT,
                "{header}"
            );
        }
    }

    #[test]
    fn leading_zeros_and_quotes_are_allowed_in_the_columns() {
        let content = "---\ntype: agenda-12\ncolonnes: '03'\n---\n# Salons\n";
        assert_eq!(
            Agenda12::parse(content).unwrap().columns,
            Columns::new(3).unwrap()
        );
    }

    #[test]
    fn an_agenda_without_title_is_shown_untitled() {
        let agenda = Agenda12::parse("---\ntype: agenda-12\n---\nTexte\n").unwrap();
        assert_eq!(agenda.title, "Sans titre");
    }

    #[test]
    fn a_note_that_is_not_an_agenda_is_not_read_as_one() {
        for content in [
            "# Salons\n",
            "---\ntype: crm\n---\n# Salons\n",
            "---\ntype: agenda-12-evenement\nmois: 1\n---\n# S\n",
        ] {
            assert_eq!(Agenda12::parse(content), None);
        }
    }

    #[test]
    fn a_new_agenda_has_its_type_and_its_title() {
        assert_eq!(
            Agenda12::new_content("Salons"),
            "---\ntype: agenda-12\n---\n# Salons\n"
        );
    }

    #[test]
    fn the_columns_are_written_in_place_and_nothing_else_changes() {
        let content =
            "---\ntype: agenda-12\ncolonnes: 4\ntags: [pro]\n---\n# Salons\n\nTexte libre\n";
        assert_eq!(
            with_columns(content, Columns::new(6).unwrap()),
            "---\ntype: agenda-12\ncolonnes: 6\ntags: [pro]\n---\n# Salons\n\nTexte libre\n"
        );
        assert_eq!(
            with_columns(
                "---\ntype: agenda-12\n---\n# Salons\n",
                Columns::new(3).unwrap()
            ),
            "---\ntype: agenda-12\ncolonnes: 3\n---\n# Salons\n"
        );
    }

    #[test]
    fn the_layout_is_the_grid_or_the_list_and_the_grid_by_default() {
        assert_eq!(Layout::DEFAULT, Layout::Grid);
        assert_eq!(Layout::Grid.key(), "grille");
        assert_eq!(Layout::List.key(), "liste");
        assert_eq!(Layout::from_key("grille"), Some(Layout::Grid));
        assert_eq!(Layout::from_key("liste"), Some(Layout::List));
        for other in ["", "Liste", "tableau", "grid"] {
            assert_eq!(Layout::from_key(other), None, "{other}");
        }
    }

    #[test]
    fn an_agenda_is_read_with_its_layout() {
        let list = Agenda12::parse("---\ntype: agenda-12\nvue: liste\n---\n# S\n").unwrap();
        assert_eq!(list.layout, Layout::List);
        let quoted = Agenda12::parse("---\ntype: agenda-12\nvue: 'liste'\n---\n# S\n").unwrap();
        assert_eq!(quoted.layout, Layout::List);
    }

    #[test]
    fn an_agenda_without_layout_or_with_another_value_shows_the_grid() {
        for header in ["", "vue: tableau\n", "vue: 3\n", "vue:\n", "vue: grille\n"] {
            let content = format!("---\ntype: agenda-12\n{header}---\n# Salons\n");
            assert_eq!(
                Agenda12::parse(&content).unwrap().layout,
                Layout::Grid,
                "{header}"
            );
        }
    }

    #[test]
    fn the_layout_is_written_in_place_and_nothing_else_changes() {
        let content = "---\ntype: agenda-12\ncolonnes: 4\ntags: [pro]\n---\n# Salons\n\nTexte\n";
        assert_eq!(
            with_layout(content, Layout::List),
            "---\ntype: agenda-12\ncolonnes: 4\ntags: [pro]\nvue: liste\n---\n# Salons\n\nTexte\n"
        );
        assert_eq!(
            with_layout(
                "---\ntype: agenda-12\nvue: liste\n---\n# Salons\n",
                Layout::Grid
            ),
            "---\ntype: agenda-12\nvue: grille\n---\n# Salons\n"
        );
    }
}
