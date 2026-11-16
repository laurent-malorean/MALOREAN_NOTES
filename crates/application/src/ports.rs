//! Ports : ce dont les cas d'usage ont besoin, sans savoir comment c'est fait.

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
    /// Le fichier n'est pas du texte UTF-8 : on ne l'ouvre pas, pour ne pas l'abîmer.
    Unreadable(FileName),
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
    /// Les noms de toutes les notes, sans lire leur contenu.
    fn names(&self) -> Result<Vec<FileName>, StoreError>;
}

/// Emplacement d'une bibliothèque, tel que l'utilisateur l'a choisi.
///
/// L'application ne l'interprète pas : seul l'adaptateur de stockage sait le traduire.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LibraryLocation(String);

/// Emplacement refusé parce qu'il est vide.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("l'emplacement de la bibliothèque est vide")]
pub struct EmptyLocation;

impl LibraryLocation {
    /// L'emplacement choisi par l'utilisateur.
    ///
    /// # Errors
    ///
    /// [`EmptyLocation`] si l'emplacement est vide.
    pub fn new(location: impl Into<String>) -> Result<Self, EmptyLocation> {
        let location = location.into();
        if location.is_empty() {
            Err(EmptyLocation)
        } else {
            Ok(Self(location))
        }
    }

    /// L'emplacement, tel qu'il a été choisi.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Ouvre la bibliothèque qui se trouve à un emplacement.
pub trait LibraryOpener: Send + Sync {
    fn open(&self, location: &LibraryLocation) -> Result<Arc<dyn NoteStore>, StoreError>;
}

/// Préférences gardées d'un lancement à l'autre.
pub trait Preferences: Send + Sync {
    fn last_library(&self) -> Result<Option<LibraryLocation>, StoreError>;
    fn remember_library(&self, location: &LibraryLocation) -> Result<(), StoreError>;
}
