//! Le CRM : une note dont l'en-tête porte `type: crm` (spécification § 4.2). Seules ses étapes
//! comptent ; le texte sous son titre n'est jamais modifié ni montré.

use super::header::{self, Style};
use super::kind::CrmKind;
use super::stage::Stages;
use crate::title::displayed_title;

/// La clé de l'en-tête qui donne la liste ordonnée des étapes.
const STAGES_KEY: &str = "etapes";

/// Un CRM lu : son titre et ses étapes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Crm {
    /// Le premier titre `#`, comme toute note.
    pub title: String,
    /// Les étapes, dans l'ordre : « Progress » puis « WaitingFor » si le CRM n'a pas choisi les
    /// siennes, aucune si sa liste est vide.
    pub stages: Stages,
}

impl Crm {
    /// Le CRM que dit `content` ; rien si ce n'est pas une note `type: crm`.
    #[must_use]
    pub fn parse(content: &str) -> Option<Self> {
        (CrmKind::of(content) == Some(CrmKind::Crm)).then(|| Self {
            title: displayed_title(content),
            stages: read_stages(content),
        })
    }

    /// Le texte d'un CRM neuf : l'en-tête `type: crm` et le titre, sans étapes écrites.
    #[must_use]
    pub fn new_content(title: &str) -> String {
        let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
        format!("---\ntype: {}\n---\n# {title}\n", CrmKind::Crm.name())
    }
}

/// Les étapes de l'en-tête de `content` : celles qu'il écrit, ou celles par défaut s'il n'en
/// écrit pas.
#[must_use]
pub fn read_stages(content: &str) -> Stages {
    if header::has_key(content, STAGES_KEY) {
        Stages::read(&header::items(content, STAGES_KEY))
    } else {
        Stages::default()
    }
}

/// Le texte du CRM `content` avec ces étapes : la propriété `etapes` réécrite à sa place (une
/// liste vide s'écrit `etapes: []`), le reste du fichier inchangé.
#[must_use]
pub fn with_stages(content: &str, stages: &Stages) -> String {
    let line = header::items_line(STAGES_KEY, &stages.names(), Style::Flow);
    header::with_line(content, STAGES_KEY, Some(&line))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_crm_is_read_with_its_title_and_the_stages_it_writes() {
        let crm =
            Crm::parse("---\ntype: crm\netapes: [Négo, 'Relance 2']\n---\n# Clients\ntexte\n")
                .unwrap();
        assert_eq!(crm.title, "Clients");
        assert_eq!(
            crm.stages.names(),
            vec!["Négo".to_owned(), "Relance 2".to_owned()]
        );
    }

    #[test]
    fn a_crm_without_stages_has_the_default_ones_and_an_empty_list_has_none() {
        assert_eq!(
            Crm::parse("---\ntype: crm\n---\n# C\n").unwrap().stages,
            Stages::default()
        );
        assert!(
            Crm::parse("---\ntype: crm\netapes: []\n---\n# C\n")
                .unwrap()
                .stages
                .as_slice()
                .is_empty()
        );
        assert!(
            Crm::parse("---\ntype: crm\netapes:\n---\n# C\n")
                .unwrap()
                .stages
                .as_slice()
                .is_empty()
        );
        assert_eq!(
            Crm::parse("---\ntype: crm\netapes:\n  - A\n  - B\n---\n# C\n")
                .unwrap()
                .stages
                .names(),
            vec!["A".to_owned(), "B".to_owned()]
        );
    }

    #[test]
    fn only_a_note_that_declares_crm_is_a_crm() {
        assert_eq!(Crm::parse("---\ntype: crm-action\n---\n# C\n"), None);
        assert_eq!(Crm::parse("# C\n"), None);
    }

    #[test]
    fn a_crm_without_a_title_is_shown_untitled() {
        assert_eq!(
            Crm::parse("---\ntype: crm\n---\n").unwrap().title,
            "Sans titre"
        );
    }

    #[test]
    fn a_new_crm_has_its_header_and_its_title_and_no_written_stages() {
        assert_eq!(
            Crm::new_content("  Mes   clients "),
            "---\ntype: crm\n---\n# Mes clients\n"
        );
        let crm = Crm::parse(&Crm::new_content("X")).unwrap();
        assert_eq!(crm.stages, Stages::default());
    }

    #[test]
    fn writing_the_stages_changes_only_their_property() {
        let content = "---\ntype: crm\naliases: [x]\n---\n# Clients\n\nMes notes.\n";
        let stages = Stages::read(&["Négo".to_owned(), "A, B".to_owned()]);
        let written = with_stages(content, &stages);
        assert_eq!(
            written,
            "---\ntype: crm\naliases: [x]\netapes: [Négo, 'A, B']\n---\n# Clients\n\nMes notes.\n"
        );
        assert_eq!(read_stages(&written), stages);
        let again = with_stages(&written, &Stages::read(&[]));
        assert_eq!(
            again,
            "---\ntype: crm\naliases: [x]\netapes: []\n---\n# Clients\n\nMes notes.\n"
        );
        assert!(read_stages(&again).as_slice().is_empty());
    }
}
