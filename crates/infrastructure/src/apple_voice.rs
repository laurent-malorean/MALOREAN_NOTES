//! Le transcripteur du Mac : SpeechAnalyzer d'Apple, par l'assistant Swift `malorean-voice`, lancé
//! pour chaque demande et qui parle en lignes JSON (fiche 0103, protocole écrit en tête de
//! `swift/voice.swift`). Le son reste dans l'assistant, sur le Mac : seul le texte en sort.

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;

use application::{Listening, Transcriber, VoiceAccess, VoiceCatalog, VoiceLanguage, VoiceSink};
use domain::voice_input::{VoiceEvent, VoiceFailure};
use serde::Deserialize;

/// Le nom de l'assistant Swift, à côté du programme de l'application une fois livrée.
pub const VOICE_HELPER: &str = "malorean-voice";

/// L'assistant Swift construit avec le projet (`build.rs`) ; vide s'il n'a pas pu l'être.
const BUILT_HELPER: &str = env!("MALOREAN_VOICE_HELPER");

/// La réponse de `status` et de `prepare` : seuls les champs de la commande sont remplis.
#[derive(Debug, Default, Deserialize)]
struct Reply {
    unavailable: Option<String>,
    system: Option<String>,
    access: Option<String>,
    languages: Option<Vec<LanguageReply>>,
    ready: Option<bool>,
    failed: Option<String>,
}

#[derive(Debug, Deserialize)]
struct LanguageReply {
    id: String,
    name: String,
    ready: bool,
}

/// Une ligne de l'écoute.
#[derive(Debug, Deserialize)]
struct Line {
    event: String,
    text: Option<String>,
    value: Option<f32>,
    reason: Option<String>,
}

/// La raison donnée par l'assistant ; une raison inconnue (macOS plus récent) compte pour un arrêt
/// du moteur.
fn failure(reason: &str) -> VoiceFailure {
    match reason {
        "systemTooOld" => VoiceFailure::SystemTooOld,
        "accessDenied" => VoiceFailure::AccessDenied,
        "noMicrophone" => VoiceFailure::NoMicrophone,
        "languageUnsupported" => VoiceFailure::LanguageUnsupported,
        "languageDownload" => VoiceFailure::LanguageDownload,
        _ => VoiceFailure::Stopped,
    }
}

/// L'événement d'une ligne de l'assistant ; rien si la ligne n'est pas comprise.
fn parse_event(line: &str) -> Option<VoiceEvent> {
    let line: Line = serde_json::from_str(line).ok()?;
    match line.event.as_str() {
        "preparing" => Some(VoiceEvent::Preparing),
        "listening" => Some(VoiceEvent::Listening),
        "provisional" => line.text.map(VoiceEvent::Provisional),
        "fixed" => line.text.map(VoiceEvent::Fixed),
        "level" => line.value.map(VoiceEvent::Level),
        "failed" => Some(VoiceEvent::Failed(failure(
            line.reason.as_deref().unwrap_or_default(),
        ))),
        "ended" => Some(VoiceEvent::Ended),
        _ => None,
    }
}

/// Le transcripteur du Mac : chaque demande lance l'assistant Swift.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppleTranscriber {
    helper: PathBuf,
}

impl AppleTranscriber {
    /// Le transcripteur qui lance l'assistant Swift rangé à `helper`.
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
            .map(|program| program.with_file_name(VOICE_HELPER))
            .filter(|helper| helper.is_file())
            .map_or_else(Self::built, Self::new)
    }

    /// Où est l'assistant Swift lancé.
    #[must_use]
    pub fn helper(&self) -> &Path {
        &self.helper
    }

    /// Lance l'assistant pour une commande à réponse unique et lit sa réponse ; l'assistant
    /// absent, muet ou illisible compte pour un moteur introuvable.
    fn ask(&self, arguments: &[&str]) -> Result<Reply, VoiceFailure> {
        let output = Command::new(&self.helper)
            .args(arguments)
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .map_err(|_| VoiceFailure::EngineMissing)?;
        let reply: Reply =
            serde_json::from_slice(&output.stdout).map_err(|_| VoiceFailure::EngineMissing)?;
        match &reply.unavailable {
            Some(reason) if reason == "systemTooOld" => Err(VoiceFailure::SystemTooOld),
            Some(_) => Err(VoiceFailure::EngineMissing),
            None => Ok(reply),
        }
    }
}

impl Transcriber for AppleTranscriber {
    fn catalog(&self) -> Result<VoiceCatalog, VoiceFailure> {
        let reply = self.ask(&["status"])?;
        let languages = reply.languages.ok_or(VoiceFailure::EngineMissing)?;
        let access = match reply.access.as_deref() {
            Some("allowed") => VoiceAccess::Allowed,
            Some("undecided") => VoiceAccess::Undecided,
            _ => VoiceAccess::Denied,
        };
        Ok(VoiceCatalog {
            system: reply.system,
            access,
            languages: languages
                .into_iter()
                .map(|language| VoiceLanguage {
                    id: language.id,
                    name: language.name,
                    ready: language.ready,
                })
                .collect(),
        })
    }

    fn prepare(&self, language: &str) -> Result<(), VoiceFailure> {
        let reply = self.ask(&["prepare", language])?;
        match (reply.ready, reply.failed) {
            (Some(true), None) => Ok(()),
            (_, Some(reason)) => Err(failure(&reason)),
            _ => Err(VoiceFailure::EngineMissing),
        }
    }

    fn listen(
        &self,
        language: Option<&str>,
        sink: VoiceSink,
    ) -> Result<Box<dyn Listening>, VoiceFailure> {
        let mut child = Command::new(&self.helper)
            .arg("listen")
            .args(language)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| VoiceFailure::EngineMissing)?;
        let (Some(stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
            child.kill().ok();
            return Err(VoiceFailure::EngineMissing);
        };
        let child = Arc::new(Mutex::new(child));
        let reading = Arc::clone(&child);
        thread::spawn(move || {
            read_events(BufReader::new(stdout), sink);
            reading
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .wait()
                .ok();
        });
        Ok(Box::new(AppleListening {
            stdin: Mutex::new(Some(stdin)),
            child,
        }))
    }
}

/// Envoie à `sink` les événements lus, jusqu'à la fin de l'assistant. S'il s'arrête sans avoir dit
/// « fin » : un échec (moteur introuvable s'il n'a rien dit du tout), puis la fin.
fn read_events(lines: impl BufRead, mut sink: VoiceSink) {
    let mut heard = false;
    for line in lines.lines().map_while(Result::ok) {
        let Some(event) = parse_event(&line) else {
            continue;
        };
        heard = true;
        let ended = event == VoiceEvent::Ended;
        sink(event);
        if ended {
            return;
        }
    }
    sink(VoiceEvent::Failed(if heard {
        VoiceFailure::Stopped
    } else {
        VoiceFailure::EngineMissing
    }));
    sink(VoiceEvent::Ended);
}

/// Une écoute : l'assistant lancé, à qui l'on dit « stop ».
#[derive(Debug)]
struct AppleListening {
    stdin: Mutex<Option<ChildStdin>>,
    child: Arc<Mutex<Child>>,
}

impl Listening for AppleListening {
    fn stop(&self) {
        let stdin = self
            .stdin
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take();
        if let Some(mut stdin) = stdin {
            // L'entrée se ferme ensuite : même si l'assistant ne lit pas « stop », il s'arrête.
            stdin.write_all(b"stop\n").ok();
        }
    }
}

impl Drop for AppleListening {
    /// Une écoute abandonnée ne laisse pas d'assistant derrière elle (le micro resterait pris).
    fn drop(&mut self) {
        self.child
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .kill()
            .ok();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_line_of_the_helper_is_understood() {
        let text = |value: &str| value.to_owned();
        let cases = [
            (r#"{"event":"preparing"}"#, VoiceEvent::Preparing),
            (r#"{"event":"listening"}"#, VoiceEvent::Listening),
            (
                r#"{"event":"provisional","text":"bon"}"#,
                VoiceEvent::Provisional(text("bon")),
            ),
            (
                r#"{"event":"fixed","text":"Bonjour. "}"#,
                VoiceEvent::Fixed(text("Bonjour. ")),
            ),
            (r#"{"event":"level","value":0.25}"#, VoiceEvent::Level(0.25)),
            (
                r#"{"event":"failed","reason":"accessDenied"}"#,
                VoiceEvent::Failed(VoiceFailure::AccessDenied),
            ),
            (r#"{"event":"ended"}"#, VoiceEvent::Ended),
        ];
        for (line, event) in cases {
            assert_eq!(parse_event(line), Some(event), "{line}");
        }
    }

    #[test]
    fn a_line_that_is_not_understood_is_ignored() {
        for line in [
            "",
            "pas du JSON",
            r#"{"event":"futur"}"#,
            r#"{"event":"provisional"}"#,
            r#"{"event":"fixed"}"#,
            r#"{"event":"level"}"#,
            r#"{"texte":"bon"}"#,
        ] {
            assert_eq!(parse_event(line), None, "{line}");
        }
    }

    #[test]
    fn each_reason_of_the_helper_is_understood() {
        let reasons = [
            ("systemTooOld", VoiceFailure::SystemTooOld),
            ("accessDenied", VoiceFailure::AccessDenied),
            ("noMicrophone", VoiceFailure::NoMicrophone),
            ("languageUnsupported", VoiceFailure::LanguageUnsupported),
            ("languageDownload", VoiceFailure::LanguageDownload),
            ("stopped", VoiceFailure::Stopped),
            ("raisonFuture", VoiceFailure::Stopped),
        ];
        for (reason, expected) in reasons {
            assert_eq!(failure(reason), expected, "{reason}");
        }
        assert_eq!(
            parse_event(r#"{"event":"failed"}"#),
            Some(VoiceEvent::Failed(VoiceFailure::Stopped))
        );
    }
}
