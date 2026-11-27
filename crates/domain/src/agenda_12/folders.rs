//! Où sont les événements d'un agenda 12 (format `doc/format/agenda-12.md` § 3) : le dossier qui porte
//! le nom de son fichier, et son sous-dossier `archives/` pour les événements clos.

use crate::{FileName, Folder, FolderName, NotePath};

/// Le nom du sous-dossier des événements clos.
pub const ARCHIVES: &str = "archives";

/// Le dossier des événements de l'agenda 12 `agenda` : `salons/` pour `salons.md`, à côté de lui.
/// Rien si le nom du fichier ne donne pas de nom de dossier.
#[must_use]
pub fn events_folder(agenda: &NotePath) -> Option<Folder> {
    crate::crm::fiches_folder(agenda)
}

/// Le dossier des événements clos de l'agenda 12 `agenda` : `salons/archives/`.
#[must_use]
pub fn archives_folder(agenda: &NotePath) -> Option<Folder> {
    let archives = FolderName::parse(ARCHIVES).ok()?;
    Some(events_folder(agenda)?.join(archives))
}

/// L'agenda 12 d'un événement et son état, déduits de son seul chemin.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventPlace {
    /// Le fichier de l'agenda 12 : `salons.md` pour `salons/x.md` et pour `salons/archives/x.md`.
    pub agenda: NotePath,
    /// L'événement est rangé dans `archives/` : il est clos.
    pub closed: bool,
}

/// Où se range l'événement de ce chemin : l'agenda 12 qui le contient et s'il est clos. Un fichier
/// directement dans un dossier `archives` est clos, et son agenda 12 est celui du dossier au-dessus
/// (`salons/archives/x.md` appartient à `salons.md`) ; ailleurs, l'agenda 12 est celui du dossier qui
/// le contient. Rien à la racine de l'espace de travail.
#[must_use]
pub fn event_place(path: &NotePath) -> Option<EventPlace> {
    let folder = path.folder();
    let name = folder.name()?;
    if name.as_str() == ARCHIVES && folder.parent()?.name().is_some() {
        return Some(EventPlace {
            agenda: agenda_of(&folder.parent()?)?,
            closed: true,
        });
    }
    Some(EventPlace {
        agenda: agenda_of(folder)?,
        closed: false,
    })
}

/// Le fichier de l'agenda 12 dont `folder` est le dossier des événements : `salons.md` à côté de
/// `salons/`.
fn agenda_of(folder: &Folder) -> Option<NotePath> {
    let stem = folder.name()?.as_str();
    let name = FileName::parse(&format!("{stem}.md")).ok()?;
    Some(NotePath::new(folder.parent()?, name))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    #[test]
    fn the_folder_of_the_events_sits_beside_the_agenda_under_its_name() {
        assert_eq!(
            events_folder(&path("pro/salons.md")).unwrap().to_path(),
            "pro/salons"
        );
        assert_eq!(
            events_folder(&path("salons.md")).unwrap().to_path(),
            "salons"
        );
    }

    #[test]
    fn the_archives_are_a_subfolder_of_the_events_folder() {
        assert_eq!(
            archives_folder(&path("pro/salons.md")).unwrap().to_path(),
            "pro/salons/archives"
        );
        assert_eq!(
            archives_folder(&path("salons.md")).unwrap().to_path(),
            "salons/archives"
        );
    }

    #[test]
    fn an_event_in_the_folder_belongs_to_the_agenda_beside_it_and_is_open() {
        let place = event_place(&path("pro/salons/x.md")).unwrap();
        assert_eq!(place.agenda, path("pro/salons.md"));
        assert!(!place.closed);
        assert_eq!(
            event_place(&path("salons/x.md")).unwrap().agenda,
            path("salons.md")
        );
    }

    #[test]
    fn an_event_in_the_archives_belongs_to_the_same_agenda_and_is_closed() {
        let place = event_place(&path("pro/salons/archives/x.md")).unwrap();
        assert_eq!(place.agenda, path("pro/salons.md"));
        assert!(place.closed);
        let at_root = event_place(&path("salons/archives/x.md")).unwrap();
        assert_eq!(at_root.agenda, path("salons.md"));
        assert!(at_root.closed);
    }

    #[test]
    fn a_note_at_the_root_is_in_no_agenda() {
        assert_eq!(event_place(&path("x.md")), None);
    }

    #[test]
    fn an_archives_folder_at_the_root_is_the_events_folder_of_an_agenda_named_archives() {
        let place = event_place(&path("archives/x.md")).unwrap();
        assert_eq!(place.agenda, path("archives.md"));
        assert!(!place.closed);
    }

    #[test]
    fn a_deeper_folder_is_not_the_archives_of_the_agenda_above() {
        let place = event_place(&path("pro/salons/archives/2026/x.md")).unwrap();
        assert_eq!(place.agenda, path("pro/salons/archives/2026.md"));
        assert!(!place.closed);
    }
}
