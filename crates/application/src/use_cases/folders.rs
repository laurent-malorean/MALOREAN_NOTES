//! Ranger les notes dans des dossiers : les lister, en créer, les renommer, les déplacer.

use domain::folder::sort_for_display;
use domain::{Folder, FolderName};

use crate::{AppError, NoteStore};

/// Les dossiers de l'espace de travail, dans l'ordre de l'arbre.
#[derive(Debug)]
pub struct ListFolders<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ListFolders<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Tous les sous-dossiers, chacun suivi des siens, par ordre alphabétique.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'espace de travail ne peut pas être lue.
    pub fn execute(&self) -> Result<Vec<Folder>, AppError> {
        Ok(sort_for_display(self.store.folders()?))
    }
}

/// Crée un dossier vide dans un autre.
#[derive(Debug)]
pub struct CreateFolder<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateFolder<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le dossier `name` créé dans `parent`.
    ///
    /// # Errors
    ///
    /// [`AppError::FolderNameTaken`] si ce dossier existe déjà, [`AppError::FolderNotFound`]
    /// si `parent` n'existe pas, [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, parent: &Folder, name: FolderName) -> Result<Folder, AppError> {
        let folder = parent.join(name);
        self.store.create_folder(&folder)?;
        Ok(folder)
    }
}

/// Renomme un dossier ; il reste à sa place, avec tout ce qu'il contient.
#[derive(Debug)]
pub struct RenameFolder<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> RenameFolder<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le dossier sous son nouveau nom.
    ///
    /// # Errors
    ///
    /// [`AppError::RootIsFixed`] pour la racine, [`AppError::FolderNameTaken`] si un
    /// dossier voisin porte ce nom, [`AppError::FolderNotFound`] si le dossier n'existe pas,
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, folder: &Folder, name: FolderName) -> Result<Folder, AppError> {
        let parent = folder.parent().ok_or(AppError::RootIsFixed)?;
        let renamed = parent.join(name);
        if &renamed != folder {
            self.store.move_folder(folder, &renamed)?;
        }
        Ok(renamed)
    }
}

/// Déplace un dossier dans un autre, avec tout ce qu'il contient.
#[derive(Debug)]
pub struct MoveFolder<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> MoveFolder<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le dossier à sa nouvelle place, dans `into` ; inchangé s'il y est déjà.
    ///
    /// # Errors
    ///
    /// [`AppError::RootIsFixed`] pour la racine, [`AppError::FolderInsideItself`] si `into`
    /// est le dossier ou l'un de ses sous-dossiers, [`AppError::FolderNameTaken`] si `into`
    /// contient déjà un dossier de ce nom, [`AppError::FolderNotFound`] si l'un des deux
    /// n'existe pas, [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, folder: &Folder, into: &Folder) -> Result<Folder, AppError> {
        let name = folder.name().ok_or(AppError::RootIsFixed)?;
        if into.is_within(folder) {
            return Err(AppError::FolderInsideItself(folder.clone()));
        }
        let moved = into.join(name.clone());
        if &moved != folder {
            self.store.move_folder(folder, &moved)?;
        }
        Ok(moved)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;
    use domain::NotePath;

    fn folder(path: &str) -> Folder {
        Folder::parse(path).unwrap()
    }

    fn name(text: &str) -> FolderName {
        FolderName::parse(text).unwrap()
    }

    fn paths(folders: &[Folder]) -> Vec<String> {
        folders.iter().map(Folder::to_path).collect()
    }

    fn store() -> InMemoryNoteStore {
        InMemoryNoteStore::with_notes(&[
            ("Travail/Réunions/lundi.md", "# Lundi"),
            ("perso/a.md", ""),
        ])
    }

    #[test]
    fn folders_are_listed_as_a_tree() {
        let store = store();
        assert_eq!(
            paths(&ListFolders::new(&store).execute().unwrap()),
            ["perso", "Travail", "Travail/Réunions"]
        );
    }

    #[test]
    fn a_folder_is_created_inside_another() {
        let store = store();
        let created = CreateFolder::new(&store)
            .execute(&folder("Travail"), name("Projets"))
            .unwrap();
        assert_eq!(created, folder("Travail/Projets"));
        assert!(store.folders().unwrap().contains(&created));
    }

    #[test]
    fn creating_a_taken_folder_is_refused() {
        let store = store();
        assert_eq!(
            CreateFolder::new(&store).execute(&Folder::root(), name("perso")),
            Err(AppError::FolderNameTaken(folder("perso")))
        );
    }

    #[test]
    fn a_renamed_folder_keeps_its_place_and_its_notes() {
        let store = store();
        let renamed = RenameFolder::new(&store)
            .execute(&folder("Travail/Réunions"), name("Comptes rendus"))
            .unwrap();
        assert_eq!(renamed, folder("Travail/Comptes rendus"));
        let note = NotePath::parse("Travail/Comptes rendus/lundi.md").unwrap();
        assert_eq!(store.read(&note).unwrap().content, "# Lundi");
    }

    #[test]
    fn renaming_a_folder_to_its_own_name_changes_nothing() {
        let store = store();
        let renamed = RenameFolder::new(&store)
            .execute(&folder("perso"), name("perso"))
            .unwrap();
        assert_eq!(renamed, folder("perso"));
    }

    #[test]
    fn the_root_cannot_be_renamed_nor_moved() {
        let store = store();
        assert_eq!(
            RenameFolder::new(&store).execute(&Folder::root(), name("x")),
            Err(AppError::RootIsFixed)
        );
        assert_eq!(
            MoveFolder::new(&store).execute(&Folder::root(), &folder("perso")),
            Err(AppError::RootIsFixed)
        );
    }

    #[test]
    fn a_moved_folder_takes_its_notes_along() {
        let store = store();
        let moved = MoveFolder::new(&store)
            .execute(&folder("Travail/Réunions"), &folder("perso"))
            .unwrap();
        assert_eq!(moved, folder("perso/Réunions"));
        let note = NotePath::parse("perso/Réunions/lundi.md").unwrap();
        assert_eq!(store.read(&note).unwrap().content, "# Lundi");
    }

    #[test]
    fn a_folder_moved_where_it_already_is_stays() {
        let store = store();
        let moved = MoveFolder::new(&store)
            .execute(&folder("Travail/Réunions"), &folder("Travail"))
            .unwrap();
        assert_eq!(moved, folder("Travail/Réunions"));
    }

    #[test]
    fn a_folder_cannot_go_inside_itself() {
        let store = store();
        for into in ["Travail", "Travail/Réunions"] {
            assert_eq!(
                MoveFolder::new(&store).execute(&folder("Travail"), &folder(into)),
                Err(AppError::FolderInsideItself(folder("Travail")))
            );
        }
    }

    #[test]
    fn moving_onto_a_taken_name_is_refused() {
        let store = InMemoryNoteStore::with_notes(&[("a/x/n.md", ""), ("x/m.md", "")]);
        assert_eq!(
            MoveFolder::new(&store).execute(&folder("a/x"), &Folder::root()),
            Err(AppError::FolderNameTaken(folder("x")))
        );
    }
}
