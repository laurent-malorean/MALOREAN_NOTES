//! Les liens entre notes que porte une action (spécification § 12) : les notes qu'elle lie et les
//! `[[titre]]` de sa description ou d'un commentaire. Ses références à une personne, à une
//! entreprise ou à un projet (`[[nom-de-fichier]]`) ne sont pas des liens entre notes : une note
//! qui porte le même titre n'en reçoit pas de lien entrant.

use super::action::Action;
use super::reference::Reference;
use super::stage::Stages;
use crate::links::linked_targets;

/// Les titres de notes que désigne l'action `content`, dans l'ordre : ses notes liées, les liens
/// de sa description, ceux de ses commentaires. Rien si le texte n'est pas une action lisible : il
/// se lit alors comme une note.
#[must_use]
pub fn action_links(content: &str) -> Option<Vec<String>> {
    let name = Reference::to("action")?;
    let action = Action::parse(name, content, &Stages::default()).ok()?;
    let mut titles: Vec<String> = action
        .linked_notes
        .iter()
        .map(|note| note.as_str().to_owned())
        .collect();
    let comments = action.body.comments.iter().map(|comment| &comment.text);
    for text in std::iter::once(&action.body.description).chain(comments) {
        titles.extend(linked_targets(text).into_iter().map(str::to_owned));
    }
    Some(titles)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ACTION: &str = "---\ntype: crm-action\npersonnes: ['[[jean-dupont]] · [[acme]]']\nprojet: '[[refonte]]'\nnotes: ['[[Cahier des charges]]', '[[Plan]]']\nstatut: TODO\n---\n# Devis\n\nVoir le [[Plan de salle|plan]].\n\n#### Liste à cocher : Prépa\n- [ ] Lire [[Liste]]\n\n#### Commentaires\n- 2026-11-24 10:32 · Vu [[Compte rendu]]\n  et [[Suite]].\n- 2026-11-25 09:00 · Rien.\n";

    #[test]
    fn an_action_links_its_linked_notes_then_its_description_then_its_comments() {
        assert_eq!(
            action_links(ACTION),
            Some(
                [
                    "Cahier des charges",
                    "Plan",
                    "Plan de salle",
                    "Compte rendu",
                    "Suite"
                ]
                .map(str::to_owned)
                .to_vec()
            )
        );
    }

    #[test]
    fn its_references_to_people_companies_and_projects_are_not_links() {
        let links = action_links(ACTION).unwrap();
        for file_name in ["jean-dupont", "acme", "refonte"] {
            assert!(!links.iter().any(|title| title == file_name));
        }
    }

    #[test]
    fn a_checklist_item_is_not_a_link() {
        let links = action_links(ACTION).unwrap();
        assert!(!links.iter().any(|title| title == "Liste"));
    }

    #[test]
    fn an_action_without_links_links_nothing() {
        assert_eq!(
            action_links("---\ntype: crm-action\n---\n# Seule\n"),
            Some(Vec::new())
        );
    }

    #[test]
    fn what_is_not_a_readable_action_is_read_as_a_note() {
        assert_eq!(action_links("# Note\n\n[[Autre]]"), None);
        assert_eq!(action_links("---\ntype: crm-personne\n---\n# P"), None);
        assert_eq!(action_links("---\ntype: crm-action\n---\nsans titre"), None);
    }
}
