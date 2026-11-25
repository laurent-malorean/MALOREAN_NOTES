//! Un projet (spécification §§ 4.6 et 5.4) : un nom et une couleur ; le texte sous son titre est
//! gardé tel quel, jamais montré.

use super::header::{self, Style};
use super::kind::{CrmKind, Unreadable, read_title};
use super::name::Name;
use super::palette::Color;
use crate::tag::{retagged, tags, written_tags};

/// La clé de l'en-tête qui donne la couleur du projet.
const COLOR_KEY: &str = "couleur";

/// Un projet lu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    /// Son nom : le titre de la fiche.
    pub name: String,
    /// Sa couleur : la première de la palette si elle est absente ou inconnue, sans que le fichier
    /// change.
    pub color: Color,
    /// Ses étiquettes (`tags` de l'en-tête, comme toute note).
    pub tags: Vec<String>,
}

impl Project {
    /// Le projet que dit `content`.
    ///
    /// # Errors
    ///
    /// [`Unreadable`] si ce n'est pas une fiche `type: crm-projet` ou si elle n'a pas de titre.
    pub fn parse(content: &str) -> Result<Self, Unreadable> {
        let name = read_title(content, CrmKind::Project)?;
        let color = header::scalar(content, COLOR_KEY)
            .and_then(|written| Color::parse(&written))
            .unwrap_or(Color::FIRST);
        Ok(Self {
            name,
            color,
            tags: tags(content),
        })
    }

    /// Le texte d'un projet neuf, de la couleur que le CRM lui a choisie (la moins utilisée) : elle
    /// est écrite, pour ne plus changer quand l'usage des couleurs change.
    #[must_use]
    pub fn new_content(name: &Name, color: Color) -> String {
        format!(
            "---\ntype: {}\n{COLOR_KEY}: {}\n---\n# {}\n",
            CrmKind::Project.name(),
            color.name(),
            name.as_str()
        )
    }
}

/// Le texte du projet avec ces étiquettes, nettoyées comme pour toute note (sans doublon, la casse ne
/// compte pas) ; sans étiquette, la propriété est retirée. Le reste est inchangé.
#[must_use]
pub fn with_tags(content: &str, new_tags: &[String]) -> String {
    retagged(content, &written_tags(new_tags))
}

/// Le texte du projet avec cette couleur choisie par l'utilisateur, le reste inchangé.
#[must_use]
pub fn with_color(content: &str, color: Color) -> String {
    header::with_scalar(content, COLOR_KEY, Some(color.name()), Style::Line)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn color(name: &str) -> Color {
        Color::parse(name).unwrap()
    }

    #[test]
    fn a_project_is_read_with_its_name_and_its_color() {
        let project =
            Project::parse("---\ntype: crm-projet\ncouleur: bleu\n---\n# Refonte du site\n")
                .unwrap();
        assert_eq!(
            project,
            Project {
                name: "Refonte du site".to_owned(),
                color: color("bleu"),
                tags: Vec::new()
            }
        );
    }

    #[test]
    fn an_absent_or_unknown_color_is_read_as_the_first_of_the_palette() {
        let read = |yaml: &str| {
            Project::parse(&format!("---\ntype: crm-projet\n{yaml}---\n# P\n"))
                .unwrap()
                .color
        };
        assert_eq!(read(""), Color::FIRST);
        assert_eq!(read("couleur: fuchsia\n"), Color::FIRST);
        assert_eq!(read("couleur:\n"), Color::FIRST);
        assert_eq!(read("couleur: Violet\n"), color("violet"));
    }

    #[test]
    fn a_project_without_title_or_of_another_kind_is_unreadable() {
        assert_eq!(
            Project::parse("---\ntype: crm-projet\n---\n"),
            Err(Unreadable::NoTitle)
        );
        assert_eq!(
            Project::parse("---\ntype: crm-action\n---\n# A\n"),
            Err(Unreadable::WrongKind)
        );
    }

    #[test]
    fn a_new_project_writes_the_color_chosen_for_it() {
        let name = Name::parse("Refonte").unwrap();
        let content = Project::new_content(&name, color("marron"));
        assert_eq!(
            content,
            "---\ntype: crm-projet\ncouleur: marron\n---\n# Refonte\n"
        );
        assert_eq!(Project::parse(&content).unwrap().color, color("marron"));
    }

    #[test]
    fn choosing_a_color_changes_only_that_property_and_keeps_the_text_under_the_title() {
        let content = "---\ntype: crm-projet\n---\n# Refonte\n\nTexte gardé.\n";
        let written = with_color(content, color("rose"));
        assert_eq!(
            written,
            "---\ntype: crm-projet\ncouleur: rose\n---\n# Refonte\n\nTexte gardé.\n"
        );
        assert_eq!(
            with_color(&written, color("vert")),
            "---\ntype: crm-projet\ncouleur: vert\n---\n# Refonte\n\nTexte gardé.\n"
        );
    }

    #[test]
    fn the_tags_of_a_project_are_read_from_its_header() {
        let read = |yaml: &str| {
            Project::parse(&format!("---\ntype: crm-projet\n{yaml}---\n# P\n"))
                .unwrap()
                .tags
        };
        assert_eq!(read("tags: [client, 2027]\n"), ["client", "2027"]);
        assert_eq!(read("tags:\n  - client\n"), ["client"]);
        assert!(read("").is_empty());
    }

    #[test]
    fn tagging_a_project_changes_only_that_property_and_keeps_the_text_under_the_title() {
        let content = "---\ntype: crm-projet\ncouleur: bleu\n---\n# Refonte\n\nTexte gardé.\n";
        let tags = |words: &[&str]| words.iter().map(|w| (*w).to_owned()).collect::<Vec<_>>();
        let written = with_tags(content, &tags(&[" #client ", "Client", "a,b", "2027"]));
        assert_eq!(
            written,
            "---\ntype: crm-projet\ncouleur: bleu\ntags: [client, 2027]\n---\n# Refonte\n\nTexte gardé.\n"
        );
        assert_eq!(with_tags(&written, &[]), content);
    }
}
