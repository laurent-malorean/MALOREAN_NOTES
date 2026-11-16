//! Ports : ce dont les cas d'usage ont besoin, sans savoir comment c'est fait.

use std::fmt::Debug;
use std::sync::Arc;

use domain::{FileName, Modified};

/// Une note telle qu'elle est gardée : nom, contenu Markdown, date de modification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredNote {
    /// Le nom du fichier de la note.
    pub file_name: FileName,
    /// Le contenu Markdown complet, en-tête compris.
    pub content: String,
    /// La date de dernière modification.
    pub modified: Modified,
}

/// Échec du stockage.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreError {
    /// Aucune note ne porte ce nom.
    NotFound(FileName),
    /// Une note (ou son dossier de pièces jointes) porte déjà ce nom.
    AlreadyExists(FileName),
    /// Le fichier n'est pas du texte UTF-8 : on ne l'ouvre pas, pour ne pas l'abîmer.
    Unreadable(FileName),
    /// Le stockage ne répond pas (dossier absent, droits, disque plein) ; la cause est lisible.
    Unavailable(String),
}

/// Les notes d'une bibliothèque (un seul niveau de dossier).
pub trait NoteStore: Send + Sync + Debug {
    /// Toutes les notes de la bibliothèque. Une note qui n'est pas du texte UTF-8
    /// y figure quand même, avec ce qui en est lisible.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si la bibliothèque ne peut pas être lue.
    fn list(&self) -> Result<Vec<StoredNote>, StoreError>;

    /// La note qui porte ce nom.
    ///
    /// # Errors
    ///
    /// [`StoreError::NotFound`] si elle n'existe pas, [`StoreError::Unreadable`] si elle
    /// n'est pas du texte UTF-8, [`StoreError::Unavailable`] si le stockage ne répond pas.
    fn read(&self, name: &FileName) -> Result<StoredNote, StoreError>;

    /// Écrit la note entière, en la créant si besoin ; jamais de fichier à moitié écrit.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'écriture échoue ; l'ancienne version reste intacte.
    fn write(&self, name: &FileName, content: &str) -> Result<(), StoreError>;

    /// Renomme la note et son dossier de pièces jointes.
    ///
    /// # Errors
    ///
    /// [`StoreError::AlreadyExists`] si le nouveau nom (ou son dossier de pièces jointes)
    /// est pris, [`StoreError::NotFound`] si la note n'existe pas,
    /// [`StoreError::Unavailable`] si le stockage ne répond pas.
    fn rename(&self, from: &FileName, to: &FileName) -> Result<(), StoreError>;

    /// Les noms de toutes les notes, sans lire leur contenu.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si la bibliothèque ne peut pas être lue.
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
pub trait LibraryOpener: Send + Sync + Debug {
    /// Les notes de la bibliothèque située à `location`.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si rien d'utilisable ne se trouve à cet emplacement.
    fn open(&self, location: &LibraryLocation) -> Result<Arc<dyn NoteStore>, StoreError>;
}

/// Préférences gardées d'un lancement à l'autre.
pub trait Preferences: Send + Sync + Debug {
    /// La dernière bibliothèque ouverte, s'il y en a une.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si les préférences ne peuvent pas être lues.
    fn last_library(&self) -> Result<Option<LibraryLocation>, StoreError>;

    /// Se souvenir de cette bibliothèque pour le prochain lancement.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si les préférences ne peuvent pas être écrites.
    fn remember_library(&self, location: &LibraryLocation) -> Result<(), StoreError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_location_is_given_back_as_chosen() {
        let location = LibraryLocation::new("/Users/moi/Notes").unwrap();
        assert_eq!(location.as_str(), "/Users/moi/Notes");
    }

    #[test]
    fn an_empty_location_is_refused() {
        assert_eq!(LibraryLocation::new(""), Err(EmptyLocation));
    }
}
