//! La corbeille de l'espace de travail ouvert, vue depuis l'interface.

use application::use_cases::Trash;
use domain::{Folder, NotePath};

use super::Session;
use crate::{ApiError, SavedNote, TrashInfo, TrashedNoteItem};

impl Session {
    /// Place une note dans la corbeille ; rend son chemin dans la corbeille.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, note absente,
    /// stockage indisponible, aucun espace de travail ouvert.
    pub fn trash_note(&self, path: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        Ok(Trash::new(&*store)
            .put_note(&NotePath::parse(path)?)?
            .to_path())
    }

    /// Place un dossier, avec tout ce qu'il contient, dans la corbeille ; rend son chemin dans
    /// la corbeille.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, espace de travail
    /// lui-même, dossier absent, stockage indisponible, aucun espace de travail ouvert.
    pub fn trash_folder(&self, path: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        Ok(Trash::new(&*store)
            .put_folder(&Folder::parse(path)?)?
            .to_path())
    }

    /// Ce que contient la corbeille.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; corbeille illisible, aucun
    /// espace de travail ouvert.
    pub fn list_trash(&self) -> Result<TrashInfo, ApiError> {
        let store = self.store()?;
        let contents = Trash::new(&*store).contents()?;
        Ok(TrashInfo {
            folders: contents.folders.iter().map(Folder::to_path).collect(),
            notes: contents
                .notes
                .iter()
                .map(|n| TrashedNoteItem {
                    path: n.path().to_path(),
                    title: n.title().to_owned(),
                })
                .collect(),
        })
    }

    /// Remet une note de la corbeille à sa place ; rend son chemin dans l'espace de travail.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, note absente de
    /// la corbeille, stockage indisponible, aucun espace de travail ouvert.
    pub fn restore_note(&self, path: &str) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let restored = Trash::new(&*store).restore_note(&NotePath::parse(path)?)?;
        Ok(SavedNote {
            path: restored.to_path(),
        })
    }

    /// Remet un dossier de la corbeille à sa place, avec tout ce qu'il contient ; rend son chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, dossier absent
    /// de la corbeille, stockage indisponible, aucun espace de travail ouvert.
    pub fn restore_folder(&self, path: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        Ok(Trash::new(&*store)
            .restore_folder(&Folder::parse(path)?)?
            .to_path())
    }

    /// Supprime définitivement tout ce que contient la corbeille.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; suppression impossible, aucun
    /// espace de travail ouvert.
    pub fn empty_trash(&self) -> Result<(), ApiError> {
        let store = self.store()?;
        Ok(Trash::new(&*store).empty()?)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;

    fn opened(notes: &[(&str, &str)]) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
        let session = Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        session
    }

    #[test]
    fn a_trashed_note_is_listed_with_its_title_then_restored() {
        let session = opened(&[("Travail/lundi.md", "# Lundi")]);
        assert_eq!(
            session.trash_note("Travail/lundi.md").unwrap(),
            "Travail/lundi.md"
        );
        let trash = session.list_trash().unwrap();
        assert_eq!(trash.folders, ["Travail"]);
        assert_eq!(
            trash.notes,
            [TrashedNoteItem {
                path: "Travail/lundi.md".into(),
                title: "Lundi".into()
            }]
        );
        assert_eq!(
            session.restore_note("Travail/lundi.md").unwrap().path,
            "Travail/lundi.md"
        );
        assert!(session.list_trash().unwrap().notes.is_empty());
    }

    #[test]
    fn a_trashed_folder_is_restored_then_the_trash_emptied() {
        let session = opened(&[("Travail/lundi.md", "# Lundi"), ("Perso/x.md", "# X")]);
        assert_eq!(session.trash_folder("Travail").unwrap(), "Travail");
        assert_eq!(session.restore_folder("Travail").unwrap(), "Travail");
        session.trash_folder("Perso").unwrap();
        session.empty_trash().unwrap();
        assert!(session.list_trash().unwrap().folders.is_empty());
        assert_eq!(session.list_folders().unwrap(), ["Travail"]);
    }

    #[test]
    fn the_workspace_itself_cannot_be_trashed() {
        let session = opened(&[]);
        assert_eq!(
            session.trash_folder("").unwrap_err().message,
            "l'espace de travail lui-même ne peut pas aller dans la corbeille"
        );
    }

    #[test]
    fn invalid_paths_from_the_interface_are_refused() {
        let session = opened(&[]);
        assert!(session.trash_note("../secret.md").is_err());
        assert!(session.restore_note("../secret.md").is_err());
        assert!(session.trash_folder("../x").is_err());
        assert!(session.restore_folder("../x").is_err());
    }
}
