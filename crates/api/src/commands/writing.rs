//! Commandes de l'aide à l'écriture : demander au modèle d'IA du Mac de corriger, reformuler ou
//! résumer une sélection. Rien n'est écrit dans la note : l'interface attend l'accord.

use std::sync::Arc;

use super::{SharedSession, in_background};
use crate::{ApiError, AssistantStatus, ProposalItem, WritingActionItem};

/// Si l'assistant d'écriture peut répondre, sinon pourquoi.
///
/// # Errors
///
/// Seulement une erreur interne, si le fil d'arrière-plan s'arrête.
#[tauri::command]
pub async fn assistant_status(session: SharedSession<'_>) -> Result<AssistantStatus, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || Ok(session.assistant_status())).await
}

/// La proposition de l'assistant d'écriture pour la sélection.
///
/// # Errors
///
/// Le message de l'erreur, prêt à afficher : voir [`crate::Session::propose_rewriting`].
#[tauri::command]
pub async fn propose_rewriting(
    session: SharedSession<'_>,
    action: WritingActionItem,
    selection: String,
) -> Result<ProposalItem, ApiError> {
    let session = Arc::clone(&session);
    in_background(move || session.propose_rewriting(action, &selection)).await
}
