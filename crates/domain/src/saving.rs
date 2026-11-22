//! Décider ce que devient une note qu'on enregistre ou qu'on crée : son nom et son contenu.

use crate::attachments::relink;
use crate::journal::keeps_date_name;
use crate::{FileName, Folder, NotePath, Title};

/// Ce que devient une note enregistrée : le nom de fichier qu'elle doit porter
/// et le contenu à écrire (liens vers ses pièces jointes déjà mis à jour).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavePlan {
    file_name: FileName,
    content: String,
}

impl SavePlan {
    /// Le nom de fichier que la note doit porter après l'enregistrement.
    #[must_use]
    pub fn file_name(&self) -> &FileName {
        &self.file_name
    }

    /// Le contenu à écrire.
    #[must_use]
    pub fn content(&self) -> &str {
        &self.content
    }
}

/// Le nom et le contenu d'une note enregistrée sous `current`.
///
/// Le nom suit le titre, sauf pour une note du jour dont le titre est encore sa date, qui garde
/// son nom daté (voir [`crate::journal`]). S'il est pris par une autre note de `existing`, il reçoit
/// le premier suffixe `-2`, `-3`… libre. La note elle-même ne compte pas comme une autre.
#[must_use]
pub fn plan_save(current: &FileName, content: &str, existing: &[FileName]) -> SavePlan {
    // Sans titre `#`, le fichier garde son nom : une note importée n'est pas renommée.
    let wanted = match Title::of(content) {
        Some(title) if !keeps_date_name(current, content) => FileName::from_title(Some(&title)),
        _ => current.clone(),
    };
    let file_name =
        wanted.deduplicated(|candidate| candidate != current && existing.contains(candidate));
    let content = if &file_name == current {
        content.to_owned()
    } else {
        relink(content, current, &file_name)
    };
    SavePlan { file_name, content }
}

/// Le chemin d'une note déplacée dans `into`, où se trouvent déjà les notes `existing` :
/// elle garde son nom, ou reçoit le premier suffixe `-2`, `-3`… libre.
#[must_use]
pub fn moved_note(note: &NotePath, into: &Folder, existing: &[FileName]) -> NotePath {
    let name = note
        .name()
        .clone()
        .deduplicated(|candidate| existing.contains(candidate));
    NotePath::new(into.clone(), name)
}

/// Le nom d'une nouvelle note vide : `sans-titre.md`, ou le premier suffixe libre.
#[must_use]
pub fn new_note_name(existing: &[FileName]) -> FileName {
    FileName::from_title(None).deduplicated(|candidate| existing.contains(candidate))
}

/// Le nom d'une note créée avec le texte `content` : tiré de son titre, ou le premier
/// suffixe `-2`, `-3`… libre parmi `existing`.
#[must_use]
pub fn created_note_name(content: &str, existing: &[FileName]) -> FileName {
    FileName::from_title(Title::of(content).as_ref())
        .deduplicated(|candidate| existing.contains(candidate))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn name(text: &str) -> FileName {
        FileName::parse(text).unwrap()
    }

    #[test]
    fn a_note_whose_title_matches_its_name_keeps_it() {
        let plan = plan_save(
            &name("courses.md"),
            "# Courses\n- pain",
            &[name("courses.md")],
        );
        assert_eq!(plan.file_name(), &name("courses.md"));
        assert_eq!(plan.content(), "# Courses\n- pain");
    }

    #[test]
    fn a_new_title_gives_a_new_kebab_case_name() {
        let plan = plan_save(
            &name("ancien-nom.md"),
            "# Mon idée",
            &[name("ancien-nom.md")],
        );
        assert_eq!(plan.file_name(), &name("mon-idee.md"));
    }

    #[test]
    fn a_name_taken_by_another_note_gets_a_numbered_suffix() {
        let existing = [name("idee.md"), name("brouillon.md")];
        let plan = plan_save(&name("brouillon.md"), "# Idée", &existing);
        assert_eq!(plan.file_name(), &name("idee-2.md"));
    }

    #[test]
    fn a_note_already_holding_its_numbered_name_keeps_it() {
        let existing = [name("idee.md"), name("idee-2.md")];
        let plan = plan_save(&name("idee-2.md"), "# Idée\nsuite", &existing);
        assert_eq!(plan.file_name(), &name("idee-2.md"));
    }

    #[test]
    fn attachment_links_follow_the_new_name() {
        let plan = plan_save(
            &name("voyage.md"),
            "# Lisbonne\n![vue](voyage.assets/vue.png)",
            &[],
        );
        assert_eq!(
            plan.content(),
            "# Lisbonne\n![vue](lisbonne.assets/vue.png)"
        );
    }

    #[test]
    fn a_note_without_title_keeps_its_name() {
        let plan = plan_save(&name("courses.md"), "plus de titre", &[name("courses.md")]);
        assert_eq!(plan.file_name(), &name("courses.md"));
        let imported = plan_save(&name("Habitus (de classe).md"), "## Idée", &[]);
        assert_eq!(imported.file_name(), &name("Habitus (de classe).md"));
    }

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn folder(text: &str) -> Folder {
        Folder::parse(text).unwrap()
    }

    #[test]
    fn a_moved_note_keeps_its_name_in_its_new_folder() {
        let moved = moved_note(&path("courses.md"), &folder("Perso"), &[name("idee.md")]);
        assert_eq!(moved, path("Perso/courses.md"));
    }

    #[test]
    fn a_moved_note_whose_name_is_taken_gets_a_numbered_suffix() {
        let existing = [name("courses.md"), name("courses-2.md")];
        let moved = moved_note(&path("Travail/courses.md"), &Folder::root(), &existing);
        assert_eq!(moved, path("courses-3.md"));
    }

    #[test]
    fn a_new_note_is_untitled() {
        assert_eq!(new_note_name(&[]), name("sans-titre.md"));
    }

    #[test]
    fn a_new_note_never_takes_the_name_of_another_untitled_note() {
        assert_eq!(
            new_note_name(&[name("sans-titre.md")]),
            name("sans-titre-2.md")
        );
    }

    #[test]
    fn a_daily_note_keeps_its_date_name_while_its_title_is_its_date() {
        let current = name("2026-11-18.md");
        let plan = plan_save(
            &current,
            "# 18 novembre 2026\ntexte",
            std::slice::from_ref(&current),
        );
        assert_eq!(plan.file_name(), &current);
        let plan = plan_save(&current, "# Voyage", std::slice::from_ref(&current));
        assert_eq!(plan.file_name(), &name("voyage.md"));
    }
}
