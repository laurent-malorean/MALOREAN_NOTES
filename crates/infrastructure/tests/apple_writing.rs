//! L'assistant d'écriture du Mac : son échange avec l'assistant Swift, joué avec de petits
//! scripts qui répondent à sa place, puis le contrat joué sur le vrai modèle d'Apple quand ce Mac
//! l'a (sinon le test le dit et s'arrête).

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use application::testing::writing_contract::writing_assistant_contract;
use application::{AssistError, Unavailability, WritingAssistant};
use domain::writing::{Passages, WritingAction};
use infrastructure::{AppleWritingAssistant, WRITING_HELPER};
use tempfile::TempDir;

/// Un assistant Swift remplacé par un script qui garde sa commande et son entrée, puis répond
/// `reply`.
fn scripted(reply: &str) -> (TempDir, AppleWritingAssistant) {
    let folder = TempDir::new().unwrap();
    let script = folder.path().join("helper.sh");
    let dir = folder.path().display();
    fs::write(
        &script,
        format!(
            "#!/bin/sh\necho \"$1\" > '{dir}/command'\ncat > '{dir}/input'\nprintf '%s' '{reply}'\n"
        ),
    )
    .unwrap();
    fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
    (folder, AppleWritingAssistant::new(script))
}

fn received(folder: &TempDir, name: &str) -> String {
    fs::read_to_string(folder.path().join(name)).unwrap()
}

fn prompts(texts: &[&str]) -> Vec<String> {
    texts.iter().map(|t| (*t).to_owned()).collect()
}

#[test]
fn an_available_model_is_reported_by_the_helper() {
    let (folder, assistant) = scripted(r#"{"available":true}"#);
    assert_eq!(assistant.availability(), Ok(()));
    assert_eq!(received(&folder, "command"), "availability\n");
}

/// La disponibilité que donne l'assistant quand le script répond `reply`.
fn availability_when(reply: &str) -> Result<(), Unavailability> {
    scripted(reply).1.availability()
}

#[test]
fn each_reason_given_by_the_helper_is_understood() {
    assert_eq!(
        availability_when(r#"{"unavailable":"deviceNotEligible"}"#),
        Err(Unavailability::DeviceNotEligible)
    );
    assert_eq!(
        availability_when(r#"{"unavailable":"appleIntelligenceNotEnabled"}"#),
        Err(Unavailability::AppleIntelligenceDisabled)
    );
    assert_eq!(
        availability_when(r#"{"unavailable":"modelNotReady"}"#),
        Err(Unavailability::ModelNotReady)
    );
    assert_eq!(
        availability_when(r#"{"unavailable":"systemTooOld"}"#),
        Err(Unavailability::SystemTooOld)
    );
    assert_eq!(
        availability_when(r#"{"unavailable":"raisonFuture"}"#),
        Err(Unavailability::DeviceNotEligible)
    );
}

#[test]
fn a_helper_that_says_nothing_clear_counts_as_missing() {
    let missing = Err(Unavailability::AssistantMissing);
    assert_eq!(availability_when(r#"{"available":false}"#), missing);
    assert_eq!(availability_when("{}"), missing);
    assert_eq!(availability_when("pas du JSON"), missing);
    assert_eq!(availability_when(r#"{"failed":"x"}"#), missing);
}

#[test]
fn a_missing_helper_is_reported_as_missing() {
    let assistant = AppleWritingAssistant::new("/nulle/part/malorean-writing");
    assert_eq!(
        assistant.availability(),
        Err(Unavailability::AssistantMissing)
    );
    assert_eq!(
        assistant.answer("Corrige.", &prompts(&["un"])),
        Err(AssistError::Unavailable(Unavailability::AssistantMissing))
    );
}

#[test]
fn the_instructions_and_passages_go_to_the_helper_and_its_answers_come_back_in_order() {
    let (folder, assistant) = scripted(r#"{"answers":["Un.","Deux."]}"#);
    let answers = assistant.answer("Corrige « ça ».", &prompts(&["un", "deux\n'trois'"]));
    assert_eq!(answers, Ok(prompts(&["Un.", "Deux."])));
    assert_eq!(received(&folder, "command"), "answer\n");
    let input: serde_json::Value = serde_json::from_str(&received(&folder, "input")).unwrap();
    assert_eq!(
        input,
        serde_json::json!({"instructions": "Corrige « ça ».", "prompts": ["un", "deux\n'trois'"]})
    );
}

#[test]
fn no_passage_does_not_start_the_helper() {
    let (folder, assistant) = scripted(r#"{"answers":[]}"#);
    assert_eq!(assistant.answer("Résume.", &[]), Ok(Vec::new()));
    assert!(!folder.path().join("command").exists());
}

/// Ce que rend l'assistant pour deux passages quand le script répond `reply`.
fn answer_when(reply: &str) -> Result<Vec<String>, AssistError> {
    scripted(reply)
        .1
        .answer("Corrige.", &prompts(&["un", "deux"]))
}

#[test]
fn what_stops_the_helper_from_answering_is_reported() {
    assert_eq!(
        answer_when(r#"{"unavailable":"modelNotReady"}"#),
        Err(AssistError::Unavailable(Unavailability::ModelNotReady))
    );
    assert_eq!(
        answer_when(r#"{"refused":true}"#),
        Err(AssistError::Refused)
    );
    assert_eq!(
        answer_when(r#"{"failed":"trop long"}"#),
        Err(AssistError::Failed("trop long".to_owned()))
    );
}

#[test]
fn an_incomplete_or_missing_answer_is_a_failure() {
    let incomplete = Err(AssistError::Failed(
        "l'assistant d'écriture a rendu une réponse incomplète".to_owned(),
    ));
    assert_eq!(answer_when(r#"{"answers":["seulement une"]}"#), incomplete);
    assert_eq!(answer_when(r#"{"refused":false}"#), incomplete);
    assert_eq!(
        answer_when(""),
        Err(AssistError::Failed(
            "l'assistant d'écriture s'est arrêté sans répondre".to_owned()
        ))
    );
}

#[test]
fn the_installed_helper_is_the_built_one_when_none_is_next_to_the_program() {
    let next_to_program: PathBuf = std::env::current_exe()
        .unwrap()
        .with_file_name(WRITING_HELPER);
    assert!(!next_to_program.exists());
    assert_eq!(
        AppleWritingAssistant::installed(),
        AppleWritingAssistant::built()
    );
    assert!(
        AppleWritingAssistant::built()
            .helper()
            .ends_with(WRITING_HELPER)
    );
}

/// Le contrat sur le vrai modèle d'Apple : seulement si ce Mac l'a. Sinon, la raison est écrite
/// dans la sortie des tests, jamais passée sous silence.
#[test]
fn the_apple_model_honours_the_writing_assistant_contract_when_this_mac_has_it() {
    let assistant = AppleWritingAssistant::built();
    match assistant.availability() {
        Ok(()) => match probe(&assistant) {
            Ok(()) => writing_assistant_contract(&assistant),
            Err(error) => skipped_after(&assistant, &error),
        },
        Err(reason) => skipped(&assistant, &reason),
    }
}

/// Une question d'essai au vrai modèle : il peut se dire disponible puis refuser de répondre
/// (erreur du système, modèle occupé ou en préparation). Ce n'est pas un défaut du contrat.
fn probe(assistant: &AppleWritingAssistant) -> Result<(), AssistError> {
    let passages = Passages::of(WritingAction::Correct, "Bonjour.");
    assistant
        .answer(WritingAction::Correct.instructions(), &passages.prompts())
        .map(|_| ())
}

fn skipped_after(assistant: &AppleWritingAssistant, error: &AssistError) {
    let helper: &Path = assistant.helper();
    let message = format!(
        "contrat du modèle d'Apple sauté ({}) : le modèle n'a pas répondu à la question d'essai : {error:?}\n",
        helper.display()
    );
    std::io::stderr().write_all(message.as_bytes()).unwrap();
}

fn skipped(assistant: &AppleWritingAssistant, reason: &Unavailability) {
    // Écrit directement sur la sortie d'erreur : le lanceur de tests ne la capture pas, le
    // message se voit même quand le test passe.
    let helper: &Path = assistant.helper();
    let message = format!(
        "contrat du modèle d'Apple sauté ({}) : {reason}\n",
        helper.display()
    );
    std::io::stderr().write_all(message.as_bytes()).unwrap();
}
