//! Erreurs des cas d'usage.

use domain::FileName;

use crate::StoreError;

/// Ce qui peut empêcher un cas d'usage d'aboutir.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AppError {
    /// Une action sur les notes a été demandée avant d'ouvrir une bibliothèque.
    #[error("aucune bibliothèque n'est ouverte")]
    NoLibraryOpen,
    /// Aucune note ne porte ce nom.
    #[error("la note « {} » n'existe pas", .0.as_str())]
    NoteNotFound(FileName),
    /// Une autre note porte déjà ce nom.
    #[error("le nom « {} » est déjà pris", .0.as_str())]
    NameTaken(FileName),
    /// La note n'est pas du texte UTF-8 ; on ne l'ouvre pas, pour ne pas l'abîmer.
    #[error("la note « {} » n'est pas un texte lisible (UTF-8) : elle n'est pas ouverte, pour ne pas l'abîmer", .0.as_str())]
    NoteUnreadable(FileName),
    /// Le stockage ne répond pas ; la cause est lisible.
    #[error("stockage indisponible : {0}")]
    StorageUnavailable(String),
}

impl From<StoreError> for AppError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::NotFound(name) => Self::NoteNotFound(name),
            StoreError::AlreadyExists(name) => Self::NameTaken(name),
            StoreError::Unreadable(name) => Self::NoteUnreadable(name),
            StoreError::Unavailable(reason) => Self::StorageUnavailable(reason),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn name() -> FileName {
        FileName::parse("note.md").unwrap()
    }

    #[test]
    fn a_missing_note_is_reported_by_name() {
        let message = AppError::from(StoreError::NotFound(name())).to_string();
        assert_eq!(message, "la note « note.md » n'existe pas");
    }

    #[test]
    fn a_taken_name_is_reported_by_name() {
        let message = AppError::from(StoreError::AlreadyExists(name())).to_string();
        assert_eq!(message, "le nom « note.md » est déjà pris");
    }

    #[test]
    fn an_unreadable_note_is_reported_with_the_reason_it_stays_closed() {
        let message = AppError::from(StoreError::Unreadable(name())).to_string();
        assert_eq!(
            message,
            "la note « note.md » n'est pas un texte lisible (UTF-8) : elle n'est pas ouverte, pour ne pas l'abîmer"
        );
    }

    #[test]
    fn an_unavailable_storage_is_reported_with_its_cause() {
        let message = AppError::from(StoreError::Unavailable("disque plein".into())).to_string();
        assert_eq!(message, "stockage indisponible : disque plein");
    }
}
