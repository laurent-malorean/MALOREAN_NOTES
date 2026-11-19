//! Aide à l'écriture : la proposition de l'assistant d'écriture pour une sélection.

use domain::diff::{Difference, word_differences};
use domain::writing::{MAX_SELECTION_CHARS, Passages, WritingAction};

use crate::{AppError, WritingAssistant};

/// Ce que l'assistant d'écriture propose pour une sélection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Proposal {
    /// Le texte proposé à la place de la sélection.
    pub text: String,
    /// Ce qui change de la sélection à la proposition, mot par mot.
    pub differences: Vec<Difference>,
}

/// Demande à l'assistant d'écriture de corriger, reformuler ou résumer une sélection ; rien
/// n'est écrit : la proposition attend l'accord de l'utilisateur.
#[derive(Debug)]
pub struct ProposeRewriting<'a> {
    assistant: &'a dyn WritingAssistant,
}

impl<'a> ProposeRewriting<'a> {
    /// Le cas d'usage, branché sur l'assistant d'écriture.
    #[must_use]
    pub fn new(assistant: &'a dyn WritingAssistant) -> Self {
        Self { assistant }
    }

    /// La proposition pour `selection` : chaque passage envoyé avec la consigne de l'action, le
    /// texte refait à partir des réponses, et ses différences par mot avec la sélection. Une
    /// sélection sans texte revient telle quelle, sans rien demander.
    ///
    /// # Errors
    ///
    /// [`AppError::SelectionTooLong`] au-delà de [`MAX_SELECTION_CHARS`] caractères,
    /// [`AppError::AssistantUnavailable`] si l'assistant ne peut pas répondre sur ce Mac,
    /// [`AppError::AssistantRefused`] si le modèle refuse le texte,
    /// [`AppError::AssistantFailed`] s'il échoue autrement.
    pub fn execute(&self, action: WritingAction, selection: &str) -> Result<Proposal, AppError> {
        if selection.chars().count() > MAX_SELECTION_CHARS {
            return Err(AppError::SelectionTooLong {
                limit: MAX_SELECTION_CHARS,
            });
        }
        let passages = Passages::of(action, selection);
        let prompts = passages.prompts();
        let answers = if prompts.is_empty() {
            Vec::new()
        } else {
            self.assistant.answer(action.instructions(), &prompts)?
        };
        let text = passages.rejoined(&answers);
        Ok(Proposal {
            differences: word_differences(selection, &text),
            text,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::FakeWritingAssistant;
    use crate::{AssistError, Unavailability};
    use Difference::{Added, Removed, Same};

    #[test]
    fn the_proposal_is_the_answer_with_its_differences_from_the_selection() {
        let assistant = FakeWritingAssistant::default();
        let proposal = ProposeRewriting::new(&assistant)
            .execute(WritingAction::Correct, "Une fote ici.")
            .unwrap();
        assert_eq!(proposal.text, "Une faute ici.");
        assert_eq!(
            proposal.differences,
            [
                Same("Une ".to_owned()),
                Removed("fote".to_owned()),
                Added("faute".to_owned()),
                Same(" ici.".to_owned()),
            ]
        );
    }

    #[test]
    fn the_assistant_receives_the_instructions_of_the_action_and_each_passage() {
        let assistant = FakeWritingAssistant::default();
        let proposal = ProposeRewriting::new(&assistant)
            .execute(WritingAction::Rephrase, "- un\n\ndeux\n")
            .unwrap();
        assert_eq!(
            assistant.asked(),
            [(
                WritingAction::Rephrase.instructions().to_owned(),
                vec![
                    "<texte>\nun\n</texte>".to_owned(),
                    "<texte>\ndeux\n</texte>".to_owned()
                ]
            )]
        );
        assert_eq!(proposal.text, "- un\n\ndeux\n");
    }

    #[test]
    fn a_selection_without_text_comes_back_without_asking() {
        let assistant = FakeWritingAssistant::default();
        let proposal = ProposeRewriting::new(&assistant)
            .execute(WritingAction::Summarize, "  ")
            .unwrap();
        assert_eq!(proposal.text, "  ");
        assert_eq!(assistant.asked(), []);
    }

    #[test]
    fn a_selection_too_long_is_refused_without_asking() {
        let assistant = FakeWritingAssistant::default();
        let at_limit = "é".repeat(MAX_SELECTION_CHARS);
        let rewriting = ProposeRewriting::new(&assistant);
        assert!(rewriting.execute(WritingAction::Correct, &at_limit).is_ok());
        assert_eq!(
            rewriting.execute(WritingAction::Correct, &format!("{at_limit}é")),
            Err(AppError::SelectionTooLong {
                limit: MAX_SELECTION_CHARS
            })
        );
        assert_eq!(assistant.asked().len(), 1);
    }

    #[test]
    fn an_unavailable_assistant_says_why() {
        let assistant = FakeWritingAssistant::unavailable(Unavailability::ModelNotReady);
        let found = ProposeRewriting::new(&assistant).execute(WritingAction::Correct, "Texte.");
        assert_eq!(
            found,
            Err(AppError::AssistantUnavailable(
                Unavailability::ModelNotReady
            ))
        );
    }

    #[test]
    fn a_refusal_of_the_model_is_reported() {
        let assistant = FakeWritingAssistant::failing(AssistError::Refused);
        let found = ProposeRewriting::new(&assistant).execute(WritingAction::Correct, "Texte.");
        assert_eq!(found, Err(AppError::AssistantRefused));
    }
}
