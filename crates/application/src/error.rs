//! Erreurs des cas d'usage.

use domain::FileName;

use crate::StoreError;

/// Ce qui peut empêcher un cas d'usage d'aboutir.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AppError {
    #[error("aucune bibliothèque n'est ouverte")]
    NoLibraryOpen,
    #[error("la note « {} » n'existe pas", .0.as_str())]
    NoteNotFound(FileName),
    #[error("le nom « {} » est déjà pris", .0.as_str())]
    NameTaken(FileName),
    #[error("stockage indisponible : {0}")]
    StorageUnavailable(String),
}

impl From<StoreError> for AppError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::NotFound(name) => Self::NoteNotFound(name),
            StoreError::AlreadyExists(name) => Self::NameTaken(name),
            StoreError::Unavailable(reason) => Self::StorageUnavailable(reason),
        }
    }
}
