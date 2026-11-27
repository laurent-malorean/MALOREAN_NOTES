//! Le type de contenu de chaque élément de l'index (fiches 0034, 0037 et 0041) : la note, le
//! cahier de recherche, et l'entrée d'un cahier de recherche.

use crate::FileName;
use crate::agenda_12::{AGENDA_TYPE, EVENT_TYPE};
use crate::crm::CrmKind;
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
    /// Un canvas : un fichier `.canvas`, reconnu à son extension et non à un en-tête (fiche 0052).
    Canvas,
    /// Une entrée d'un cahier de recherche : elle n'a pas de fichier à elle, son cahier est son
    /// conteneur. Aucun en-tête ne la déclare.
    Entry,
    /// Un nœud d'une carte mentale : il n'a pas de fichier à lui, sa carte est son conteneur
    /// (fiche 0050).
    Node,
    /// Un CRM, déclaré par `type: crm` (fiche 0057).
    Crm,
    /// Une entreprise d'un CRM, déclarée par `type: crm-entreprise` ; son CRM est son conteneur.
    CrmCompany,
    /// Une personne d'un CRM, déclarée par `type: crm-personne` ; son CRM est son conteneur.
    CrmPerson,
    /// Une action d'un CRM, déclarée par `type: crm-action` ; son CRM est son conteneur.
    CrmAction,
    /// Un projet d'un CRM, déclaré par `type: crm-projet` ; son CRM est son conteneur.
    CrmProject,
    /// Un agenda 12, déclaré par `type: agenda-12` (fiche 0104).
    Agenda12,
    /// Un événement d'un agenda 12, déclaré par `type: agenda-12-evenement` ; son agenda 12 est son
    /// conteneur.
    Agenda12Event,
}

impl ContentType {
    /// Tous les types de contenu : ce sur quoi porte une recherche par défaut.
    pub const ALL: [Self; 13] = [
        Self::Note,
        Self::ResearchNotebook,
        Self::MindMap,
        Self::Canvas,
        Self::Entry,
        Self::Node,
        Self::Crm,
        Self::CrmCompany,
        Self::CrmPerson,
        Self::CrmAction,
        Self::CrmProject,
        Self::Agenda12,
        Self::Agenda12Event,
    ];

    /// Les types qu'une note (un fichier) peut avoir.
    pub const FILES: [Self; 11] = [
        Self::Note,
        Self::ResearchNotebook,
        Self::MindMap,
        Self::Canvas,
        Self::Crm,
        Self::CrmCompany,
        Self::CrmPerson,
        Self::CrmAction,
        Self::CrmProject,
        Self::Agenda12,
        Self::Agenda12Event,
    ];

    /// Le nom du type, tel que l'écrit la propriété `type:` d'un en-tête et que l'index le
    /// garde.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::ResearchNotebook => "cahier-de-recherche",
            Self::MindMap => "carte-mentale",
            Self::Canvas => "canvas",
            Self::Entry => "entree",
            Self::Node => "noeud",
            Self::Crm => CrmKind::Crm.name(),
            Self::CrmCompany => CrmKind::Company.name(),
            Self::CrmPerson => CrmKind::Person.name(),
            Self::CrmAction => CrmKind::Action.name(),
            Self::CrmProject => CrmKind::Project.name(),
            Self::Agenda12 => AGENDA_TYPE,
            Self::Agenda12Event => EVENT_TYPE,
        }
    }

    /// La sorte de note du CRM que ce type de contenu désigne ; rien pour le reste.
    #[must_use]
    pub fn crm_kind(self) -> Option<CrmKind> {
        CrmKind::ALL
            .into_iter()
            .find(|kind| Self::from(*kind) == self)
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
            .and_then(|name| {
                Self::FILES
                    .into_iter()
                    .filter(|kind| *kind != Self::Canvas)
                    .find(|kind| kind.name() == name)
            })
            .unwrap_or(Self::Note)
    }

    /// Le type du fichier `name` de texte `content` : un canvas si son nom finit par `.canvas`,
    /// sinon celui que déclare l'en-tête de la note ([`Self::of`]).
    #[must_use]
    pub fn of_file(name: &FileName, content: &str) -> Self {
        if name.is_canvas() {
            Self::Canvas
        } else {
            Self::of(content)
        }
    }
}

impl From<CrmKind> for ContentType {
    fn from(kind: CrmKind) -> Self {
        match kind {
            CrmKind::Crm => Self::Crm,
            CrmKind::Company => Self::CrmCompany,
            CrmKind::Person => Self::CrmPerson,
            CrmKind::Action => Self::CrmAction,
            CrmKind::Project => Self::CrmProject,
        }
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
            [
                "note",
                "cahier-de-recherche",
                "carte-mentale",
                "canvas",
                "entree",
                "noeud",
                "crm",
                "crm-entreprise",
                "crm-personne",
                "crm-action",
                "crm-projet",
                "agenda-12",
                "agenda-12-evenement"
            ]
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
    fn only_notes_notebooks_mind_maps_canvases_the_crm_and_the_agenda_12_are_files() {
        assert_eq!(
            ContentType::FILES,
            [
                ContentType::Note,
                ContentType::ResearchNotebook,
                ContentType::MindMap,
                ContentType::Canvas,
                ContentType::Crm,
                ContentType::CrmCompany,
                ContentType::CrmPerson,
                ContentType::CrmAction,
                ContentType::CrmProject,
                ContentType::Agenda12,
                ContentType::Agenda12Event,
            ]
        );
    }

    #[test]
    fn an_agenda_12_and_its_events_have_the_type_their_header_declares() {
        assert_eq!(
            ContentType::of("---\ntype: agenda-12\n---\n# S\n"),
            ContentType::Agenda12
        );
        assert_eq!(
            ContentType::of("---\ntype: 'agenda-12-evenement'\nmois: 2\n---\n# S\n"),
            ContentType::Agenda12Event
        );
        assert_eq!(
            ContentType::of("---\ntype: agenda-12-\n---\n"),
            ContentType::Note
        );
        assert_eq!(
            ContentType::of("---\ntype: Agenda-12\n---\n"),
            ContentType::Note
        );
        assert_eq!(ContentType::Agenda12.crm_kind(), None);
        assert_eq!(ContentType::Agenda12Event.crm_kind(), None);
    }

    #[test]
    fn the_crm_and_its_fiches_have_the_type_their_header_declares() {
        for kind in CrmKind::ALL {
            let content = format!("---\ntype: {}\n---\n# T\n", kind.name());
            let content_type = ContentType::of(&content);
            assert_eq!(content_type, ContentType::from(kind));
            assert_eq!(content_type.name(), kind.name());
            assert_eq!(content_type.crm_kind(), Some(kind));
        }
        assert_eq!(ContentType::of("---\ntype: crm-\n---\n"), ContentType::Note);
        assert_eq!(ContentType::Note.crm_kind(), None);
        assert_eq!(ContentType::MindMap.crm_kind(), None);
        assert_eq!(ContentType::Node.crm_kind(), None);
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
        assert_eq!(of("---\ntype: noeud\n---\n# N"), ContentType::Note);
        assert_eq!(of("---\ntype: canvas\n---\n# N"), ContentType::Note);
    }

    #[test]
    fn a_canvas_is_known_by_its_file_name_and_never_by_a_header() {
        let name = |text: &str| FileName::parse(text).unwrap();
        assert_eq!(
            ContentType::of_file(&name("plan.canvas"), "{}"),
            ContentType::Canvas
        );
        assert_eq!(
            ContentType::of_file(&name("plan.md"), "---\ntype: carte-mentale\n---\n# P"),
            ContentType::MindMap
        );
        assert_eq!(
            ContentType::of_file(&name("plan.md"), "---\ntype: canvas\n---\n# P"),
            ContentType::Note
        );
    }
}
