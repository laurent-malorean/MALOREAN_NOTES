//! Traduction des erreurs en message pour l'interface : le seul endroit où cela se fait.

use application::AppError;
use domain::InvalidFileName;
use serde::Serialize;
use ts_rs::TS;

/// Erreur rendue à l'interface : un message lisible.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct ApiError {
    pub message: String,
}

impl ApiError {
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

impl From<InvalidFileName> for ApiError {
    fn from(error: InvalidFileName) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}
