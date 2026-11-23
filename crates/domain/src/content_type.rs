//! Le type de contenu de chaque élément de l'index (fiches 0034, 0037 et 0041) : la note, le
//! cahier de recherche, et l'entrée d'un cahier de recherche.

use crate::front_matter::declared_type;

/// La sorte d'élément que l'index garde.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ContentType {
    /// Le type des notes : toute note dont l'en-tête ne déclare pas un autre type connu.
    Note,
    /// Une note où l'on ne fait qu'ajouter des entrées datées, déclarée par
    /// `type: cahier-de-recherche` dans son en-tête.
    ResearchNotebook,
    /// Une note montrée en carte, déclarée par `type: carte-mentale` dans son en-tête
    /// (fiche 0050).
    MindMap,
    /// Une entrée d'un cahier de recherche : elle n'a pas de fichier à elle, son cahier est son
    /// conteneur. Aucun en-tête ne la déclare.
    Entry,
}

impl ContentType {
    /// Tous les types de contenu : ce sur quoi porte une recherche par défaut.
    pub const ALL: [Self; 4] = [
        Self::Note,
        Self::ResearchNotebook,
        Self::MindMap,
        Self::Entry,
    ];

    /// Les types qu'une note (un fichier) peut avoir.
    pub const FILES: [Self; 3] = [Self::Note, Self::ResearchNotebook, Self::MindMap];

    /// Le nom du type, tel que l'écrit la propriété `type:` d'un en-tête et que l'index le
    /// garde.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::ResearchNotebook => "cahier-de-recherche",
            Self::MindMap => "carte-mentale",
            Self::Entry => "entree",
        }
    }

    /// Le type qui porte ce nom, s'il existe.
    #[must_use]
    pub fn from_name(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|kind| kind.name() == name)
    }

    /// Le type de la note de texte `content` : celui que déclare son en-tête parmi ceux d'une
    /// note ; la note sinon, même si l'en-tête nomme un type inconnu (`type: kanban`) : aucune
    /// note ne disparaît de la liste ni de la recherche.
    #[must_use]
    pub fn of(content: &str) -> Self {
        declared_type(content)
            .and_then(|name| Self::FILES.into_iter().find(|kind| kind.name() == name))
            .unwrap_or(Self::Note)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_type_has_its_name() {
        let names: Vec<_> = ContentType::ALL.map(ContentType::name).into();
        assert_eq!(
            names,
            ["note", "cahier-de-recherche", "carte-mentale", "entree"]
        );
    }

    #[test]
    fn a_type_is_found_by_its_name_only() {
        for kind in ContentType::ALL {
            assert_eq!(ContentType::from_name(kind.name()), Some(kind));
        }
        assert_eq!(ContentType::from_name("kanban"), None);
        assert_eq!(ContentType::from_name("Note"), None);
    }

    #[test]
    fn only_notes_research_notebooks_and_mind_maps_are_files() {
        assert_eq!(
            ContentType::FILES,
            [
                ContentType::Note,
                ContentType::ResearchNotebook,
                ContentType::MindMap
            ]
        );
    }

    #[test]
    fn a_note_is_of_the_type_its_header_declares_among_those_of_a_note() {
        let of = ContentType::of;
        assert_eq!(
            of("---\ntype: cahier-de-recherche\n---\n# C"),
            ContentType::ResearchNotebook
        );
        assert_eq!(
            of("---\ntype: carte-mentale\n---\n# C"),
            ContentType::MindMap
        );
        assert_eq!(of("# Sans en-tête"), ContentType::Note);
        assert_eq!(of("---\ntype: note\n---\n# N"), ContentType::Note);
        assert_eq!(of("---\ntype: kanban\n---\n# K"), ContentType::Note);
        assert_eq!(of("---\ntype: entree\n---\n# E"), ContentType::Note);
    }
}
