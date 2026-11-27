//! La saisie vocale (fiche 0103) : ce que dit le moteur de transcription, les raisons pour
//! lesquelles il s'arrête, et la dictée qui range ces événements dans l'ordre où l'interface les
//! reçoit (texte provisoire fixé tel quel à l'arrêt, arrêt après un silence).

use std::fmt;
use std::time::Duration;

/// Le silence après lequel la saisie vocale s'arrête d'elle-même (spécification, § 5.1).
pub const SILENCE_TIMEOUT: Duration = Duration::from_secs(30);

/// Le message bref qui dit que le silence a arrêté la saisie vocale (spécification, § 5.1).
pub const SILENCE_MESSAGE: &str = "Saisie vocale arrêtée : silence";

/// Pourquoi la saisie vocale ne démarre pas ou s'arrête ; le message est en français, prêt à
/// afficher tel quel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum VoiceFailure {
    /// macOS est plus ancien que 26 : pas de SpeechAnalyzer.
    SystemTooOld,
    /// Le programme qui parle au moteur d'Apple manque ou ne répond pas.
    EngineMissing,
    /// L'accès au micro ou à la reconnaissance vocale est refusé.
    AccessDenied,
    /// Aucun micro n'est branché, ou il est occupé.
    NoMicrophone,
    /// Le moteur s'est arrêté de lui-même.
    Stopped,
    /// macOS ne sait pas transcrire cette langue.
    LanguageUnsupported,
    /// Le modèle de la langue n'a pas pu être téléchargé.
    LanguageDownload,
    /// Une saisie vocale est déjà en cours (ou se termine).
    AlreadyListening,
    /// On ne change pas de langue pendant l'écoute.
    LanguageLocked,
}

impl VoiceFailure {
    /// Le code que l'interface lit pour savoir quoi faire (griser le micro, proposer de réessayer).
    #[must_use]
    pub fn code(self) -> &'static str {
        match self {
            Self::SystemTooOld => "systemTooOld",
            Self::EngineMissing => "engineMissing",
            Self::AccessDenied => "accessDenied",
            Self::NoMicrophone => "noMicrophone",
            Self::Stopped => "stopped",
            Self::LanguageUnsupported => "languageUnsupported",
            Self::LanguageDownload => "languageDownload",
            Self::AlreadyListening => "alreadyListening",
            Self::LanguageLocked => "languageLocked",
        }
    }
}

impl fmt::Display for VoiceFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::SystemTooOld => "Saisie vocale : macOS 26 minimum",
            Self::EngineMissing => {
                "Le moteur de la saisie vocale est introuvable : réinstallez l'application."
            }
            Self::AccessDenied => "La saisie vocale a besoin du micro et de la reconnaissance vocale.",
            Self::NoMicrophone => "Aucun micro disponible.",
            Self::Stopped => "La saisie vocale s'est arrêtée.",
            Self::LanguageUnsupported => {
                "Cette langue n'est pas prise en charge par la saisie vocale."
            }
            Self::LanguageDownload => {
                "Le modèle de la langue n'a pas pu être téléchargé : vérifiez la connexion, puis réessayez."
            }
            Self::AlreadyListening => "La saisie vocale est déjà en cours.",
            Self::LanguageLocked => "Arrêtez la saisie vocale avant de changer de langue.",
        })
    }
}

impl std::error::Error for VoiceFailure {}

/// Ce qui arrive pendant une saisie vocale, dans l'ordre.
#[derive(Debug, Clone, PartialEq)]
pub enum VoiceEvent {
    /// Le modèle de la langue se prépare (téléchargement) ; l'écoute n'a pas commencé.
    Preparing,
    /// Le micro écoute.
    Listening,
    /// Le texte provisoire, en entier : il remplace le précédent. Vide, il l'efface.
    Provisional(String),
    /// Le texte fixé : le moteur ne le corrigera plus ; le texte provisoire repart de zéro.
    Fixed(String),
    /// Le niveau sonore, de 0 (silence) à 1.
    Level(f32),
    /// Trente secondes sans parole : la saisie vocale va s'arrêter. Jamais envoyé par le moteur.
    Silence,
    /// La saisie vocale s'arrête pour cette raison ; `Ended` suit.
    Failed(VoiceFailure),
    /// Fin de la saisie vocale : plus aucun événement ne suit.
    Ended,
}

/// Une saisie vocale en cours : elle garde le texte provisoire et le moment de la dernière parole.
#[derive(Debug, Clone)]
pub struct Dictation {
    silence: Duration,
    provisional: String,
    last_heard: Option<Duration>,
    silent: bool,
    finished: bool,
}

impl Dictation {
    /// Une dictée qui s'arrête après `silence` sans parole.
    #[must_use]
    pub fn new(silence: Duration) -> Self {
        Self {
            silence,
            provisional: String::new(),
            last_heard: None,
            silent: false,
            finished: false,
        }
    }

    /// Les événements à transmettre à l'interface quand le moteur envoie `event` à l'instant
    /// `now` (le temps passé depuis un point fixe). À la fin ou en cas d'échec, le texte
    /// provisoire est d'abord fixé tel quel ; après la fin, plus rien ne passe.
    pub fn receive(&mut self, event: VoiceEvent, now: Duration) -> Vec<VoiceEvent> {
        if self.finished {
            return Vec::new();
        }
        match event {
            VoiceEvent::Preparing => vec![VoiceEvent::Preparing],
            VoiceEvent::Listening => {
                self.last_heard = Some(now);
                vec![VoiceEvent::Listening]
            }
            VoiceEvent::Provisional(text) => self.provisional(text, now),
            VoiceEvent::Fixed(text) => self.fixed(text, now),
            VoiceEvent::Level(level) => vec![VoiceEvent::Level(clamped(level))],
            VoiceEvent::Silence => Vec::new(),
            VoiceEvent::Failed(failure) => self.finish(Some(failure)),
            VoiceEvent::Ended => self.finish(None),
        }
    }

    /// `Silence` une seule fois, quand `now` est à `silence` ou plus de la dernière parole ; rien
    /// avant que le micro écoute, ni après la fin.
    pub fn check_silence(&mut self, now: Duration) -> Option<VoiceEvent> {
        if self.finished || self.silent {
            return None;
        }
        let heard = self.last_heard?;
        if now.saturating_sub(heard) < self.silence {
            return None;
        }
        self.silent = true;
        Some(VoiceEvent::Silence)
    }

    /// La dictée est-elle finie ?
    #[must_use]
    pub fn is_finished(&self) -> bool {
        self.finished
    }

    fn provisional(&mut self, text: String, now: Duration) -> Vec<VoiceEvent> {
        if text.trim().is_empty() {
            self.provisional.clear();
            return vec![VoiceEvent::Provisional(String::new())];
        }
        self.last_heard = Some(now);
        self.provisional.clone_from(&text);
        vec![VoiceEvent::Provisional(text)]
    }

    fn fixed(&mut self, text: String, now: Duration) -> Vec<VoiceEvent> {
        let had_provisional = !std::mem::take(&mut self.provisional).is_empty();
        if text.trim().is_empty() {
            return if had_provisional {
                vec![VoiceEvent::Provisional(String::new())]
            } else {
                Vec::new()
            };
        }
        self.last_heard = Some(now);
        vec![VoiceEvent::Fixed(text)]
    }

    fn finish(&mut self, failure: Option<VoiceFailure>) -> Vec<VoiceEvent> {
        self.finished = true;
        let mut events = Vec::new();
        let provisional = std::mem::take(&mut self.provisional);
        if !provisional.trim().is_empty() {
            events.push(VoiceEvent::Fixed(provisional));
        }
        events.extend(failure.map(VoiceEvent::Failed));
        events.push(VoiceEvent::Ended);
        events
    }
}

fn clamped(level: f32) -> f32 {
    if level.is_nan() {
        0.0
    } else {
        level.clamp(0.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use VoiceEvent::{Ended, Failed, Fixed, Level, Listening, Preparing, Provisional, Silence};

    const SECOND: Duration = Duration::from_secs(1);

    fn dictation() -> Dictation {
        Dictation::new(SILENCE_TIMEOUT)
    }

    fn text(value: &str) -> String {
        value.to_owned()
    }

    #[test]
    fn the_silence_is_thirty_seconds() {
        assert_eq!(SILENCE_TIMEOUT, Duration::from_secs(30));
        assert_eq!(SILENCE_MESSAGE, "Saisie vocale arrêtée : silence");
    }

    #[test]
    fn each_failure_has_a_code_and_a_message_in_french() {
        let all = [
            (
                VoiceFailure::SystemTooOld,
                "systemTooOld",
                "Saisie vocale : macOS 26 minimum",
            ),
            (
                VoiceFailure::EngineMissing,
                "engineMissing",
                "Le moteur de la saisie vocale est introuvable : réinstallez l'application.",
            ),
            (
                VoiceFailure::AccessDenied,
                "accessDenied",
                "La saisie vocale a besoin du micro et de la reconnaissance vocale.",
            ),
            (
                VoiceFailure::NoMicrophone,
                "noMicrophone",
                "Aucun micro disponible.",
            ),
            (
                VoiceFailure::Stopped,
                "stopped",
                "La saisie vocale s'est arrêtée.",
            ),
            (
                VoiceFailure::LanguageUnsupported,
                "languageUnsupported",
                "Cette langue n'est pas prise en charge par la saisie vocale.",
            ),
            (
                VoiceFailure::LanguageDownload,
                "languageDownload",
                "Le modèle de la langue n'a pas pu être téléchargé : vérifiez la connexion, puis réessayez.",
            ),
            (
                VoiceFailure::AlreadyListening,
                "alreadyListening",
                "La saisie vocale est déjà en cours.",
            ),
            (
                VoiceFailure::LanguageLocked,
                "languageLocked",
                "Arrêtez la saisie vocale avant de changer de langue.",
            ),
        ];
        for (failure, code, message) in all {
            assert_eq!(failure.code(), code);
            assert_eq!(failure.to_string(), message);
        }
    }

    #[test]
    fn preparing_listening_and_the_level_pass_through() {
        let mut dictation = dictation();
        assert_eq!(dictation.receive(Preparing, SECOND), vec![Preparing]);
        assert_eq!(dictation.receive(Listening, SECOND), vec![Listening]);
        assert_eq!(dictation.receive(Level(0.4), SECOND), vec![Level(0.4)]);
    }

    #[test]
    fn the_level_stays_between_zero_and_one() {
        let mut dictation = dictation();
        assert_eq!(dictation.receive(Level(3.0), SECOND), vec![Level(1.0)]);
        assert_eq!(dictation.receive(Level(-1.0), SECOND), vec![Level(0.0)]);
        assert_eq!(dictation.receive(Level(f32::NAN), SECOND), vec![Level(0.0)]);
        assert_eq!(dictation.receive(Level(0.0), SECOND), vec![Level(0.0)]);
        assert_eq!(dictation.receive(Level(1.0), SECOND), vec![Level(1.0)]);
    }

    #[test]
    fn a_provisional_text_passes_and_replaces_the_previous_one() {
        let mut dictation = dictation();
        assert_eq!(
            dictation.receive(Provisional(text("bon")), SECOND),
            vec![Provisional(text("bon"))]
        );
        assert_eq!(
            dictation.receive(Provisional(text("bonjour")), SECOND),
            vec![Provisional(text("bonjour"))]
        );
        assert_eq!(
            dictation.receive(Ended, SECOND),
            vec![Fixed(text("bonjour")), Ended]
        );
    }

    #[test]
    fn a_blank_provisional_text_clears_the_decoration_and_is_not_kept() {
        let mut dictation = dictation();
        dictation.receive(Provisional(text("bon")), SECOND);
        assert_eq!(
            dictation.receive(Provisional(text("  ")), SECOND),
            vec![Provisional(text(""))]
        );
        assert_eq!(dictation.receive(Ended, SECOND), vec![Ended]);
    }

    #[test]
    fn a_fixed_text_passes_untouched_and_the_provisional_text_starts_again() {
        let mut dictation = dictation();
        dictation.receive(Provisional(text("bonjour")), SECOND);
        assert_eq!(
            dictation.receive(Fixed(text("Bonjour. ")), SECOND),
            vec![Fixed(text("Bonjour. "))]
        );
        assert_eq!(dictation.receive(Ended, SECOND), vec![Ended]);
    }

    #[test]
    fn a_blank_fixed_text_is_dropped_but_still_clears_a_provisional_one() {
        let mut dictation = dictation();
        assert_eq!(dictation.receive(Fixed(text(" ")), SECOND), Vec::new());
        dictation.receive(Provisional(text("hum")), SECOND);
        assert_eq!(
            dictation.receive(Fixed(text(" ")), SECOND),
            vec![Provisional(text(""))]
        );
        assert_eq!(dictation.receive(Ended, SECOND), vec![Ended]);
    }

    #[test]
    fn the_end_fixes_the_provisional_text_as_it_is() {
        let mut dictation = dictation();
        dictation.receive(Provisional(text("à demain")), SECOND);
        assert_eq!(
            dictation.receive(Ended, SECOND),
            vec![Fixed(text("à demain")), Ended]
        );
        assert!(dictation.is_finished());
    }

    #[test]
    fn a_failure_fixes_the_provisional_text_then_tells_then_ends() {
        let mut dictation = dictation();
        dictation.receive(Provisional(text("à demain")), SECOND);
        assert_eq!(
            dictation.receive(Failed(VoiceFailure::Stopped), SECOND),
            vec![
                Fixed(text("à demain")),
                Failed(VoiceFailure::Stopped),
                Ended
            ]
        );
    }

    #[test]
    fn a_failure_without_provisional_text_only_tells_and_ends() {
        let mut dictation = dictation();
        assert_eq!(
            dictation.receive(Failed(VoiceFailure::NoMicrophone), SECOND),
            vec![Failed(VoiceFailure::NoMicrophone), Ended]
        );
    }

    #[test]
    fn nothing_passes_after_the_end() {
        let mut dictation = dictation();
        dictation.receive(Ended, SECOND);
        assert!(dictation.is_finished());
        assert_eq!(
            dictation.receive(Provisional(text("trop tard")), SECOND),
            Vec::new()
        );
        assert_eq!(dictation.receive(Ended, SECOND), Vec::new());
        assert_eq!(
            dictation.receive(Failed(VoiceFailure::Stopped), SECOND),
            Vec::new()
        );
    }

    #[test]
    fn an_engine_cannot_announce_the_silence() {
        assert_eq!(dictation().receive(Silence, SECOND), Vec::new());
    }

    #[test]
    fn no_silence_is_announced_before_the_microphone_listens() {
        let mut dictation = dictation();
        assert_eq!(dictation.check_silence(SECOND * 100), None);
        dictation.receive(Preparing, SECOND);
        assert_eq!(dictation.check_silence(SECOND * 100), None);
    }

    #[test]
    fn the_silence_is_announced_once_thirty_seconds_after_the_last_speech() {
        let mut dictation = dictation();
        dictation.receive(Listening, SECOND * 10);
        assert_eq!(dictation.check_silence(SECOND * 39), None);
        assert_eq!(dictation.check_silence(SECOND * 40), Some(Silence));
        assert_eq!(dictation.check_silence(SECOND * 80), None);
    }

    #[test]
    fn speech_restarts_the_silence() {
        let mut dictation = dictation();
        dictation.receive(Listening, SECOND);
        dictation.receive(Provisional(text("un")), SECOND * 20);
        assert_eq!(dictation.check_silence(SECOND * 49), None);
        dictation.receive(Fixed(text("Un.")), SECOND * 45);
        assert_eq!(dictation.check_silence(SECOND * 74), None);
        assert_eq!(dictation.check_silence(SECOND * 75), Some(Silence));
    }

    #[test]
    fn the_level_and_blank_texts_are_not_speech() {
        let mut dictation = dictation();
        dictation.receive(Listening, SECOND);
        dictation.receive(Level(0.9), SECOND * 20);
        dictation.receive(Provisional(text(" ")), SECOND * 20);
        dictation.receive(Fixed(text(" ")), SECOND * 20);
        assert_eq!(dictation.check_silence(SECOND * 31), Some(Silence));
    }

    #[test]
    fn no_silence_is_announced_after_the_end() {
        let mut dictation = dictation();
        dictation.receive(Listening, SECOND);
        dictation.receive(Ended, SECOND);
        assert_eq!(dictation.check_silence(SECOND * 100), None);
    }
}
