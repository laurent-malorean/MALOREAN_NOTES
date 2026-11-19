//! Faux assistant d'écriture, en mémoire (voir `writing_contract`).

use std::sync::{Mutex, PoisonError};

use crate::{AssistError, Unavailability, WritingAssistant};

/// Une consigne et les passages reçus avec elle.
type Request = (String, Vec<String>);

/// Assistant d'écriture qui « corrige » toujours de la même façon : chaque passage sans son
/// cadre, « fote » devenu « faute ». Il garde chaque demande reçue.
#[derive(Debug, Default)]
pub struct FakeWritingAssistant {
    refusal: Option<AssistError>,
    asked: Mutex<Vec<Request>>,
}

impl FakeWritingAssistant {
    /// Un assistant qui ne peut pas répondre, pour cette raison.
    #[must_use]
    pub fn unavailable(reason: Unavailability) -> Self {
        Self::failing(AssistError::Unavailable(reason))
    }

    /// Un assistant dont chaque réponse échoue ainsi.
    #[must_use]
    pub fn failing(error: AssistError) -> Self {
        Self {
            refusal: Some(error),
            asked: Mutex::default(),
        }
    }

    /// Les demandes reçues, dans l'ordre : la consigne, puis les passages.
    pub fn asked(&self) -> Vec<Request> {
        self.asked
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

impl WritingAssistant for FakeWritingAssistant {
    fn availability(&self) -> Result<(), Unavailability> {
        match &self.refusal {
            Some(AssistError::Unavailable(reason)) => Err(*reason),
            _ => Ok(()),
        }
    }

    fn answer(&self, instructions: &str, prompts: &[String]) -> Result<Vec<String>, AssistError> {
        if let Some(error) = &self.refusal {
            return Err(error.clone());
        }
        self.asked
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push((instructions.to_owned(), prompts.to_vec()));
        Ok(prompts
            .iter()
            .map(|prompt| {
                let text = prompt.trim_start_matches("<texte>\n");
                text.trim_end_matches("\n</texte>").replace("fote", "faute")
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::writing_contract::writing_assistant_contract;

    #[test]
    fn honours_the_writing_assistant_contract() {
        writing_assistant_contract(&FakeWritingAssistant::default());
    }

    #[test]
    fn an_unavailable_assistant_says_why_before_any_request() {
        let assistant = FakeWritingAssistant::unavailable(Unavailability::DeviceNotEligible);
        assert_eq!(
            assistant.availability(),
            Err(Unavailability::DeviceNotEligible)
        );
        assert_eq!(
            assistant.answer("Corrige.", &["<texte>\nun\n</texte>".to_owned()]),
            Err(AssistError::Unavailable(Unavailability::DeviceNotEligible))
        );
    }

    #[test]
    fn a_failing_assistant_is_still_available() {
        let assistant = FakeWritingAssistant::failing(AssistError::Refused);
        assert_eq!(assistant.availability(), Ok(()));
    }
}
