//! Le type de contenu de chaque élément de l'index (fiche 0034). Un seul existe pour l'instant :
//! la page, celui de toutes les notes.

/// La sorte d'élément que l'index garde pour une note.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ContentType {
    /// Le type des notes : toute note sans propriété `type:`, et, tant qu'aucun autre type
    /// n'existe, toute note dont l'en-tête en nomme un autre.
    Page,
}

impl ContentType {
    /// Tous les types de contenu : ce sur quoi porte une recherche par défaut.
    pub const ALL: [Self; 1] = [Self::Page];

    /// Le nom du type, tel que l'écrira la propriété `type:` d'un en-tête et que l'index le
    /// garde.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Page => "page",
        }
    }

    /// Le type qui porte ce nom, s'il existe.
    #[must_use]
    pub fn from_name(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|kind| kind.name() == name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_page_is_named_page() {
        assert_eq!(ContentType::Page.name(), "page");
    }

    #[test]
    fn a_type_is_found_by_its_name_only() {
        assert_eq!(ContentType::from_name("page"), Some(ContentType::Page));
        assert_eq!(ContentType::from_name("kanban"), None);
        assert_eq!(ContentType::from_name("Page"), None);
    }

    #[test]
    fn every_type_is_listed_once() {
        assert_eq!(ContentType::ALL, [ContentType::Page]);
    }
}
