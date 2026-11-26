//! Les cartes mentales de l'espace de travail ouvert, vues depuis l'interface : en créer une, la
//! lire, l'enregistrer (fiche 0050).

use application::use_cases::{CreateMindMap, EditMindMap, ReadMindMap, SaveMindMap};
use domain::mind_map::MindMap;
use domain::mind_map_editing::RefusedMindMapEdit;
use domain::mind_map_reading::ReadableMindMap;
use domain::{Folder, NotePath};

use super::Session;
use crate::{ApiError, MindMapItem, SavedNote};

impl Session {
    /// Crée dans `folder` une carte mentale titrée `title` ; rend son chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; dossier invalide, stockage
    /// indisponible, aucun espace de travail ouvert.
    pub fn create_mind_map(&self, folder: &str, title: &str) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let created = CreateMindMap::new(&*store).execute(&Folder::parse(folder)?, title)?;
        Ok(SavedNote {
            path: created.to_path(),
        })
    }

    /// La carte mentale de la note `path`.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; note qui n'est pas une carte,
    /// chemin invalide, stockage indisponible, aucun espace de travail ouvert.
    pub fn read_mind_map(&self, path: &str) -> Result<MindMapItem, ApiError> {
        let store = self.store()?;
        Ok(ReadMindMap::new(&*store)
            .execute(&NotePath::parse(path)?)?
            .into())
    }

    /// La carte mentale de la note `path` en arbre, avec son titre : ce que l'outil
    /// `read_mind_map` donne à une IA (fiche 0080).
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; note qui n'est pas une carte,
    /// chemin invalide, stockage indisponible, aucun espace de travail ouvert.
    pub(super) fn read_mind_map_outline(
        &self,
        path: &str,
    ) -> Result<(String, ReadableMindMap), ApiError> {
        let store = self.store()?;
        let (title, map) = ReadMindMap::new(&*store).titled(&NotePath::parse(path)?)?;
        Ok((title, map.readable()))
    }

    /// Joue `gesture` sur la carte mentale `path` avec les règles de l'enregistrement d'une carte
    /// (fiche 0080) : la version d'avant est gardée, l'index suit, le sens se recalcule ; rien
    /// n'est écrit si le geste est refusé. Rend ce que le geste rend.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; note qui n'est pas une carte, geste
    /// refusé, chemin invalide, stockage indisponible, aucun espace de travail ouvert.
    pub(super) fn edit_mind_map<T>(
        &self,
        path: &str,
        gesture: impl FnOnce(&mut MindMap) -> Result<T, RefusedMindMapEdit>,
    ) -> Result<T, ApiError> {
        let opened = self.opened()?;
        let note = NotePath::parse(path)?;
        let edited = EditMindMap::new(&*opened.store, &*opened.history, &*self.clock)
            .execute(&note, gesture)?;
        self.saved_since_version(&note, &note)?;
        self.worker.request();
        Ok(edited.outcome)
    }

    /// Enregistre `map` dans la carte `path`.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; note qui n'est pas une carte,
    /// chemin invalide, stockage indisponible, aucun espace de travail ouvert.
    pub fn save_mind_map(&self, path: &str, map: MindMapItem) -> Result<(), ApiError> {
        let store = self.store()?;
        SaveMindMap::new(&*store).execute(&NotePath::parse(path)?, &map.into())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;

    fn session(notes: &[(&str, &str)]) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
        Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        )
    }

    #[test]
    fn a_mind_map_is_created_read_and_saved() {
        let session = session(&[("Idees/note.md", "# Note")]);
        assert!(session.create_mind_map("", "Projet").is_err());
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        let created = session.create_mind_map("Idees", "Projet").unwrap();
        assert_eq!(created.path, "Idees/projet.md");
        let mut map = session.read_mind_map(&created.path).unwrap();
        assert!(map.roots.is_empty());
        map.roots.push(crate::MindNodeItem {
            title: "Clients".into(),
            color: Some("bleu".into()),
            detail: vec![],
            children: vec![],
        });
        session.save_mind_map(&created.path, map).unwrap();
        let read = session.read_mind_map(&created.path).unwrap();
        assert_eq!(read.roots[0].title, "Clients");
        assert_eq!(read.roots[0].color.as_deref(), Some("bleu"));
        assert_eq!((read.places[0].x, read.places[0].y), (0.0, 0.0));
    }

    #[test]
    fn a_note_that_is_not_a_mind_map_is_refused_with_a_readable_message() {
        let session = session(&[("note.md", "# Note")]);
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        assert_eq!(
            session.read_mind_map("note.md").unwrap_err().message,
            "cette note n'est pas une carte mentale"
        );
        assert!(session.read_mind_map("../x.md").is_err());
        assert!(session.create_mind_map("../x", "T").is_err());
    }
}
