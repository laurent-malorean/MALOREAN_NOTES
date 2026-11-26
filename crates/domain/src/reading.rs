//! Lire le texte d'une note (fiche 0076) : l'outil `read_note` que les IA utilisent pour recopier à
//! l'identique le texte à remplacer de `replace_in_note`. Règles pures : ce qui est refusé, l'en-tête
//! et le corps séparés, et la limite de taille, toujours dite.

use std::fmt;

use crate::ContentType;
use crate::app_tools::crm_changing_tools_said;
use crate::front_matter::split_exact;

/// Combien de caractères de corps au plus une lecture rend : de quoi tenir sous la limite d'un
/// résultat d'outil de Claude Code (25 000 jetons), qui refuserait sinon toute la réponse.
pub const MAX_READ_CHARACTERS: usize = 60_000;

/// Pourquoi une lecture est refusée.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefusedReading {
    /// Le contenu n'est pas une note simple : un cahier de recherche, une carte mentale, un canvas,
    /// un CRM ou une fiche de CRM.
    NotANote(ContentType),
}

impl fmt::Display for RefusedReading {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotANote(ContentType::ResearchNotebook) => f.write_str(
                "cette note est un cahier de recherche : read_note ne lit que les notes simples ; \
                 on y ajoute une entrée avec add_entry, et ses entrées se retrouvent avec \
                 search_notes ou search_by_meaning",
            ),
            Self::NotANote(ContentType::MindMap) => f.write_str(
                "cette note est une carte mentale : read_note ne lit que les notes simples ; \
                 lisez la carte en arbre avec read_mind_map (le même chemin dans path)",
            ),
            Self::NotANote(ContentType::Canvas) => f.write_str(
                "cette note est un canvas : read_note ne lit que les notes simples ; lisez-le avec \
                 read_canvas, et changez-le avec add_canvas_card, change_canvas_card, \
                 move_canvas_card, resize_canvas_card, remove_canvas_card, add_canvas_arrow, \
                 change_canvas_arrow, remove_canvas_arrow, add_canvas_group ou \
                 change_canvas_group",
            ),
            Self::NotANote(ContentType::Crm) => write!(
                f,
                "cette note est un CRM : read_note ne lit que les notes simples ; lisez-le avec \
                 read_crm, et changez-le avec {}",
                crm_changing_tools_said()
            ),
            Self::NotANote(
                kind @ (ContentType::CrmCompany
                | ContentType::CrmPerson
                | ContentType::CrmAction
                | ContentType::CrmProject),
            ) => write!(
                f,
                "cette note est une fiche de CRM, de type « {} » : read_note ne lit que les notes \
                 simples ; lisez le CRM qui la contient avec read_crm (la fiche y a sa `ref`), et \
                 changez-la avec {}",
                kind.name(),
                crm_changing_tools_said()
            ),
            Self::NotANote(kind) => write!(
                f,
                "cette note est de type « {} » : read_note ne lit que les notes simples ; ce type \
                 n'a pas encore d'outil de lecture",
                kind.name()
            ),
        }
    }
}

impl std::error::Error for RefusedReading {}

/// Le texte d'une note simple, prêt à être lu : l'en-tête et le corps, le corps coupé s'il passe la
/// limite.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadableNote {
    /// L'en-tête tel qu'il est écrit, ses lignes `---` comprises ; vide si la note n'en a pas.
    pub header: String,
    /// Le corps : tout ce qui suit l'en-tête, coupé à la fin d'une ligne entière s'il dépasse
    /// [`MAX_READ_CHARACTERS`].
    pub body: String,
    /// Le nombre de caractères du corps entier, avant toute coupure.
    pub characters: usize,
    /// Le corps a été coupé : sa fin n'est pas dans `body`.
    pub truncated: bool,
}

/// La note de type `kind` et de texte `content`, lisible : en-tête et corps séparés.
///
/// # Errors
///
/// [`RefusedReading::NotANote`] si ce n'est pas une note simple.
pub fn readable(kind: ContentType, content: &str) -> Result<ReadableNote, RefusedReading> {
    if kind != ContentType::Note {
        return Err(RefusedReading::NotANote(kind));
    }
    let (header, body) = split_exact(content);
    let characters = body.chars().count();
    let kept = kept_of(body);
    Ok(ReadableNote {
        header: header.to_owned(),
        body: kept.to_owned(),
        characters,
        truncated: kept.len() < body.len(),
    })
}

/// Le début du corps qu'une lecture rend : tout s'il tient dans la limite, sinon jusqu'à la fin de
/// la dernière ligne entière (ou jusqu'à la limite s'il n'y a aucun retour à la ligne avant elle).
fn kept_of(body: &str) -> &str {
    let Some((limit, _)) = body.char_indices().nth(MAX_READ_CHARACTERS) else {
        return body;
    };
    // Le premier caractère écarté ouvre une ligne neuve : la ligne d'avant est entière.
    if body[limit..].starts_with('\n') {
        return &body[..limit];
    }
    body[..limit]
        .rfind('\n')
        .map_or(&body[..limit], |newline| &body[..=newline])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(content: &str) -> ReadableNote {
        readable(ContentType::Note, content).unwrap()
    }

    #[test]
    fn a_simple_note_is_given_whole_with_its_header_apart() {
        let read = note("---\ntags: [a]\n---\n# Titre\ntexte\n");
        assert_eq!(read.header, "---\ntags: [a]\n---\n");
        assert_eq!(read.body, "# Titre\ntexte\n");
        assert_eq!(read.characters, 14);
        assert!(!read.truncated);
    }

    #[test]
    fn a_note_without_header_has_an_empty_header() {
        let read = note("# Titre\ntexte");
        assert_eq!(read.header, "");
        assert_eq!(read.body, "# Titre\ntexte");
    }

    #[test]
    fn an_unclosed_header_is_part_of_the_body() {
        let read = note("---\ntags: [a]\n# Titre");
        assert_eq!(read.header, "");
        assert_eq!(read.body, "---\ntags: [a]\n# Titre");
    }

    #[test]
    fn the_header_then_the_body_give_back_the_file_exactly() {
        for text in [
            "---\r\na: 1\r\n---\r\n# É\r\ntexte\r\n",
            "# Sans en-tête",
            "",
            "---\n---\n",
        ] {
            let read = note(text);
            assert_eq!(format!("{}{}", read.header, read.body), text);
        }
    }

    #[test]
    fn every_content_other_than_a_simple_note_is_refused() {
        for kind in ContentType::ALL {
            let refused = readable(kind, "# Titre");
            if kind == ContentType::Note {
                assert!(refused.is_ok());
            } else {
                assert_eq!(refused, Err(RefusedReading::NotANote(kind)));
            }
        }
    }

    #[test]
    fn a_research_notebook_is_sent_to_add_entry_and_the_search() {
        let said = RefusedReading::NotANote(ContentType::ResearchNotebook).to_string();
        for expected in [
            "cahier de recherche",
            "add_entry",
            "search_notes",
            "search_by_meaning",
        ] {
            assert!(said.contains(expected), "{expected} : {said}");
        }
    }

    #[test]
    fn another_type_is_named_and_said_to_have_no_reading_tool_yet() {
        let said = RefusedReading::NotANote(ContentType::Note).to_string();
        assert!(said.contains("« note »"), "{said}");
        assert!(
            said.contains("read_note ne lit que les notes simples"),
            "{said}"
        );
        assert!(said.contains("pas encore d'outil de lecture"), "{said}");
    }

    #[test]
    fn a_crm_is_sent_to_the_crm_tools() {
        let said = RefusedReading::NotANote(ContentType::Crm).to_string();
        for expected in [
            "cette note est un CRM",
            "read_note ne lit que les notes simples",
            "lisez-le avec read_crm",
            "create_crm_action, change_crm_action, move_crm_action, delete_crm_action",
            "create_crm_person, change_crm_person, delete_crm_person",
            "create_crm_company, change_crm_company, delete_crm_company",
            "create_crm_project, change_crm_project, delete_crm_project",
            "ou change_crm_stages",
        ] {
            assert!(said.contains(expected), "{expected} : {said}");
        }
        assert!(!said.contains("pas encore"), "{said}");
    }

    #[test]
    fn a_fiche_of_a_crm_is_named_and_sent_to_the_crm_tools() {
        for (kind, name) in [
            (ContentType::CrmCompany, "crm-entreprise"),
            (ContentType::CrmPerson, "crm-personne"),
            (ContentType::CrmAction, "crm-action"),
            (ContentType::CrmProject, "crm-projet"),
        ] {
            let said = RefusedReading::NotANote(kind).to_string();
            assert!(
                said.contains(&format!("fiche de CRM, de type « {name} »")),
                "{said}"
            );
            assert!(said.contains("read_crm (la fiche y a sa `ref`)"), "{said}");
            assert!(said.contains("ou change_crm_stages"), "{said}");
            assert!(!said.contains("pas encore"), "{said}");
        }
    }

    #[test]
    fn a_mind_map_is_sent_to_the_tool_that_reads_it() {
        assert_eq!(
            RefusedReading::NotANote(ContentType::MindMap).to_string(),
            "cette note est une carte mentale : read_note ne lit que les notes simples ; lisez \
             la carte en arbre avec read_mind_map (le même chemin dans path)"
        );
    }

    #[test]
    fn a_canvas_is_sent_to_the_canvas_tools() {
        let said = RefusedReading::NotANote(ContentType::Canvas).to_string();
        for expected in [
            "cette note est un canvas",
            "read_note ne lit que les notes simples",
            "read_canvas",
            "add_canvas_card",
            "change_canvas_card",
            "move_canvas_card",
            "resize_canvas_card",
            "remove_canvas_card",
            "add_canvas_arrow",
            "change_canvas_arrow",
            "remove_canvas_arrow",
            "add_canvas_group",
            "change_canvas_group",
        ] {
            assert!(said.contains(expected), "{expected} : {said}");
        }
        assert!(!said.contains("pas encore"), "{said}");
    }

    fn lines_of(width: usize, count: usize) -> String {
        let line = "a".repeat(width - 1);
        (0..count).map(|_| format!("{line}\n")).collect()
    }

    #[test]
    fn a_body_of_exactly_the_limit_is_given_whole() {
        let body = "é".repeat(MAX_READ_CHARACTERS);
        let read = note(&body);
        assert_eq!(read.body, body);
        assert_eq!(read.characters, MAX_READ_CHARACTERS);
        assert!(!read.truncated);
    }

    #[test]
    fn a_longer_body_is_cut_at_the_end_of_its_last_whole_line_and_says_so() {
        // 7 lignes de 10 000 caractères (retour à la ligne compris) : 60 000 caractères en
        // tiennent 6, la septième est écartée.
        let body = lines_of(10_000, 7);
        let read = note(&body);
        assert_eq!(read.body, lines_of(10_000, 6));
        assert_eq!(read.characters, 70_000);
        assert!(read.truncated);
    }

    #[test]
    fn a_line_that_ends_exactly_on_the_limit_is_kept() {
        let body = format!("{}\nsuite", "a".repeat(MAX_READ_CHARACTERS));
        let read = note(&body);
        assert_eq!(read.body, "a".repeat(MAX_READ_CHARACTERS));
        assert!(read.truncated);
        let with_newline = format!("{}\nsuite", "a".repeat(MAX_READ_CHARACTERS - 1));
        assert_eq!(
            note(&with_newline).body,
            format!("{}\n", "a".repeat(MAX_READ_CHARACTERS - 1))
        );
    }

    #[test]
    fn a_body_without_a_line_break_is_cut_at_the_limit_in_whole_characters() {
        let body = "é".repeat(MAX_READ_CHARACTERS + 5);
        let read = note(&body);
        assert_eq!(read.body, "é".repeat(MAX_READ_CHARACTERS));
        assert_eq!(read.characters, MAX_READ_CHARACTERS + 5);
        assert!(read.truncated);
    }

    #[test]
    fn the_header_is_never_cut_and_does_not_count_in_the_limit() {
        let header = format!("---\ntags: [{}]\n---\n", "x".repeat(100));
        let body = "b".repeat(MAX_READ_CHARACTERS);
        let read = note(&format!("{header}{body}"));
        assert_eq!(read.header, header);
        assert_eq!(read.body, body);
        assert!(!read.truncated);
    }
}
