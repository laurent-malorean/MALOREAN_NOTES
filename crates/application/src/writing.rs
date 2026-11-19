//! Port de l'assistant d'écriture : le modèle qui répond à une consigne sur des passages
//! (corriger, reformuler, résumer une sélection).

use std::fmt::Debug;

/// Pourquoi l'assistant d'écriture ne peut pas répondre sur ce Mac.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, thiserror::Error)]
pub enum Unavailability {
    /// Le Mac n'a pas ce qu'il faut pour Apple Intelligence (puce, région).
    #[error("ce Mac ne peut pas utiliser Apple Intelligence")]
    DeviceNotEligible,
    /// La version de macOS n'a pas encore le modèle d'Apple.
    #[error("Apple Intelligence demande macOS 26 ou plus récent")]
    SystemTooOld,
    /// Apple Intelligence est désactivé dans les réglages du Mac.
    #[error(
        "Apple Intelligence n'est pas activé : Réglages Système, « Apple Intelligence et Siri »"
    )]
    AppleIntelligenceDisabled,
    /// Le modèle n'est pas encore prêt, le plus souvent parce qu'il se télécharge.
    #[error(
        "le modèle d'Apple Intelligence n'est pas encore prêt (téléchargement en cours ?) : réessayez plus tard"
    )]
    ModelNotReady,
    /// Le programme qui parle au modèle manque ou ne répond pas.
    #[error("l'assistant d'écriture est introuvable : réinstallez l'application")]
    AssistantMissing,
}

/// Ce qui peut empêcher l'assistant d'écriture de répondre.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AssistError {
    /// L'assistant ne peut pas répondre sur ce Mac.
    Unavailable(Unavailability),
    /// Le modèle a refusé de traiter le texte (sujet qu'il ne traite pas).
    Refused,
    /// Le modèle n'a pas pu répondre ; la cause est lisible.
    Failed(String),
}

/// Le moteur de l'aide à l'écriture : il répond à une consigne pour chaque passage.
pub trait WritingAssistant: Send + Sync + Debug {
    /// Rien si l'assistant peut répondre ; sinon pourquoi.
    ///
    /// # Errors
    ///
    /// L'[`Unavailability`] qui l'empêche de répondre.
    fn availability(&self) -> Result<(), Unavailability>;

    /// La réponse du modèle à `instructions` pour chacun des `prompts`, dans le même ordre, chacun
    /// lu à neuf (le modèle ne se souvient pas du précédent) ; aucune s'il n'y a pas de passage.
    ///
    /// # Errors
    ///
    /// [`AssistError::Unavailable`] si l'assistant ne peut pas répondre,
    /// [`AssistError::Refused`] si le modèle refuse un passage, [`AssistError::Failed`] s'il
    /// échoue autrement.
    fn answer(&self, instructions: &str, prompts: &[String]) -> Result<Vec<String>, AssistError>;
}
