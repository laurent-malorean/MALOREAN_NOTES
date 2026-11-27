//! Remplacer un texte par un autre dans le texte d'une note (fiche 0075) : l'outil `replace_in_note`
//! que les IA utilisent à la place des outils de fichiers. Règles pures : ce qui est refusé, et le
//! texte obtenu.
//!
//! Le texte cherché se recopie à l'identique (majuscules, accents, espaces, retours à la ligne) ; il
//! est cherché dans tout le fichier, en-tête compris. Par sécurité, un texte qui apparaît
//! plusieurs fois est refusé, sauf si l'IA demande de remplacer toutes les occurrences.

use std::fmt;

use crate::ContentType;
use crate::app_tools::crm_changing_tools_said;

/// Combien de lignes au plus une erreur de texte répété cite.
pub const MAX_LINES_SHOWN: usize = 5;

/// Pourquoi un remplacement est refusé ; rien n'est alors changé.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefusedReplacement {
    /// Le contenu n'est pas une note simple : un cahier de recherche (où l'on ne fait qu'ajouter
    /// des entrées), une carte mentale, un canvas, un CRM ou une fiche de CRM.
    NotANote(ContentType),
    /// Le texte à remplacer est vide.
    EmptyText,
    /// Le nouveau texte est celui qu'on remplace : rien à changer.
    SameText,
    /// Le texte à remplacer n'est pas dans la note.
    NotFound,
    /// Le texte à remplacer est plusieurs fois dans la note, et l'IA n'a pas demandé de les
    /// remplacer toutes.
    Repeated {
        /// Combien de fois il apparaît.
        count: usize,
        /// Les premières lignes où il commence (de 1), [`MAX_LINES_SHOWN`] au plus.
        lines: Vec<usize>,
    },
}

impl fmt::Display for RefusedReplacement {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotANote(kind) => f.write_str(&not_a_note(*kind)),
            Self::EmptyText => f.write_str(
                "le texte à remplacer (old_text) est vide : recopiez à l'identique le texte à \
                 changer",
            ),
            Self::SameText => f.write_str(
                "le nouveau texte (new_text) est identique au texte à remplacer (old_text) : rien \
                 à changer",
            ),
            Self::NotFound => f.write_str(
                "le texte à remplacer (old_text) est introuvable dans la note : recopiez-le à \
                 l'identique, avec ses majuscules, ses accents, ses espaces et ses retours à la \
                 ligne ; rien n'a été changé",
            ),
            Self::Repeated { count, lines } => write!(
                f,
                "le texte à remplacer (old_text) apparaît {count} fois ({}) : ajoutez du texte \
                 autour pour qu'il n'apparaisse qu'une fois, ou passez replace_all à true pour \
                 remplacer toutes les occurrences ; rien n'a été changé",
                lines_said(lines, *count)
            ),
        }
    }
}

impl std::error::Error for RefusedReplacement {}

/// Pourquoi, et par quels outils, le texte d'un contenu qui n'est pas une note simple ne se
/// remplace pas.
fn not_a_note(kind: ContentType) -> String {
    match kind {
        ContentType::ResearchNotebook => {
            "cette note est un cahier de recherche : on n'y ajoute que \
             des entrées (add_entry), son texte ne se remplace jamais"
                .to_owned()
        }
        ContentType::MindMap => "cette note est une carte mentale : replace_in_note ne change que \
             le texte des notes simples ; lisez la carte avec read_mind_map et modifiez-la avec \
             add_mind_map_child, add_mind_map_sibling, add_mind_map_root, edit_mind_map_node, \
             color_mind_map_node, move_mind_map_node ou delete_mind_map_node"
            .to_owned(),
        ContentType::Canvas => "cette note est un canvas : replace_in_note ne change que le texte \
             des notes simples ; lisez le canvas avec read_canvas et changez-le avec \
             add_canvas_card, change_canvas_card, move_canvas_card, resize_canvas_card, \
             remove_canvas_card, add_canvas_arrow, change_canvas_arrow, remove_canvas_arrow, \
             add_canvas_group ou change_canvas_group"
            .to_owned(),
        ContentType::Crm => format!(
            "cette note est un CRM : replace_in_note ne change que le texte des notes simples ; \
             lisez-le avec read_crm et changez-le avec {}",
            crm_changing_tools_said()
        ),
        ContentType::CrmCompany
        | ContentType::CrmPerson
        | ContentType::CrmAction
        | ContentType::CrmProject => format!(
            "cette note est une fiche de CRM, de type « {} » : replace_in_note ne change que le \
             texte des notes simples ; lisez le CRM qui la contient avec read_crm (la fiche y a \
             sa `ref`) et changez-la avec {}",
            kind.name(),
            crm_changing_tools_said()
        ),
        ContentType::Agenda12 => "cette note est un agenda 12 : replace_in_note ne change que le \
             texte des notes simples ; lisez-le avec read_agenda_12, ajoutez-y un événement avec \
             add_agenda_12_event et clôturez-en un avec close_agenda_12_event ; le texte d'un \
             événement se change avec replace_in_note"
            .to_owned(),
        _ => format!(
            "cette note est de type « {} » : replace_in_note ne change que le texte des notes \
             simples",
            kind.name()
        ),
    }
}

/// Les lignes citées, dites en français : `ligne 4`, `lignes 4 et 9`, `lignes 4, 9 et 12`,
/// `lignes 4, 9, 12, 15, 20 et d'autres` quand il y en a plus que celles citées.
fn lines_said(lines: &[usize], count: usize) -> String {
    let numbers: Vec<String> = lines.iter().map(ToString::to_string).collect();
    let (last, first) = numbers.split_last().map_or(("", &[][..]), |(l, f)| (l, f));
    if lines.len() < count {
        format!("lignes {} et d'autres", numbers.join(", "))
    } else if first.is_empty() {
        format!("ligne {last}")
    } else {
        format!("lignes {} et {last}", first.join(", "))
    }
}

/// Un texte remplacé : le nouveau texte de la note, et combien de fois le remplacement a eu lieu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Replaced {
    /// Le texte de la note après le remplacement.
    pub content: String,
    /// Le nombre d'occurrences remplacées (au moins 1).
    pub count: usize,
}

/// La note de type `kind` et de texte `content`, où `old_text` est remplacé par `new_text` : à sa
/// seule occurrence, ou, si `replace_all`, à toutes.
///
/// # Errors
///
/// [`RefusedReplacement`] : la note n'est pas une note simple, le texte à remplacer est vide ou
/// absent ou égal au nouveau, ou il est répété sans que `replace_all` le permette.
pub fn replaced(
    kind: ContentType,
    content: &str,
    old_text: &str,
    new_text: &str,
    replace_all: bool,
) -> Result<Replaced, RefusedReplacement> {
    if !matches!(kind, ContentType::Note | ContentType::Agenda12Event) {
        return Err(RefusedReplacement::NotANote(kind));
    }
    if old_text.is_empty() {
        return Err(RefusedReplacement::EmptyText);
    }
    if old_text == new_text {
        return Err(RefusedReplacement::SameText);
    }
    let starts: Vec<usize> = content.match_indices(old_text).map(|(at, _)| at).collect();
    match starts.len() {
        0 => Err(RefusedReplacement::NotFound),
        count if count > 1 && !replace_all => Err(RefusedReplacement::Repeated {
            count,
            lines: starts
                .iter()
                .take(MAX_LINES_SHOWN)
                .map(|&at| 1 + content[..at].matches('\n').count())
                .collect(),
        }),
        count => Ok(Replaced {
            content: content.replace(old_text, new_text),
            count,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOTE: ContentType = ContentType::Note;

    fn done(content: &str, old: &str, new: &str, all: bool) -> Replaced {
        replaced(NOTE, content, old, new, all).unwrap()
    }

    fn refused(content: &str, old: &str, new: &str, all: bool) -> RefusedReplacement {
        replaced(NOTE, content, old, new, all).unwrap_err()
    }

    #[test]
    fn the_only_occurrence_is_replaced_and_the_rest_of_the_text_is_untouched() {
        let replaced = done(
            "# Pain\n\nLa farine.\nLe sel.\n",
            "La farine.",
            "Le levain.",
            false,
        );
        assert_eq!(replaced.content, "# Pain\n\nLe levain.\nLe sel.\n");
        assert_eq!(replaced.count, 1);
    }

    #[test]
    fn the_text_is_found_exactly_with_its_case_accents_and_line_breaks() {
        let content = "# A\nÉtape un\nÉtape deux\n";
        assert_eq!(
            done(content, "un\nÉtape", "1\nPhase", false).content,
            "# A\nÉtape 1\nPhase deux\n"
        );
        assert_eq!(
            refused(content, "étape un", "x", false),
            RefusedReplacement::NotFound
        );
        assert_eq!(
            refused(content, "Etape un", "x", false),
            RefusedReplacement::NotFound
        );
        assert_eq!(
            refused(content, "un Étape", "x", false),
            RefusedReplacement::NotFound
        );
    }

    #[test]
    fn a_text_can_be_deleted_by_replacing_it_with_nothing() {
        assert_eq!(done("a b c", " b", "", false).content, "a c");
    }

    #[test]
    fn text_can_be_inserted_by_replacing_a_line_with_itself_and_more() {
        let content = "# T\n\nPremier.\n\nDernier.\n";
        let inserted = done(content, "Premier.\n", "Premier.\n\nMilieu.\n", false);
        assert_eq!(inserted.content, "# T\n\nPremier.\n\nMilieu.\n\nDernier.\n");
    }

    #[test]
    fn the_header_is_kept_as_it_is_when_the_text_does_not_touch_it() {
        let content = "---\ntags: [a]\npinned: true\n---\n# T\nun deux\n";
        let replaced = done(content, "deux", "trois", false);
        assert_eq!(
            replaced.content,
            "---\ntags: [a]\npinned: true\n---\n# T\nun trois\n"
        );
    }

    #[test]
    fn the_text_is_looked_for_in_the_header_too() {
        let content = "---\ntags: [a]\n---\n# T\n";
        assert_eq!(
            done(content, "tags: [a]", "tags: [b]", false).content,
            "---\ntags: [b]\n---\n# T\n"
        );
    }

    #[test]
    fn a_text_that_is_not_there_is_refused() {
        assert_eq!(
            refused("# T\nun", "deux", "x", false),
            RefusedReplacement::NotFound
        );
        assert_eq!(refused("", "deux", "x", true), RefusedReplacement::NotFound);
    }

    #[test]
    fn an_empty_text_to_replace_is_refused_even_for_all() {
        assert_eq!(
            refused("# T", "", "x", false),
            RefusedReplacement::EmptyText
        );
        assert_eq!(refused("# T", "", "x", true), RefusedReplacement::EmptyText);
    }

    #[test]
    fn a_new_text_identical_to_the_old_one_is_refused_before_looking_for_it() {
        assert_eq!(
            refused("# T\nun", "un", "un", false),
            RefusedReplacement::SameText
        );
        assert_eq!(
            refused("# T\nun", "zz", "zz", false),
            RefusedReplacement::SameText
        );
    }

    #[test]
    fn a_repeated_text_is_refused_with_its_count_and_its_lines() {
        let content = "# T\nun\ndeux\nun\n\nun\n";
        assert_eq!(
            refused(content, "un", "1", false),
            RefusedReplacement::Repeated {
                count: 3,
                lines: vec![2, 4, 6]
            }
        );
    }

    #[test]
    fn a_repeated_text_on_the_same_line_counts_every_occurrence_but_cites_the_line_each_time() {
        assert_eq!(
            refused("ab ab", "ab", "x", false),
            RefusedReplacement::Repeated {
                count: 2,
                lines: vec![1, 1]
            }
        );
    }

    #[test]
    fn at_most_five_lines_are_cited() {
        let content = "x\n".repeat(7);
        assert_eq!(
            refused(&content, "x", "y", false),
            RefusedReplacement::Repeated {
                count: 7,
                lines: vec![1, 2, 3, 4, 5]
            }
        );
        let exactly_five = "x\n".repeat(5);
        assert_eq!(
            refused(&exactly_five, "x", "y", false),
            RefusedReplacement::Repeated {
                count: 5,
                lines: vec![1, 2, 3, 4, 5]
            }
        );
    }

    #[test]
    fn every_occurrence_is_replaced_when_asked_and_counted() {
        let replaced = done("un\ndeux\nun\nun", "un", "1", true);
        assert_eq!(replaced.content, "1\ndeux\n1\n1");
        assert_eq!(replaced.count, 3);
    }

    #[test]
    fn replacing_all_of_a_single_occurrence_counts_one() {
        let replaced = done("# T\nun", "un", "1", true);
        assert_eq!(replaced.content, "# T\n1");
        assert_eq!(replaced.count, 1);
    }

    #[test]
    fn occurrences_do_not_overlap() {
        let replaced = done("aaa", "aa", "b", true);
        assert_eq!(replaced.content, "ba");
        assert_eq!(replaced.count, 1);
    }

    #[test]
    fn only_a_simple_note_or_an_event_of_an_agenda_12_can_be_changed() {
        for kind in ContentType::ALL {
            if kind != ContentType::Note && kind != ContentType::Agenda12Event {
                assert_eq!(
                    replaced(kind, "# T\nun", "un", "deux", false),
                    Err(RefusedReplacement::NotANote(kind)),
                    "{kind:?}"
                );
            }
        }
    }

    #[test]
    fn the_type_is_checked_before_the_text() {
        assert_eq!(
            replaced(ContentType::Canvas, "{}", "", "", false),
            Err(RefusedReplacement::NotANote(ContentType::Canvas))
        );
    }

    #[test]
    fn a_canvas_is_sent_to_the_canvas_tools() {
        let said = RefusedReplacement::NotANote(ContentType::Canvas).to_string();
        for expected in [
            "cette note est un canvas",
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
    }

    #[test]
    fn a_crm_and_its_fiches_are_sent_to_the_crm_tools() {
        let crm = RefusedReplacement::NotANote(ContentType::Crm).to_string();
        for expected in [
            "cette note est un CRM",
            "replace_in_note ne change que le texte des notes simples",
            "lisez-le avec read_crm et changez-le avec create_crm_action",
            "ou change_crm_stages",
        ] {
            assert!(crm.contains(expected), "{expected} : {crm}");
        }
        for (kind, name) in [
            (ContentType::CrmCompany, "crm-entreprise"),
            (ContentType::CrmPerson, "crm-personne"),
            (ContentType::CrmAction, "crm-action"),
            (ContentType::CrmProject, "crm-projet"),
        ] {
            let said = RefusedReplacement::NotANote(kind).to_string();
            assert!(
                said.contains(&format!("fiche de CRM, de type « {name} »")),
                "{said}"
            );
            assert!(said.contains("read_crm (la fiche y a sa `ref`)"), "{said}");
            assert!(said.contains("ou change_crm_stages"), "{said}");
        }
    }

    #[test]
    fn an_event_of_an_agenda_12_is_changed_like_a_note_and_the_agenda_is_sent_to_its_tools() {
        let done = replaced(ContentType::Agenda12Event, "# T\nun", "un", "deux", false).unwrap();
        assert_eq!(done.content, "# T\ndeux");
        let said = RefusedReplacement::NotANote(ContentType::Agenda12).to_string();
        for expected in [
            "cette note est un agenda 12",
            "replace_in_note ne change que le texte des notes simples",
            "read_agenda_12",
            "add_agenda_12_event",
            "close_agenda_12_event",
        ] {
            assert!(said.contains(expected), "{expected} : {said}");
        }
    }

    #[test]
    fn each_refusal_tells_the_ai_what_to_do() {
        let said = |refusal: RefusedReplacement| refusal.to_string();
        assert_eq!(
            said(RefusedReplacement::NotANote(ContentType::ResearchNotebook)),
            "cette note est un cahier de recherche : on n'y ajoute que des entrées (add_entry), \
             son texte ne se remplace jamais"
        );
        assert_eq!(
            said(RefusedReplacement::NotANote(ContentType::MindMap)),
            "cette note est une carte mentale : replace_in_note ne change que le texte des notes \
             simples ; lisez la carte avec read_mind_map et modifiez-la avec add_mind_map_child, \
             add_mind_map_sibling, add_mind_map_root, edit_mind_map_node, color_mind_map_node, \
             move_mind_map_node ou delete_mind_map_node"
        );
        assert_eq!(
            said(RefusedReplacement::EmptyText),
            "le texte à remplacer (old_text) est vide : recopiez à l'identique le texte à changer"
        );
        assert_eq!(
            said(RefusedReplacement::SameText),
            "le nouveau texte (new_text) est identique au texte à remplacer (old_text) : rien à \
             changer"
        );
        assert_eq!(
            said(RefusedReplacement::NotFound),
            "le texte à remplacer (old_text) est introuvable dans la note : recopiez-le à \
             l'identique, avec ses majuscules, ses accents, ses espaces et ses retours à la ligne ; \
             rien n'a été changé"
        );
        assert_eq!(
            said(RefusedReplacement::Repeated {
                count: 3,
                lines: vec![2, 4, 6]
            }),
            "le texte à remplacer (old_text) apparaît 3 fois (lignes 2, 4 et 6) : ajoutez du \
             texte autour pour qu'il n'apparaisse qu'une fois, ou passez replace_all à true pour \
             remplacer toutes les occurrences ; rien n'a été changé"
        );
    }

    #[test]
    fn the_cited_lines_are_said_in_french() {
        assert_eq!(lines_said(&[4], 1), "ligne 4");
        assert_eq!(lines_said(&[4, 9], 2), "lignes 4 et 9");
        assert_eq!(lines_said(&[4, 9, 12], 3), "lignes 4, 9 et 12");
        assert_eq!(
            lines_said(&[1, 2, 3, 4, 5], 7),
            "lignes 1, 2, 3, 4, 5 et d'autres"
        );
        assert_eq!(lines_said(&[1, 2, 3, 4, 5], 5), "lignes 1, 2, 3, 4 et 5");
    }
}
