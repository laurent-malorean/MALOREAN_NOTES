//! Erreurs des cas d'usage.

use domain::history::Version;
use domain::research_notebook::RefusedEntry;
use domain::{Folder, NotePath, RefusedAttachment};

use crate::{AssistError, MeaningError, MeaningIndexError, StoreError, Unavailability};

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
    /// Le nom d'un espace de travail est vide.
    #[error("le nom de l'espace de travail est vide")]
    EmptyWorkspaceName,
    /// Aucun espace de travail ne porte ce nom.
    #[error("aucun espace de travail ne s'appelle « {0} »")]
    WorkspaceNotFound(String),
    /// Un autre espace de travail porte déjà ce nom (majuscules ignorées).
    #[error("un espace de travail s'appelle déjà « {0} »")]
    WorkspaceNameTaken(String),
    /// Le dossier est déjà celui d'un autre espace de travail, nommé ici.
    #[error("ce dossier est déjà l'espace de travail « {0} »")]
    WorkspaceFolderTaken(String),
    /// L'espace de travail ouvert ne se retire pas de la liste.
    #[error("l'espace de travail « {0} » est ouvert : passez à un autre avant de le retirer")]
    OpenWorkspaceKept(String),
    /// La note n'a pas (ou plus) cette version : la conservation a pu la retirer.
    #[error("la version du {} n'existe plus", .0.label())]
    VersionNotFound(Version),
    /// Le stockage ne répond pas ; la cause est lisible.
    #[error("stockage indisponible : {0}")]
    StorageUnavailable(String),
    /// L'assistant d'écriture ne peut pas répondre sur ce Mac ; la raison est lisible.
    #[error("{0}")]
    AssistantUnavailable(Unavailability),
    /// La sélection est trop longue pour l'aide à l'écriture.
    #[error("la sélection dépasse {limit} caractères : choisissez un passage plus court")]
    SelectionTooLong {
        /// Le nombre de caractères permis.
        limit: usize,
    },
    /// Le modèle a refusé de traiter le texte.
    #[error("le modèle d'Apple a refusé de traiter ce texte")]
    AssistantRefused,
    /// Le modèle n'a pas pu répondre ; la cause est lisible.
    #[error("l'aide à l'écriture a échoué : {0}")]
    AssistantFailed(String),
    /// L'entrée n'est pas ajoutée au cahier de recherche ; la raison est lisible.
    #[error("{0}")]
    EntryRefused(#[from] RefusedEntry),
    /// La note n'est pas une carte mentale (fiche 0050).
    #[error("cette note n'est pas une carte mentale")]
    NotAMindMap,
    /// Le fichier n'est pas un canvas (fiche 0052).
    #[error("ce fichier n'est pas un canvas")]
    NotACanvas,
    /// Le contenu du canvas n'est pas valide : la raison est lisible (fiche 0052).
    #[error("{0}")]
    InvalidCanvas(#[from] domain::canvas::CanvasError),
    /// La note n'est pas un CRM (fiche 0058).
    #[error("cette note n'est pas un CRM")]
    NotACrm,
    /// La fiche d'un CRM n'existe plus : le geste est abandonné (fiche 0058).
    #[error("Cette fiche n'existe plus.")]
    FicheGone,
    /// Ce que l'interface donne pour un jour n'est pas un jour ; la raison est lisible.
    #[error("{0}")]
    CrmDay(#[from] domain::crm::InvalidDay),
    /// Le nom d'une fiche est refusé ; la raison est lisible.
    #[error("{0}")]
    CrmName(#[from] domain::crm::NameError),
    /// Une étape est refusée ; la raison est lisible.
    #[error("{0}")]
    CrmStage(#[from] domain::crm::StageError),
    /// Le geste sur le texte d'une action est refusé ; la raison est lisible.
    #[error("{0}")]
    CrmBody(#[from] domain::crm::BodyError),
    /// Ce que l'interface désigne n'est pas une référence de fiche ni de note valable.
    #[error("« {0} » n'est pas une référence valable")]
    InvalidReference(String),
    /// Ce que l'interface donne pour une couleur n'est pas dans la palette.
    #[error("« {0} » n'est pas une couleur de la palette")]
    UnknownColor(String),
    /// Ce que l'interface donne pour un canal n'est pas l'un des sept.
    #[error("« {0} » n'est pas un canal")]
    UnknownChannel(String),
    /// Ce que l'interface donne pour un statut n'est pas une colonne du CRM.
    #[error("« {0} » n'est pas une colonne de ce CRM")]
    UnknownStatus(String),
    /// La recherche par le sens a reçu une question vide.
    #[error("la question est vide : écrivez ce que vous cherchez")]
    EmptyQuestion,
    /// Le modèle de sens a échoué ou manque ; le message dit quoi faire.
    #[error("{0}")]
    Meaning(#[from] MeaningError),
    /// L'index de sens a échoué ; le message dit quoi faire.
    #[error("{0}")]
    MeaningIndex(#[from] MeaningIndexError),
}

impl From<AssistError> for AppError {
    fn from(error: AssistError) -> Self {
        match error {
            AssistError::Unavailable(reason) => Self::AssistantUnavailable(reason),
            AssistError::Refused => Self::AssistantRefused,
            AssistError::Failed(reason) => Self::AssistantFailed(reason),
        }
    }
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
            StoreError::VersionNotFound(version) => Self::VersionNotFound(version),
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
    fn a_missing_version_is_reported_by_its_date() {
        let version = Version::parse("2026-11-18 14h30").unwrap();
        let message = AppError::from(StoreError::VersionNotFound(version)).to_string();
        assert_eq!(
            message,
            "la version du 18 novembre 2026 à 14:30 n'existe plus"
        );
    }

    #[test]
    fn an_assistant_error_is_reported_with_its_reason() {
        let unavailable = AssistError::Unavailable(Unavailability::AppleIntelligenceDisabled);
        assert_eq!(
            AppError::from(unavailable).to_string(),
            "Apple Intelligence n'est pas activé : Réglages Système, « Apple Intelligence et Siri »"
        );
        assert_eq!(
            AppError::from(AssistError::Refused).to_string(),
            "le modèle d'Apple a refusé de traiter ce texte"
        );
        assert_eq!(
            AppError::from(AssistError::Failed("trop long".to_owned())).to_string(),
            "l'aide à l'écriture a échoué : trop long"
        );
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
    fn workspace_errors_name_the_workspace() {
        assert_eq!(
            AppError::EmptyWorkspaceName.to_string(),
            "le nom de l'espace de travail est vide"
        );
        assert_eq!(
            AppError::WorkspaceNotFound("Perso".into()).to_string(),
            "aucun espace de travail ne s'appelle « Perso »"
        );
        assert_eq!(
            AppError::WorkspaceNameTaken("Notes".into()).to_string(),
            "un espace de travail s'appelle déjà « Notes »"
        );
        assert_eq!(
            AppError::WorkspaceFolderTaken("Notes".into()).to_string(),
            "ce dossier est déjà l'espace de travail « Notes »"
        );
        assert_eq!(
            AppError::OpenWorkspaceKept("Notes".into()).to_string(),
            "l'espace de travail « Notes » est ouvert : passez à un autre avant de le retirer"
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
    fn meaning_errors_keep_their_own_message() {
        let missing = MeaningError::ModelMissing(domain::MeaningModel::Small);
        assert_eq!(
            AppError::from(missing.clone()).to_string(),
            missing.to_string()
        );
        let index = MeaningIndexError::Unavailable("disque plein".into());
        assert_eq!(AppError::from(index.clone()).to_string(), index.to_string());
        assert_eq!(
            AppError::EmptyQuestion.to_string(),
            "la question est vide : écrivez ce que vous cherchez"
        );
    }

    #[test]
    fn an_unavailable_storage_is_reported_with_its_cause() {
        let message = AppError::from(StoreError::Unavailable("disque plein".into())).to_string();
        assert_eq!(message, "stockage indisponible : disque plein");
    }
}
