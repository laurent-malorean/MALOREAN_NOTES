//! Carte mentale (fiche 0050) : en créer une, la lire, l'enregistrer.

use domain::mind_map::{MindMap, is_mind_map, new_mind_map};
use domain::{Folder, NotePath};

use crate::use_cases::CreateNote;
use crate::{AppError, NoteStore};

/// Une nouvelle carte mentale, sans nœud, qui n'écrase aucune autre note.
#[derive(Debug)]
pub struct CreateMindMap<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateMindMap<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le chemin de la carte titrée `title` créée dans `folder`, sous le nom tiré de son titre.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si le dossier ne peut pas être lu ou écrit.
    pub fn execute(&self, folder: &Folder, title: &str) -> Result<NotePath, AppError> {
        CreateNote::new(self.store).with_content(folder, &new_mind_map(title))
    }
}

/// La carte mentale d'une note.
#[derive(Debug)]
pub struct ReadMindMap<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ReadMindMap<'a> {
    /// Le cas d'usage, branché sur le stockage de l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// La carte de la note `path`.
    ///
    /// # Errors
    ///
    /// [`AppError::NotAMindMap`] si la note n'en est pas une ; [`AppError::NoteNotFound`] si elle
    /// n'existe pas ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, path: &NotePath) -> Result<MindMap, AppError> {
        let content = self.store.read(path)?.content;
        if !is_mind_map(&content) {
            return Err(AppError::NotAMindMap);
        }
        Ok(MindMap::parse(&content))
    }
}

/// L'enregistrement d'une carte : sa liste et la place de ses nœuds racines, le reste du fichier
/// inchangé.
#[derive(Debug)]
pub struct SaveMindMap<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> SaveMindMap<'a> {
    /// Le cas d'usage, branché sur le stockage de l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Écrit `map` dans la note `path`.
    ///
    /// # Errors
    ///
    /// [`AppError::NotAMindMap`] si la note n'en est pas une ; [`AppError::NoteNotFound`] si elle
    /// n'existe pas ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, path: &NotePath, map: &MindMap) -> Result<(), AppError> {
        let original = self.store.read(path)?.content;
        if !is_mind_map(&original) {
            return Err(AppError::NotAMindMap);
        }
        self.store.write(path, &map.written_on(&original))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use domain::mind_map::MindNode;

    use super::*;
    use crate::testing::InMemoryNoteStore;

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    #[test]
    fn a_mind_map_is_created_under_the_name_of_its_title() {
        let store = InMemoryNoteStore::with_notes(&[("Idees/projet.md", "# Autre")]);
        let created = CreateMindMap::new(&store)
            .execute(&Folder::parse("Idees").unwrap(), "Projet")
            .unwrap();
        assert_eq!(created, path("Idees/projet-2.md"));
        assert_eq!(
            store.read(&created).unwrap().content,
            "---\ntype: carte-mentale\n---\n# Projet\n"
        );
    }

    #[test]
    fn a_map_is_read_and_saved_keeping_the_title_and_other_properties() {
        let text = "---\ntype: carte-mentale\ntags: [a]\n---\n# Projet\n\n- A\n";
        let store = InMemoryNoteStore::with_notes(&[("p.md", text)]);
        let mut map = ReadMindMap::new(&store).execute(&path("p.md")).unwrap();
        map.roots[0].children.push(MindNode {
            title: "B".into(),
            ..MindNode::default()
        });
        SaveMindMap::new(&store)
            .execute(&path("p.md"), &map)
            .unwrap();
        assert_eq!(
            store.read(&path("p.md")).unwrap().content,
            "---\ntype: carte-mentale\ntags: [a]\nracines: [{x: 0, y: 0}]\n---\n# Projet\n\n- A\n  - B\n"
        );
    }

    #[test]
    fn a_note_that_is_not_a_mind_map_is_neither_read_nor_written() {
        let store = InMemoryNoteStore::with_notes(&[("n.md", "# Note\n\n- A\n")]);
        assert!(matches!(
            ReadMindMap::new(&store).execute(&path("n.md")),
            Err(AppError::NotAMindMap)
        ));
        assert!(matches!(
            SaveMindMap::new(&store).execute(&path("n.md"), &MindMap::default()),
            Err(AppError::NotAMindMap)
        ));
        assert_eq!(
            store.read(&path("n.md")).unwrap().content,
            "# Note\n\n- A\n"
        );
        assert!(matches!(
            ReadMindMap::new(&store).execute(&path("absente.md")),
            Err(AppError::NoteNotFound(_))
        ));
    }
}
