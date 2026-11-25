//! Ce que la recherche par les mots et par le sens lit d'une fiche (spécification § 12) : son texte
//! utile, jamais ses propriétés techniques (statut, rang, références, date).

use super::action::Action;
use super::company::Company;
use super::kind::{CrmKind, Unreadable};
use super::person::Person;
use super::project::Project;
use super::reference::Reference;
use super::stage::Stages;
use crate::NoteSummary;
use crate::segments::Segment;

/// Le texte que l'index lit du CRM ou de la fiche de `summary` (de texte `content`), une partie
/// par ligne ; rien si la note n'est ni l'un ni l'autre.
///
/// - le CRM : son titre et ses étiquettes ;
/// - une entreprise : son nom, son site, son secteur, son adresse et ses notes libres ;
/// - une personne : son nom, sa fonction, son e-mail et ses notes libres ;
/// - une action : son titre, sa description, ses étiquettes, le texte de ses listes à cocher et ses
///   commentaires ;
/// - un projet : son nom.
///
/// Une fiche illisible n'est cherchée que par son titre.
#[must_use]
pub fn searchable_text(summary: &NoteSummary, content: &str) -> Option<String> {
    let parts = text_parts(summary, content)?;
    let lines: Vec<&str> = non_empty(&parts);
    Some(lines.join("\n"))
}

/// Les segments de la fiche de `summary` (de texte `content`) pour la recherche par le sens : son
/// titre sous celui de son CRM `crm_title` s'il est connu, puis son texte utile. Rien si la note
/// n'est pas une fiche (le CRM lui-même est segmenté comme une note).
#[must_use]
pub fn fiche_segments(
    summary: &NoteSummary,
    crm_title: Option<&str>,
    content: &str,
) -> Option<Vec<Segment>> {
    if summary.content_type().crm_kind()? == CrmKind::Crm {
        return None;
    }
    let parts = text_parts(summary, content)?;
    let body = non_empty(parts.get(1..).unwrap_or_default()).join("\n");
    Some(Segment::of_fiche(crm_title, summary.title(), &body))
}

/// Les parties du texte utile, le titre d'abord ; rien si la note n'est pas du CRM.
fn text_parts(summary: &NoteSummary, content: &str) -> Option<Vec<String>> {
    let parts = match summary.content_type().crm_kind()? {
        CrmKind::Crm => Ok(crm_parts(summary)),
        CrmKind::Company => Company::parse(content).map(|company| {
            let [site, sector, address] = [company.site, company.sector, company.address];
            parts(company.name, [site, sector, address], company.notes)
        }),
        CrmKind::Person => Person::parse(content)
            .map(|person| parts(person.name, [person.role, person.email], person.notes)),
        CrmKind::Action => action_parts(content),
        CrmKind::Project => Project::parse(content).map(|project| vec![project.name]),
    };
    Some(parts.unwrap_or_else(|_| vec![summary.title().to_owned()]))
}

fn non_empty(parts: &[String]) -> Vec<&str> {
    parts
        .iter()
        .map(|part| part.trim())
        .filter(|part| !part.is_empty())
        .collect()
}

/// Le nom, les champs écrits puis les notes libres.
fn parts<const N: usize>(name: String, fields: [Option<String>; N], notes: String) -> Vec<String> {
    let mut parts = vec![name];
    parts.extend(fields.into_iter().flatten());
    parts.push(notes);
    parts
}

fn crm_parts(summary: &NoteSummary) -> Vec<String> {
    let mut parts = vec![summary.title().to_owned()];
    parts.extend(summary.tags().iter().cloned());
    parts
}

/// L'action est lue sans son CRM : ses étapes ne changent rien à son texte.
fn action_parts(content: &str) -> Result<Vec<String>, Unreadable> {
    let name = Reference::to("action").ok_or(Unreadable::NoTitle)?;
    let action = Action::parse(name, content, &Stages::default())?;
    let mut parts = vec![action.title, action.body.description];
    parts.extend(action.tags);
    for list in action.body.checklists {
        parts.push(list.name);
        parts.extend(list.items.into_iter().map(|item| item.text));
    }
    parts.extend(action.body.comments.into_iter().map(|comment| comment.text));
    Ok(parts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Modified, NotePath};

    fn text(path: &str, content: &str) -> Option<String> {
        let summary = NoteSummary::new(NotePath::parse(path).unwrap(), content, Modified(0));
        searchable_text(&summary, content)
    }

    #[test]
    fn a_note_that_is_not_of_the_crm_has_no_such_text() {
        assert_eq!(text("a.md", "# A\n\ntexte"), None);
        assert_eq!(text("a.md", "---\ntype: carte-mentale\n---\n# A"), None);
    }

    #[test]
    fn the_crm_is_found_by_its_title_and_its_tags_only() {
        assert_eq!(
            text(
                "clients.md",
                "---\ntype: crm\ntags: [b2b, suivi]\netapes: [Négo]\n---\n# Clients\n\nTexte caché.\n"
            ),
            Some("Clients\nb2b\nsuivi".to_owned())
        );
    }

    #[test]
    fn a_company_is_found_by_its_name_site_sector_address_and_notes_but_not_its_phone() {
        let content = "---\ntype: crm-entreprise\nsite: https://acme.fr\nsecteur: Industrie\nadresse: 12 rue des Lilas\ntelephone: 01 23\n---\n# Acme\n\nNotes libres.\n";
        assert_eq!(
            text("c/entreprises/acme.md", content),
            Some("Acme\nhttps://acme.fr\nIndustrie\n12 rue des Lilas\nNotes libres.".to_owned())
        );
    }

    #[test]
    fn a_person_is_found_by_her_name_role_email_and_notes_but_not_her_phone_or_company() {
        let content = "---\ntype: crm-personne\nfonction: Responsable\nentreprise: '[[acme]]'\nemail: j@acme.fr\ntelephone: 06\nlinkedin: https://x\n---\n# Jean Dupont\n\nA rappeler.\n";
        assert_eq!(
            text("c/personnes/jean.md", content),
            Some("Jean Dupont\nResponsable\nj@acme.fr\nA rappeler.".to_owned())
        );
    }

    #[test]
    fn an_action_is_found_by_its_text_and_not_by_its_properties() {
        let content = "---\ntype: crm-action\nstatut: Progress\ndate: '2026-11-24'\ntags: [urgent]\nrang: 2\n---\n# Devis\n\nPour 3 postes.\n\n#### Liste à cocher : Préparation\n- [x] Relire\n- [ ] Chiffrer\n\n#### Commentaires\n- 2026-11-24 10:32 · Rappelé.\n";
        assert_eq!(
            text("c/actions/devis.md", content),
            Some(
                "Devis\nPour 3 postes.\nurgent\nPréparation\nRelire\nChiffrer\nRappelé.".to_owned()
            )
        );
    }

    #[test]
    fn a_project_is_found_by_its_name_only() {
        assert_eq!(
            text(
                "c/projets/refonte.md",
                "---\ntype: crm-projet\ncouleur: bleu\n---\n# Refonte\n\nTexte caché.\n"
            ),
            Some("Refonte".to_owned())
        );
    }

    #[test]
    fn an_unreadable_fiche_is_found_by_its_title_only() {
        assert_eq!(
            text(
                "c/personnes/jean.md",
                "---\ntype: crm-personne\n---\nsans titre\n"
            ),
            Some("jean".to_owned())
        );
    }

    fn segments(path: &str, crm_title: Option<&str>, content: &str) -> Option<Vec<Segment>> {
        let summary = NoteSummary::new(NotePath::parse(path).unwrap(), content, Modified(0));
        fiche_segments(&summary, crm_title, content)
    }

    #[test]
    fn a_fiche_gives_one_segment_under_the_title_of_its_crm() {
        let content =
            "---\ntype: crm-personne\nfonction: Responsable\n---\n# Jean Dupont\n\nA rappeler.\n";
        let found = segments("c/personnes/jean.md", Some("Clients"), content).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].heading(), "Clients > Jean Dupont");
        assert_eq!(found[0].text(), "Responsable\nA rappeler.");
        assert_eq!(found[0].node(), None);
    }

    #[test]
    fn a_fiche_of_an_unknown_crm_is_titled_by_itself_and_one_without_text_keeps_its_title() {
        let content = "---\ntype: crm-projet\n---\n# Refonte\n";
        let found = segments("c/projets/refonte.md", None, content).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].heading(), "Refonte");
        assert_eq!(found[0].text(), "");
    }

    #[test]
    fn the_crm_and_a_plain_note_are_not_segmented_as_fiches() {
        assert_eq!(
            segments("c.md", Some("C"), "---\ntype: crm\n---\n# C\n"),
            None
        );
        assert_eq!(segments("n.md", None, "# N\n\ntexte"), None);
    }

    #[test]
    fn a_long_fiche_is_cut_like_a_note() {
        let long = "mot ".repeat(400);
        let content = format!("---\ntype: crm-entreprise\n---\n# Acme\n\n{long}\n");
        let found = segments("c/entreprises/acme.md", Some("C"), &content).unwrap();
        assert_eq!(found.len(), 2);
        assert!(found.iter().all(|s| s.heading() == "C > Acme"));
    }

    #[test]
    fn empty_parts_leave_no_empty_line() {
        assert_eq!(
            text(
                "c/entreprises/a.md",
                "---\ntype: crm-entreprise\n---\n# Acme\n"
            ),
            Some("Acme".to_owned())
        );
    }
}
