//! Port de l'historique des versions : les copies datées du texte de chaque note.

use std::fmt::Debug;
use std::sync::Arc;

use domain::history::Version;
use domain::{Folder, NotePath};

use crate::{StoreError, WorkspaceLocation};

/// Où se trouve l'historique d'une note ou d'un dossier : dans l'espace de travail, ou dans la
/// corbeille avec la note (ou le dossier) qui y est partie.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum HistoryPlace {
    /// L'historique des notes de l'espace de travail.
    Workspace,
    /// L'historique des notes de la corbeille, à leur chemin dans la corbeille.
    Trash,
}

/// L'historique des versions des notes d'un espace de travail. Chaque note a le sien, désigné
/// par son chemin ; il suit la note quand elle change de chemin ou part à la corbeille.
pub trait History: Send + Sync + Debug {
    /// Les versions de la note, dans aucun ordre ; aucune si elle n'en a jamais eu.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'historique ne peut pas être lu.
    fn versions(&self, note: &NotePath) -> Result<Vec<Version>, StoreError>;

    /// Le texte de cette version de la note.
    ///
    /// # Errors
    ///
    /// [`StoreError::VersionNotFound`] si la note n'a pas cette version,
    /// [`StoreError::Unavailable`] si elle ne peut pas être lue.
    fn read_version(&self, note: &NotePath, version: &Version) -> Result<String, StoreError>;

    /// Garde `content` comme cette version de la note ; jamais de fichier à moitié écrit.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si la version ne peut pas être écrite.
    fn write_version(
        &self,
        note: &NotePath,
        version: &Version,
        content: &str,
    ) -> Result<(), StoreError>;

    /// Retire ces versions de la note ; celles qu'elle n'a pas sont ignorées.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si une version ne peut pas être retirée.
    fn remove_versions(&self, note: &NotePath, versions: &[Version]) -> Result<(), StoreError>;

    /// L'historique de la note `from` devient celui de `to`, avec celui que `to` avait peut-être
    /// déjà ; rien à faire si `from` n'en a pas.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'historique ne peut pas être déplacé.
    fn move_note_versions(
        &self,
        from: (HistoryPlace, &NotePath),
        to: (HistoryPlace, &NotePath),
    ) -> Result<(), StoreError>;

    /// L'historique des notes du dossier `from`, à toute profondeur, devient celui des mêmes
    /// notes dans `to`.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'historique ne peut pas être déplacé.
    fn move_folder_versions(
        &self,
        from: (HistoryPlace, &Folder),
        to: (HistoryPlace, &Folder),
    ) -> Result<(), StoreError>;

    /// Oublie l'historique des notes de la corbeille, quand on la vide.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'historique ne peut pas être supprimé.
    fn empty_trash(&self) -> Result<(), StoreError>;
}

/// Ouvre l'historique d'un espace de travail.
pub trait HistoryOpener: Send + Sync + Debug {
    /// L'historique de l'espace de travail situé à `location` ; vide s'il n'en avait pas.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'historique ne peut pas être ouvert.
    fn open(&self, location: &WorkspaceLocation) -> Result<Arc<dyn History>, StoreError>;
}
