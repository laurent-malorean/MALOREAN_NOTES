//! Traduction des erreurs en message pour l'interface : le seul endroit où cela se fait.

use application::{AppError, EmptyLocation};
use domain::InvalidFileName;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Erreur rendue à l'interface : un message lisible.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ApiError {
    pub message: String,
}

impl ApiError {
    /// Le dossier choisi a un nom qui n'est pas du texte lisible : on ne peut pas s'en souvenir.
    pub(crate) fn unreadable_folder_name(path: &std::path::Path) -> Self {
        Self {
            message: format!("le nom du dossier « {} » est illisible", path.display()),
        }
    }

    pub(crate) fn internal(reason: &impl std::fmt::Display) -> Self {
        tracing::error!(%reason, "erreur interne");
        Self {
            message: format!("erreur interne : {reason}"),
        }
    }
}

impl From<AppError> for ApiError {
    fn from(error: AppError) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}

impl From<EmptyLocation> for ApiError {
    fn from(error: EmptyLocation) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}

impl From<InvalidFileName> for ApiError {
    fn from(error: InvalidFileName) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn use_case_errors_reach_the_page_as_their_message() {
        assert_eq!(
            ApiError::from(AppError::NoLibraryOpen).message,
            "aucune bibliothèque n'est ouverte"
        );
    }

    #[test]
    fn internal_errors_say_so() {
        assert_eq!(
            ApiError::internal(&"tâche interrompue").message,
            "erreur interne : tâche interrompue"
        );
    }
}
