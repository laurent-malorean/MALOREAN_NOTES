//! Le dossier des fiches d'un CRM n'est pas montré dans la liste des dossiers (fiche 0089) : les
//! fiches se gèrent depuis l'écran du CRM, pas à la main. Les dossiers existent toujours sur le
//! disque ; seule la liste les laisse de côté. Il en va de même du dossier des événements d'un
//! agenda 12 (fiche 0104).

use crate::{ContentType, FileName, Folder, NotePath, NoteSummary};

use super::CrmKind;

/// Les dossiers à montrer : `folders` sans les dossiers des fiches d'un CRM ni ce qu'ils
/// contiennent. Un dossier est un dossier de fiches quand il porte le nom du fichier d'un CRM
/// (`clients/` pour `clients.md`, dans le même dossier parent) et que toutes les notes qu'il
/// contient, sous-dossiers compris, sont des fiches du CRM. Une note ordinaire (ou un autre CRM)
/// rangée dedans le laisse visible : rien n'est caché qui contienne autre chose que des fiches.
/// Le dossier des événements d'un agenda 12 se cache de même (`salons/` pour `salons.md`, ses
/// archives comprises) tant qu'il ne contient que des événements.
/// `notes` : toutes les notes de l'espace de travail.
#[must_use]
pub fn without_fiche_folders(folders: Vec<Folder>, notes: &[NoteSummary]) -> Vec<Folder> {
    let hidden: Vec<Folder> = folders
        .iter()
        .filter(|folder| is_fiche_folder(folder, notes))
        .cloned()
        .collect();
    folders
        .into_iter()
        .filter(|folder| !hidden.iter().any(|hidden| folder.is_within(hidden)))
        .collect()
}

/// Vrai si `folder` porte le nom du fichier d'un CRM ou d'un agenda 12 et ne contient que ses
/// fiches ou ses événements.
fn is_fiche_folder(folder: &Folder, notes: &[NoteSummary]) -> bool {
    let Some(owner) = crm_of(folder) else {
        return false;
    };
    let Some(kind) = notes
        .iter()
        .find(|note| note.path() == &owner)
        .map(NoteSummary::content_type)
    else {
        return false;
    };
    let belongs: fn(&NoteSummary) -> bool = match kind {
        ContentType::Crm => is_fiche,
        ContentType::Agenda12 => is_event,
        _ => return false,
    };
    notes
        .iter()
        .filter(|note| note.path().folder().is_within(folder))
        .all(belongs)
}

/// Le chemin du fichier du CRM dont `folder` serait le dossier des fiches : `clients.md` à côté
/// de `clients/`.
fn crm_of(folder: &Folder) -> Option<NotePath> {
    let stem = folder.name()?.as_str();
    let name = FileName::parse(&format!("{stem}.md")).ok()?;
    Some(NotePath::new(folder.parent()?, name))
}

/// Vrai pour un événement d'un agenda 12.
fn is_event(note: &NoteSummary) -> bool {
    note.content_type() == ContentType::Agenda12Event
}

/// Vrai pour une fiche d'entreprise, de personne, d'action ou de projet ; faux pour le CRM.
fn is_fiche(note: &NoteSummary) -> bool {
    note.content_type()
        .crm_kind()
        .is_some_and(|kind| kind != CrmKind::Crm)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Modified;

    const EVENT: &str = "agenda-12-evenement";

    fn note(path: &str, kind: &str) -> NoteSummary {
        let content = format!("---\ntype: {kind}\n---\n# Titre\n");
        NoteSummary::new(NotePath::parse(path).unwrap(), &content, Modified(1))
    }

    fn plain(path: &str) -> NoteSummary {
        NoteSummary::new(NotePath::parse(path).unwrap(), "# Titre\n", Modified(1))
    }

    fn folders(paths: &[&str]) -> Vec<Folder> {
        paths.iter().map(|p| Folder::parse(p).unwrap()).collect()
    }

    fn shown(paths: &[&str], notes: &[NoteSummary]) -> Vec<String> {
        without_fiche_folders(folders(paths), notes)
            .iter()
            .map(Folder::to_path)
            .collect()
    }

    const ALL: [&str; 5] = [
        "toto",
        "toto/crm1",
        "toto/crm1/actions",
        "toto/crm1/personnes",
        "toto/autre",
    ];

    fn crm_with_fiches() -> Vec<NoteSummary> {
        vec![
            note("toto/crm1.md", "crm"),
            note("toto/crm1/actions/a.md", "crm-action"),
            note("toto/crm1/personnes/p.md", "crm-personne"),
            plain("toto/autre/x.md"),
        ]
    }

    #[test]
    fn the_folder_of_the_fiches_of_a_crm_and_its_subfolders_are_not_shown() {
        assert_eq!(shown(&ALL, &crm_with_fiches()), ["toto", "toto/autre"]);
    }

    #[test]
    fn each_kind_of_fiche_may_fill_the_folder() {
        for kind in ["crm-entreprise", "crm-personne", "crm-action", "crm-projet"] {
            let notes = [note("c.md", "crm"), note("c/entreprises/f.md", kind)];
            assert_eq!(shown(&["c", "c/entreprises"], &notes), Vec::<String>::new());
        }
    }

    #[test]
    fn an_ordinary_note_in_the_folder_keeps_it_and_its_subfolders_shown() {
        let mut notes = crm_with_fiches();
        notes.push(plain("toto/crm1/ma-note.md"));
        assert_eq!(shown(&ALL, &notes), ALL);
    }

    #[test]
    fn an_ordinary_note_deep_in_the_folder_keeps_it_shown() {
        let mut notes = crm_with_fiches();
        notes.push(plain("toto/crm1/actions/ma-note.md"));
        assert_eq!(shown(&ALL, &notes), ALL);
    }

    #[test]
    fn another_crm_in_the_folder_keeps_it_shown() {
        let mut notes = crm_with_fiches();
        notes.push(note("toto/crm1/sous-crm.md", "crm"));
        assert_eq!(shown(&ALL, &notes), ALL);
    }

    #[test]
    fn a_folder_named_like_a_note_that_is_not_a_crm_stays_shown() {
        let notes = [
            plain("toto/crm1.md"),
            note("toto/crm1/actions/a.md", "crm-action"),
        ];
        assert_eq!(
            shown(&["toto", "toto/crm1", "toto/crm1/actions"], &notes),
            ["toto", "toto/crm1", "toto/crm1/actions"]
        );
    }

    #[test]
    fn a_folder_named_like_a_crm_of_another_folder_stays_shown() {
        let notes = [
            note("crm1.md", "crm"),
            note("toto/crm1/actions/a.md", "crm-action"),
        ];
        assert_eq!(
            shown(&["toto", "toto/crm1", "toto/crm1/actions"], &notes),
            ["toto", "toto/crm1", "toto/crm1/actions"]
        );
    }

    #[test]
    fn a_folder_of_a_crm_without_any_fiche_is_not_shown() {
        let notes = [note("toto/crm1.md", "crm")];
        assert_eq!(shown(&["toto", "toto/crm1"], &notes), ["toto"]);
    }

    #[test]
    fn the_subfolders_of_the_fiches_folder_alone_are_not_taken_for_one() {
        let notes = [
            note("toto/crm1.md", "crm"),
            note("toto/crm1/actions/a.md", "crm-action"),
            plain("toto/crm1/ma-note.md"),
        ];
        assert_eq!(shown(&["toto/crm1/actions"], &notes), ["toto/crm1/actions"]);
    }

    #[test]
    fn a_crm_at_the_root_hides_its_folder() {
        let notes = [note("c.md", "crm"), note("c/actions/a.md", "crm-action")];
        assert_eq!(shown(&["c", "c/actions"], &notes), Vec::<String>::new());
    }

    #[test]
    fn two_crms_hide_each_their_folder() {
        let notes = [
            note("a.md", "crm"),
            note("a/actions/x.md", "crm-action"),
            note("b.md", "crm"),
            note("b/projets/y.md", "crm-projet"),
            plain("c/z.md"),
        ];
        assert_eq!(
            shown(&["a", "a/actions", "b", "b/projets", "c"], &notes),
            ["c"]
        );
    }

    #[test]
    fn the_folder_of_the_events_of_an_agenda_12_and_its_archives_are_not_shown() {
        let notes = [
            note("pro/salons.md", "agenda-12"),
            note("pro/salons/a.md", EVENT),
            note("pro/salons/archives/b.md", EVENT),
            plain("pro/autre/x.md"),
        ];
        assert_eq!(
            shown(
                &["pro", "pro/salons", "pro/salons/archives", "pro/autre"],
                &notes
            ),
            ["pro", "pro/autre"]
        );
    }

    #[test]
    fn an_ordinary_note_in_the_folder_of_the_events_keeps_it_shown() {
        let notes = [
            note("salons.md", "agenda-12"),
            note("salons/a.md", EVENT),
            plain("salons/ma-note.md"),
        ];
        assert_eq!(shown(&["salons"], &notes), ["salons"]);
    }

    #[test]
    fn an_agenda_12_without_event_hides_nothing_it_has_no_folder_and_a_folder_of_a_note_stays() {
        let notes = [note("salons.md", "agenda-12")];
        assert_eq!(shown(&["salons"], &notes), Vec::<String>::new());
        let ordinary = [plain("salons.md"), note("salons/a.md", EVENT)];
        assert_eq!(shown(&["salons"], &ordinary), ["salons"]);
    }

    #[test]
    fn a_crm_fiche_in_the_folder_of_an_agenda_or_an_event_in_that_of_a_crm_keeps_it_shown() {
        let agenda = [
            note("salons.md", "agenda-12"),
            note("salons/actions/a.md", "crm-action"),
        ];
        assert_eq!(
            shown(&["salons", "salons/actions"], &agenda),
            ["salons", "salons/actions"]
        );
        let crm = [note("c.md", "crm"), note("c/a.md", EVENT)];
        assert_eq!(shown(&["c"], &crm), ["c"]);
    }
}
