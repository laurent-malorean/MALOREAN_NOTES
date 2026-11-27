//! Ports de la saisie vocale (fiche 0103) : le transcripteur, derrière lequel se trouve le moteur
//! de transcription du Mac, et l'interface qui reçoit les événements de la saisie vocale.

use std::fmt::Debug;

use domain::voice_input::{VoiceEvent, VoiceFailure};

/// Une langue que macOS sait transcrire.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VoiceLanguage {
    /// Son identifiant (`fr-FR`).
    pub id: String,
    /// Son nom, dans la langue du Mac (« français (France) »).
    pub name: String,
    /// Son modèle de langue est-il déjà sur le Mac ? Sinon, la première saisie le télécharge.
    pub ready: bool,
}

/// Où en est l'autorisation d'écouter le micro.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VoiceAccess {
    /// L'utilisateur l'a accordée.
    Allowed,
    /// L'utilisateur l'a refusée (ou le Mac l'interdit).
    Denied,
    /// Pas encore demandée : le premier clic sur le micro la demande.
    Undecided,
}

/// Ce que le moteur de transcription sait de ce Mac.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VoiceCatalog {
    /// La langue du Mac, parmi celles que macOS sait transcrire ; rien si aucune ne convient.
    pub system: Option<String>,
    /// L'autorisation du micro.
    pub access: VoiceAccess,
    /// Les langues que macOS sait transcrire.
    pub languages: Vec<VoiceLanguage>,
}

/// Où le moteur envoie ses événements, depuis son propre fil.
pub type VoiceSink = Box<dyn FnMut(VoiceEvent) + Send>;

/// Une écoute en cours.
pub trait Listening: Send + Sync + Debug {
    /// Demande l'arrêt : le moteur fixe ce qu'il peut, envoie les derniers événements puis
    /// [`VoiceEvent::Ended`]. Sans attendre.
    fn stop(&self);
}

/// Le moteur de la saisie vocale : il écoute le micro et envoie le texte reconnu. Le son reste
/// sur le Mac, n'est jamais écrit sur le disque.
pub trait Transcriber: Send + Sync + Debug {
    /// Ce que le moteur sait de ce Mac.
    ///
    /// # Errors
    ///
    /// [`VoiceFailure::SystemTooOld`] si macOS est plus ancien que 26,
    /// [`VoiceFailure::EngineMissing`] si le moteur ne répond pas.
    fn catalog(&self) -> Result<VoiceCatalog, VoiceFailure>;

    /// Prépare le modèle de la langue `language` : le télécharge s'il manque. Rend la main quand
    /// il est prêt.
    ///
    /// # Errors
    ///
    /// [`VoiceFailure::LanguageUnsupported`] si macOS ne sait pas la transcrire,
    /// [`VoiceFailure::LanguageDownload`] si le téléchargement échoue, ou l'une des erreurs de
    /// [`Transcriber::catalog`].
    fn prepare(&self, language: &str) -> Result<(), VoiceFailure>;

    /// Lance l'écoute en `language` et rend la main aussitôt : les événements arrivent ensuite
    /// par `sink`, et finissent toujours par [`VoiceEvent::Ended`], même après un échec.
    ///
    /// # Errors
    ///
    /// [`VoiceFailure::SystemTooOld`] ou [`VoiceFailure::EngineMissing`] si le moteur ne peut pas
    /// être lancé ; toute autre raison arrive par `sink`.
    fn listen(&self, language: &str, sink: VoiceSink) -> Result<Box<dyn Listening>, VoiceFailure>;
}

/// L'interface, qui apprend la saisie vocale par des événements.
pub trait VoiceEvents: Send + Sync + Debug {
    /// Un événement de la saisie vocale en cours.
    fn voice_event(&self, event: &VoiceEvent);
}
