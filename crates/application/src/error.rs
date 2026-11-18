//! Erreurs des cas d'usage.

use domain::{Folder, NotePath, RefusedAttachment};

use crate::StoreError;

/// Ce qui peut empêcher un cas d'usage d'aboutir.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AppError {
    /// Une action sur les notes a été demandée avant d'ouvrir un espace de travail.
    #[error("aucun espace de travail n'est ouvert")]
    NoWorkspaceOpen,
    /// Aucune note ne porte ce nom.
    #[error("la note « {} » n'existe pas", .0.to_path())]
    NoteNotFound(NotePath),
    /// Une autre note porte déjà ce nom.
    #[error("le nom « {} » est déjà pris", .0.to_path())]
    NameTaken(NotePath),
    /// La note n'est pas du texte UTF-8 ; on ne l'ouvre pas, pour ne pas l'abîmer.
    #[error("la note « {} » n'est pas un texte lisible (UTF-8) : elle n'est pas ouverte, pour ne pas l'abîmer", .0.to_path())]
    NoteUnreadable(NotePath),
    /// Aucun dossier n'existe à ce chemin.
    #[error("le dossier « {} » n'existe pas", .0.to_path())]
    FolderNotFound(Folder),
    /// Un autre dossier porte déjà ce chemin.
    #[error("un dossier « {} » existe déjà", .0.to_path())]
    FolderNameTaken(Folder),
    /// Un dossier ne peut pas aller dans lui-même ni dans l'un de ses sous-dossiers.
    #[error("le dossier « {} » ne peut pas aller dans lui-même ni dans l'un de ses sous-dossiers", .0.to_path())]
    FolderInsideItself(Folder),
    /// La racine (l'espace de travail lui-même) ne se renomme ni ne se déplace dans l'application.
    #[error("l'espace de travail lui-même ne peut être ni renommé ni déplacé")]
    RootIsFixed,
    /// La racine (l'espace de travail lui-même) ne va pas dans la corbeille.
    #[error("l'espace de travail lui-même ne peut pas aller dans la corbeille")]
    RootCannotBeTrashed,
    /// Le fichier collé ou glissé n'est ni une image ni un PDF.
    #[error("{0}")]
    AttachmentRefused(RefusedAttachment),
    /// Le fichier collé ou glissé dépasse la taille permise.
    #[error("le fichier fait plus de {limit_megabytes} Mo : il ne peut pas être joint à une note")]
    AttachmentTooLarge {
        /// La taille permise, en mégaoctets.
        limit_megabytes: usize,
    },
    /// Le dossier de pièces jointes a déjà un fichier de ce nom.
    #[error("une pièce jointe « {0} » existe déjà")]
    AttachmentNameTaken(String),
    /// La note n'a pas cette pièce jointe.
    #[error("la pièce jointe « {0} » est introuvable")]
    AttachmentNotFound(String),
    /// Le lien ne mène pas à une pièce jointe de la note.
    #[error("« {0} » n'est pas une pièce jointe de la note")]
    NotAnAttachment(String),
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
            StoreError::FolderNotFound(folder) => Self::FolderNotFound(folder),
            StoreError::FolderAlreadyExists(folder) => Self::FolderNameTaken(folder),
            StoreError::AttachmentAlreadyExists(name) => Self::AttachmentNameTaken(name),
            StoreError::AttachmentNotFound(name) => Self::AttachmentNotFound(name),
            StoreError::Unavailable(reason) => Self::StorageUnavailable(reason),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn name() -> NotePath {
        NotePath::parse("note.md").unwrap()
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

    fn folder(path: &str) -> Folder {
        Folder::parse(path).unwrap()
    }

    #[test]
    fn folder_errors_are_reported_by_path() {
        let missing = AppError::from(StoreError::FolderNotFound(folder("a/b"))).to_string();
        assert_eq!(missing, "le dossier « a/b » n'existe pas");
        let taken = AppError::from(StoreError::FolderAlreadyExists(folder("a"))).to_string();
        assert_eq!(taken, "un dossier « a » existe déjà");
        assert_eq!(
            AppError::FolderInsideItself(folder("a")).to_string(),
            "le dossier « a » ne peut pas aller dans lui-même ni dans l'un de ses sous-dossiers"
        );
        assert_eq!(
            AppError::RootIsFixed.to_string(),
            "l'espace de travail lui-même ne peut être ni renommé ni déplacé"
        );
    }

    #[test]
    fn attachment_errors_say_what_happened() {
        let taken = AppError::from(StoreError::AttachmentAlreadyExists("a.png".into()));
        assert_eq!(taken.to_string(), "une pièce jointe « a.png » existe déjà");
        let missing = AppError::from(StoreError::AttachmentNotFound("a.pdf".into()));
        assert_eq!(
            missing.to_string(),
            "la pièce jointe « a.pdf » est introuvable"
        );
        assert_eq!(
            AppError::AttachmentTooLarge {
                limit_megabytes: 50
            }
            .to_string(),
            "le fichier fait plus de 50 Mo : il ne peut pas être joint à une note"
        );
        assert_eq!(
            AppError::NotAnAttachment("https://a.fr".into()).to_string(),
            "« https://a.fr » n'est pas une pièce jointe de la note"
        );
        let refused = RefusedAttachment::UnsupportedType("a.txt".into());
        assert_eq!(
            AppError::AttachmentRefused(refused.clone()).to_string(),
            refused.to_string()
        );
    }

    #[test]
    fn an_unavailable_storage_is_reported_with_its_cause() {
        let message = AppError::from(StoreError::Unavailable("disque plein".into())).to_string();
        assert_eq!(message, "stockage indisponible : disque plein");
    }
}
