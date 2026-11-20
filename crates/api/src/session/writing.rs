//! L'aide à l'écriture vue depuis l'interface : si l'assistant d'écriture peut répondre, et sa
//! proposition pour une sélection.

use std::sync::Arc;

use application::use_cases::ProposeRewriting;
use application::{AppError, Unavailability, WritingAssistant};

use super::Session;
use super::history::difference_item;
use crate::{ApiError, AssistantStatus, ProposalItem, WritingActionItem};

impl Session {
    /// La même session, dont l'aide à l'écriture passe par `assistant`. Sans lui, l'assistant
    /// d'écriture se dit introuvable.
    #[must_use]
    pub fn with_writing_assistant(mut self, assistant: Arc<dyn WritingAssistant>) -> Self {
        self.assistant = Some(assistant);
        self
    }

    /// Si l'assistant d'écriture peut répondre, sinon pourquoi, prêt à afficher.
    #[must_use]
    pub fn assistant_status(&self) -> AssistantStatus {
        match self
            .assistant()
            .and_then(|assistant| assistant.availability())
        {
            Ok(()) => AssistantStatus::Available,
            Err(reason) => AssistantStatus::Unavailable {
                reason: reason.to_string(),
            },
        }
    }

    /// La proposition de l'assistant d'écriture pour `selection` : son texte et ses différences
    /// mot à mot avec la sélection. Rien n'est écrit.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; sélection trop longue, assistant
    /// indisponible sur ce Mac, texte refusé par le modèle, modèle en échec.
    pub fn propose_rewriting(
        &self,
        action: WritingActionItem,
        selection: &str,
    ) -> Result<ProposalItem, ApiError> {
        let assistant = self.assistant().map_err(AppError::AssistantUnavailable)?;
        let proposal = ProposeRewriting::new(assistant).execute(action.into(), selection)?;
        Ok(ProposalItem {
            text: proposal.text,
            differences: proposal
                .differences
                .into_iter()
                .map(difference_item)
                .collect(),
        })
    }

    fn assistant(&self) -> Result<&dyn WritingAssistant, Unavailability> {
        self.assistant
            .as_deref()
            .ok_or(Unavailability::AssistantMissing)
    }
}
