//! Les dossiers de l'espace de travail ouvert, vus depuis l'interface.

use application::use_cases::{CreateFolder, ListFolders, MoveFolder, RenameFolder};
use domain::{Folder, FolderName};

use super::Session;
use crate::ApiError;

impl Session {
    /// Les chemins de tous les dossiers de l'espace de travail, dans l'ordre de l'arbre.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; aucun espace de travail
    /// ouvert, espace de travail illisible.
    pub fn list_folders(&self) -> Result<Vec<String>, ApiError> {
        let store = self.store()?;
        let folders = ListFolders::new(&*store).execute()?;
        Ok(folders.iter().map(Folder::to_path).collect())
    }

    /// Crée le dossier `name` dans `parent` ; rend son chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom ou chemin invalide,
    /// dossier déjà existant, parent absent, aucun espace de travail ouvert.
    pub fn create_folder(&self, parent: &str, name: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        let created = CreateFolder::new(&*store)
            .execute(&Folder::parse(parent)?, FolderName::parse(name)?)?;
        Ok(created.to_path())
    }

    /// Renomme le dossier ; rend son nouveau chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; nom ou chemin invalide,
    /// racine, nom déjà pris, dossier absent, aucun espace de travail ouvert.
    pub fn rename_folder(&self, path: &str, name: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        let renamed =
            RenameFolder::new(&*store).execute(&Folder::parse(path)?, FolderName::parse(name)?)?;
        Ok(renamed.to_path())
    }

    /// Déplace le dossier dans `into` ; rend son nouveau chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, racine,
    /// déplacement dans lui-même, nom déjà pris, dossier absent, aucun espace de travail ouvert.
    pub fn move_folder(&self, path: &str, into: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        let moved =
            MoveFolder::new(&*store).execute(&Folder::parse(path)?, &Folder::parse(into)?)?;
        Ok(moved.to_path())
    }
}
