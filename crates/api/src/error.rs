//! Traduction des erreurs en message pour l'interface : le seul endroit où cela se fait.

use application::{AppError, ClaudeError, EmptyLocation};
use domain::export::InvalidExportDestination;
use domain::history::InvalidVersion;
use domain::{InvalidFileName, InvalidFingerprint, InvalidFolderName};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Erreur rendue à l'interface : un message lisible.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ApiError {
    /// Ce qui s'est passé, en clair, pour la personne qui utilise l'application.
    pub message: String,
}

impl ApiError {
    /// Le dossier choisi a un nom qui n'est pas du texte lisible : on ne peut pas s'en souvenir.
    pub(crate) fn unreadable_folder_name(path: &std::path::Path) -> Self {
        Self {
            message: format!("le nom du dossier « {} » est illisible", path.display()),
        }
    }

    /// L'interface a envoyé une pièce jointe sans son contenu ou sans dire à quelle note elle va.
    pub(crate) fn incomplete_attachment() -> Self {
        Self {
            message: "le fichier à joindre n'a pas été reçu en entier".to_owned(),
        }
    }

    /// L'interface demande de continuer une conversation dont l'identifiant ne ressemble pas à
    /// ceux de Claude Code.
    pub(crate) fn unknown_conversation() -> Self {
        Self {
            message: "la conversation à continuer est inconnue : commencez-en une nouvelle"
                .to_owned(),
        }
    }

    /// La session n'a pas de quoi écrire les exports.
    pub(crate) fn exports_unavailable() -> Self {
        Self {
            message: "l'export n'est pas disponible".to_owned(),
        }
    }

    /// La session n'a pas de presse-papiers où copier.
    pub(crate) fn clipboard_unavailable() -> Self {
        Self {
            message: "le presse-papiers n'est pas disponible".to_owned(),
        }
    }

    /// WebKit n'a pas pu imprimer l'interface en PDF.
    pub(crate) fn pdf_failed(reason: &str) -> Self {
        Self {
            message: format!("le PDF n'a pas pu être écrit : {reason}"),
        }
    }

    /// WebKit n'a pas pu ouvrir la fenêtre d'impression.
    pub(crate) fn print_failed(reason: &str) -> Self {
        Self {
            message: format!("l'impression n'a pas pu commencer : {reason}"),
        }
    }

    /// Le Mac n'a pas pu construire ou modifier la barre des menus.
    pub(crate) fn menu_failed(reason: &impl std::fmt::Display) -> Self {
        Self {
            message: format!("la barre des menus n'a pas pu être construite : {reason}"),
        }
    }

    /// L'interface a demandé d'ouvrir dans le navigateur ce qui n'est pas une adresse web.
    pub(crate) fn not_a_web_address(text: &str) -> Self {
        Self {
            message: format!("« {text} » n'est pas une adresse web"),
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

impl From<ClaudeError> for ApiError {
    fn from(error: ClaudeError) -> Self {
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

impl From<InvalidFingerprint> for ApiError {
    fn from(error: InvalidFingerprint) -> Self {
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

impl From<InvalidFolderName> for ApiError {
    fn from(error: InvalidFolderName) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}

impl From<InvalidVersion> for ApiError {
    fn from(error: InvalidVersion) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}

impl From<InvalidExportDestination> for ApiError {
    fn from(error: InvalidExportDestination) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn use_case_errors_reach_the_interface_as_their_message() {
        assert_eq!(
            ApiError::from(AppError::NoWorkspaceOpen).message,
            "aucun espace de travail n'est ouvert"
        );
    }

    #[test]
    fn export_errors_say_what_happened() {
        assert_eq!(
            ApiError::exports_unavailable().message,
            "l'export n'est pas disponible"
        );
        assert_eq!(
            ApiError::clipboard_unavailable().message,
            "le presse-papiers n'est pas disponible"
        );
        assert_eq!(
            ApiError::pdf_failed("la fenêtre n'est pas prête").message,
            "le PDF n'a pas pu être écrit : la fenêtre n'est pas prête"
        );
        assert_eq!(
            ApiError::print_failed("la fenêtre n'est pas prête").message,
            "l'impression n'a pas pu commencer : la fenêtre n'est pas prête"
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
