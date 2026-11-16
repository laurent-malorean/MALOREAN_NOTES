//! Ports : ce dont les cas d'usage ont besoin, sans savoir comment c'est fait.

use std::path::PathBuf;
use std::sync::Arc;

use domain::{FileName, Modified};

/// Une note telle qu'elle est gardée : nom, contenu Markdown, date de modification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredNote {
    pub file_name: FileName,
    pub content: String,
    pub modified: Modified,
}

/// Échec du stockage.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreError {
    NotFound(FileName),
    AlreadyExists(FileName),
    Unavailable(String),
}

/// Les notes d'une bibliothèque (un seul niveau de dossier).
pub trait NoteStore: Send + Sync {
    /// Toutes les notes de la bibliothèque.
    fn list(&self) -> Result<Vec<StoredNote>, StoreError>;
    fn read(&self, name: &FileName) -> Result<StoredNote, StoreError>;
    /// Écrit la note entière ; jamais de fichier à moitié écrit.
    fn write(&self, name: &FileName, content: &str) -> Result<(), StoreError>;
    /// Renomme la note et son dossier de pièces jointes ; refuse un nom déjà pris.
    fn rename(&self, from: &FileName, to: &FileName) -> Result<(), StoreError>;
    fn exists(&self, name: &FileName) -> Result<bool, StoreError>;
}

/// Emplacement d'une bibliothèque, choisi par l'utilisateur.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LibraryLocation(pub PathBuf);

/// Ouvre la bibliothèque qui se trouve à un emplacement.
pub trait LibraryOpener: Send + Sync {
    fn open(&self, location: &LibraryLocation) -> Result<Arc<dyn NoteStore>, StoreError>;
}

/// Préférences gardées d'un lancement à l'autre.
pub trait Preferences: Send + Sync {
    fn last_library(&self) -> Result<Option<LibraryLocation>, StoreError>;
    fn remember_library(&self, location: &LibraryLocation) -> Result<(), StoreError>;
}
