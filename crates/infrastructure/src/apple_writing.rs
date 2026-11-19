//! L'assistant d'écriture branché sur le modèle d'IA intégré au Mac (Apple Intelligence), par
//! l'assistant Swift `malorean-writing` lancé à chaque demande, en JSON sur son entrée et sa
//! sortie (fiche 0031, protocole écrit en tête de `swift/writing.swift`).

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use application::{AssistError, Unavailability, WritingAssistant};
use serde::{Deserialize, Serialize};

/// Le nom de l'assistant Swift, à côté du programme de l'application une fois livrée.
pub const WRITING_HELPER: &str = "malorean-writing";

/// L'assistant Swift construit avec le projet (`build.rs`) ; vide s'il n'a pas pu l'être.
const BUILT_HELPER: &str = env!("MALOREAN_WRITING_HELPER");

#[derive(Serialize)]
struct Request<'a> {
    instructions: &'a str,
    prompts: &'a [String],
}

/// La réponse de l'assistant Swift : un seul de ses champs est rempli.
#[derive(Debug, Default, Deserialize)]
struct Reply {
    available: Option<bool>,
    unavailable: Option<String>,
    answers: Option<Vec<String>>,
    refused: Option<bool>,
    failed: Option<String>,
}

/// L'assistant d'écriture du Mac : chaque demande lance l'assistant Swift, qui parle au modèle.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppleWritingAssistant {
    helper: PathBuf,
}

impl AppleWritingAssistant {
    /// L'assistant qui lance l'assistant Swift rangé à `helper`.
    #[must_use]
    pub fn new(helper: impl Into<PathBuf>) -> Self {
        Self {
            helper: helper.into(),
        }
    }

    /// L'assistant Swift construit avec le projet.
    #[must_use]
    pub fn built() -> Self {
        Self::new(BUILT_HELPER)
    }

    /// L'assistant Swift livré à côté du programme de l'application, s'il y est ; sinon celui
    /// construit avec le projet.
    #[must_use]
    pub fn installed() -> Self {
        std::env::current_exe()
            .ok()
            .map(|program| program.with_file_name(WRITING_HELPER))
            .filter(|helper| helper.is_file())
            .map_or_else(Self::built, Self::new)
    }

    /// Où est l'assistant Swift lancé.
    #[must_use]
    pub fn helper(&self) -> &Path {
        &self.helper
    }

    /// Lance l'assistant Swift pour `command`, lui donne `input`, et lit sa réponse.
    fn ask(&self, command: &str, input: &[u8]) -> Result<Reply, AssistError> {
        let missing = |_| AssistError::Unavailable(Unavailability::AssistantMissing);
        let mut child = Command::new(&self.helper)
            .arg(command)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(missing)?;
        if let Some(mut stdin) = child.stdin.take() {
            // L'assistant ne lit pas son entrée pour `availability` : qu'elle soit fermée avant
            // d'avoir tout reçu ne change rien à sa réponse.
            stdin.write_all(input).ok();
        }
        let output = child.wait_with_output().map_err(missing)?;
        serde_json::from_slice(&output.stdout).map_err(|_| {
            AssistError::Failed("l'assistant d'écriture s'est arrêté sans répondre".to_owned())
        })
    }
}

/// La raison donnée par l'assistant Swift ; une raison inconnue (macOS plus récent) compte comme
/// un Mac qui ne peut pas.
fn unavailability(reason: &str) -> Unavailability {
    match reason {
        "appleIntelligenceNotEnabled" => Unavailability::AppleIntelligenceDisabled,
        "modelNotReady" => Unavailability::ModelNotReady,
        "systemTooOld" => Unavailability::SystemTooOld,
        _ => Unavailability::DeviceNotEligible,
    }
}

impl WritingAssistant for AppleWritingAssistant {
    fn availability(&self) -> Result<(), Unavailability> {
        let reply = self.ask("availability", b"").map_err(|error| match error {
            AssistError::Unavailable(reason) => reason,
            AssistError::Refused | AssistError::Failed(_) => Unavailability::AssistantMissing,
        })?;
        match (reply.available, reply.unavailable) {
            (_, Some(reason)) => Err(unavailability(&reason)),
            (Some(true), None) => Ok(()),
            _ => Err(Unavailability::AssistantMissing),
        }
    }

    fn answer(&self, instructions: &str, prompts: &[String]) -> Result<Vec<String>, AssistError> {
        if prompts.is_empty() {
            return Ok(Vec::new());
        }
        let request = serde_json::to_vec(&Request {
            instructions,
            prompts,
        })
        .map_err(|error| AssistError::Failed(error.to_string()))?;
        let reply = self.ask("answer", &request)?;
        match reply {
            Reply {
                answers: Some(answers),
                ..
            } if answers.len() == prompts.len() => Ok(answers),
            Reply {
                unavailable: Some(reason),
                ..
            } => Err(AssistError::Unavailable(unavailability(&reason))),
            Reply {
                refused: Some(true),
                ..
            } => Err(AssistError::Refused),
            Reply {
                failed: Some(reason),
                ..
            } => Err(AssistError::Failed(reason)),
            _ => Err(AssistError::Failed(
                "l'assistant d'écriture a rendu une réponse incomplète".to_owned(),
            )),
        }
    }
}
