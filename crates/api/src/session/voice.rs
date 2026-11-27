//! La saisie vocale vue depuis l'interface (fiche 0103) : l'état du micro, la langue, le départ et
//! l'arrêt de l'écoute.

use std::sync::Arc;

use application::use_cases::VoiceInput;
use application::{AppError, Preferences, Transcriber, Uptime, VoiceEvents};
use domain::voice_input::VoiceFailure;

use super::Session;
use crate::{ApiError, VoiceInputStatusItem};

impl Session {
    /// La même session, dont la saisie vocale passe par `transcriber` et envoie ses événements à
    /// `events` ; `uptime` mesure le silence. Sans lui, la saisie vocale se dit indisponible.
    #[must_use]
    pub fn with_voice_input(
        mut self,
        transcriber: Arc<dyn Transcriber>,
        events: Arc<dyn VoiceEvents>,
        uptime: Arc<dyn Uptime>,
    ) -> Self {
        self.voice = Some(VoiceInput::new(
            transcriber,
            Arc::clone(&self.preferences) as Arc<dyn Preferences>,
            events,
            uptime,
        ));
        self
    }

    /// L'état de la saisie vocale : le micro peut-il servir, dans quelle langue, avec quelles
    /// autres.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] si les préférences ne se lisent pas.
    pub fn voice_input_status(&self) -> Result<VoiceInputStatusItem, ApiError> {
        match &self.voice {
            Some(voice) => Ok(voice.status()?.into()),
            None => Ok(VoiceInputStatusItem::Unavailable {
                code: VoiceFailure::EngineMissing.code().to_owned(),
                message: VoiceFailure::EngineMissing.to_string(),
            }),
        }
    }

    /// Choisit la langue de la saisie vocale (`None` : celle du Mac).
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : écoute en cours, langue que macOS ne
    /// sait pas transcrire, préférences illisibles.
    pub fn choose_voice_language(&self, language: Option<&str>) -> Result<(), ApiError> {
        Ok(self.voice()?.choose_language(language)?)
    }

    /// Prépare le modèle de `language` : le télécharge s'il manque. Rend la main quand il est prêt.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : langue inconnue, téléchargement
    /// impossible.
    pub fn prepare_voice_language(&self, language: &str) -> Result<(), ApiError> {
        Ok(self.voice()?.prepare_language(language)?)
    }

    /// Démarre la saisie vocale ; la suite arrive par les événements.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : déjà en cours, moteur indisponible.
    pub fn start_voice_input(&self) -> Result<(), ApiError> {
        Ok(self.voice()?.start()?)
    }

    /// Arrête la saisie vocale en cours, s'il y en a une : le texte provisoire est fixé tel quel,
    /// puis vient la fin.
    pub fn stop_voice_input(&self) {
        if let Some(voice) = &self.voice {
            voice.stop();
        }
    }

    fn voice(&self) -> Result<&VoiceInput, AppError> {
        self.voice
            .as_ref()
            .ok_or(AppError::Voice(VoiceFailure::EngineMissing))
    }
}
