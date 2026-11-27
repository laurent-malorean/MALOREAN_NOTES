//! La note des favoris (fiche 0102) : repérée par son chemin, elle le suit quand elle est renommée
//! ou déplacée, seule ou avec son dossier, et n'est plus la note des favoris quand elle part à la
//! corbeille. Et quels contenus peuvent être des favoris.

use crate::{ContentType, Folder, NotePath};

/// Un changement de place fait par l'application dans l'espace de travail.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlaceChange<'a> {
    /// Une note renommée ou déplacée.
    NoteMoved {
        /// Son chemin avant.
        from: &'a NotePath,
        /// Son chemin après.
        to: &'a NotePath,
    },
    /// Un dossier renommé ou déplacé, avec tout ce qu'il contient.
    FolderMoved {
        /// Son chemin avant.
        from: &'a Folder,
        /// Son chemin après.
        to: &'a Folder,
    },
    /// Une note mise à la corbeille.
    NoteTrashed(&'a NotePath),
    /// Un dossier mis à la corbeille, avec tout ce qu'il contient.
    FolderTrashed(&'a Folder),
}

/// Le chemin de la note des favoris `note` après `change` : le même si le changement ne la touche
/// pas, son nouveau chemin si elle a bougé, rien si elle est partie à la corbeille.
#[must_use]
pub fn followed(note: &NotePath, change: PlaceChange<'_>) -> Option<NotePath> {
    match change {
        PlaceChange::NoteMoved { from, to } if note == from => Some(to.clone()),
        PlaceChange::FolderMoved { from, to } => Some(NotePath::new(
            note.folder().moved(from, to),
            note.name().clone(),
        )),
        PlaceChange::NoteTrashed(trashed) if note == trashed => None,
        PlaceChange::FolderTrashed(trashed) if note.folder().is_within(trashed) => None,
        PlaceChange::NoteMoved { .. }
        | PlaceChange::NoteTrashed(_)
        | PlaceChange::FolderTrashed(_) => Some(note.clone()),
    }
}

/// Un contenu de ce type peut-il être mis en favori ? Une note, un cahier de recherche, une carte
/// mentale, un canvas, un CRM entier et un agenda 12 entier le peuvent ; une fiche du CRM, un
/// événement d'un agenda 12, une entrée de cahier et un nœud de carte mentale n'ont pas d'étoile.
#[must_use]
pub fn can_be_favorite(kind: ContentType) -> bool {
    matches!(
        kind,
        ContentType::Note
            | ContentType::ResearchNotebook
            | ContentType::MindMap
            | ContentType::Canvas
            | ContentType::Crm
            | ContentType::Agenda12
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn folder(text: &str) -> Folder {
        Folder::parse(text).unwrap()
    }

    #[test]
    fn a_renamed_or_moved_note_is_followed() {
        let change = PlaceChange::NoteMoved {
            from: &path("A/favoris.md"),
            to: &path("B/mes-favoris.md"),
        };
        assert_eq!(
            followed(&path("A/favoris.md"), change),
            Some(path("B/mes-favoris.md"))
        );
    }

    #[test]
    fn another_note_moving_changes_nothing() {
        let change = PlaceChange::NoteMoved {
            from: &path("A/autre.md"),
            to: &path("B/autre.md"),
        };
        assert_eq!(
            followed(&path("A/favoris.md"), change),
            Some(path("A/favoris.md"))
        );
    }

    #[test]
    fn a_note_follows_its_folder_at_any_depth() {
        let change = PlaceChange::FolderMoved {
            from: &folder("A"),
            to: &folder("Z/A2"),
        };
        assert_eq!(
            followed(&path("A/favoris.md"), change),
            Some(path("Z/A2/favoris.md"))
        );
        assert_eq!(
            followed(&path("A/B/favoris.md"), change),
            Some(path("Z/A2/B/favoris.md"))
        );
    }

    #[test]
    fn a_folder_moving_beside_the_note_changes_nothing() {
        let change = PlaceChange::FolderMoved {
            from: &folder("A"),
            to: &folder("Z"),
        };
        assert_eq!(
            followed(&path("AB/favoris.md"), change),
            Some(path("AB/favoris.md"))
        );
        assert_eq!(
            followed(&path("favoris.md"), change),
            Some(path("favoris.md"))
        );
    }

    #[test]
    fn the_trashed_note_is_not_the_favorites_note_any_more() {
        assert_eq!(
            followed(
                &path("A/favoris.md"),
                PlaceChange::NoteTrashed(&path("A/favoris.md"))
            ),
            None
        );
        assert_eq!(
            followed(
                &path("A/favoris.md"),
                PlaceChange::NoteTrashed(&path("A/autre.md"))
            ),
            Some(path("A/favoris.md"))
        );
    }

    #[test]
    fn a_note_in_a_trashed_folder_goes_with_it() {
        for note in ["A/favoris.md", "A/B/favoris.md"] {
            assert_eq!(
                followed(&path(note), PlaceChange::FolderTrashed(&folder("A"))),
                None
            );
        }
        assert_eq!(
            followed(
                &path("favoris.md"),
                PlaceChange::FolderTrashed(&folder("A"))
            ),
            Some(path("favoris.md"))
        );
        assert_eq!(
            followed(
                &path("AB/favoris.md"),
                PlaceChange::FolderTrashed(&folder("A"))
            ),
            Some(path("AB/favoris.md"))
        );
    }

    #[test]
    fn only_a_note_a_notebook_a_mind_map_a_canvas_and_a_crm_can_be_favorites() {
        let can: Vec<ContentType> = ContentType::ALL
            .into_iter()
            .filter(|kind| can_be_favorite(*kind))
            .collect();
        assert_eq!(
            can,
            [
                ContentType::Note,
                ContentType::ResearchNotebook,
                ContentType::MindMap,
                ContentType::Canvas,
                ContentType::Crm,
                ContentType::Agenda12,
            ]
        );
    }
}
