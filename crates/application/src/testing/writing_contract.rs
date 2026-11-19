//! Contrat de l'assistant d'écriture : joué à l'identique sur le faux et sur le modèle d'Apple,
//! quand il est disponible. Le modèle ne répond jamais deux fois pareil : le contrat vérifie la
//! forme des réponses, pas leurs mots exacts.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::writing::{Passages, WritingAction};

use crate::WritingAssistant;

/// Joue tout le contrat sur `assistant`, qui doit être disponible.
pub fn writing_assistant_contract(assistant: &dyn WritingAssistant) {
    assert_eq!(assistant.availability(), Ok(()));
    each_passage_has_its_answer_in_order(assistant);
    no_passage_gives_no_answer(assistant);
}

fn each_passage_has_its_answer_in_order(assistant: &dyn WritingAssistant) {
    let passages = Passages::of(
        WritingAction::Correct,
        "Il a écrit une lettre.\n\nNous partons demain matin.",
    );
    let answers = assistant
        .answer(WritingAction::Correct.instructions(), &passages.prompts())
        .unwrap();
    assert_eq!(answers.len(), 2);
    assert!(answers[0].contains("lettre"), "{answers:?}");
    assert!(answers[1].contains("demain"), "{answers:?}");
}

fn no_passage_gives_no_answer(assistant: &dyn WritingAssistant) {
    let answers = assistant
        .answer(WritingAction::Summarize.instructions(), &[])
        .unwrap();
    assert_eq!(answers, Vec::<String>::new());
}
