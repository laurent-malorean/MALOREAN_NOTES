//! Ports de la recherche par le sens : le moteur qui calcule les vecteurs de sens, et ce qui
//! touche aux modèles de sens rangés sur le Mac (fiche 0042). Aucun chemin, aucun octet ici :
//! les adaptateurs savent où et comment.

use std::fmt::Debug;
use std::ops::ControlFlow;
use std::sync::Arc;
use std::time::Duration;

use domain::{MeaningModel, MeaningVector, ModelFile};

/// Ce qui peut échouer côté modèle de sens ; chaque message dit quoi faire.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum MeaningError {
    /// Le modèle n'est pas (ou plus entièrement) sur le Mac.
    #[error("le modèle « {} » n'est pas téléchargé : téléchargez-le dans les réglages", .0.label())]
    ModelMissing(MeaningModel),
    /// Le téléchargement n'a pas abouti (réseau, disque) ; rien de partiel n'est gardé.
    #[error(
        "le téléchargement du modèle « {} » a échoué ({reason}) : vérifiez la connexion à Internet et l'espace libre sur le disque, puis réessayez",
        model.label()
    )]
    DownloadFailed {
        /// Le modèle.
        model: MeaningModel,
        /// La cause, lisible.
        reason: String,
    },
    /// L'appelant a arrêté le téléchargement ; rien de partiel n'est gardé.
    #[error("le téléchargement du modèle « {} » a été interrompu : relancez-le quand vous voulez", .0.label())]
    DownloadInterrupted(MeaningModel),
    /// Un fichier reçu n'a pas la taille ou la somme SHA-256 attendue : il a été effacé.
    #[error(
        "le fichier « {} » du modèle « {} » est refusé (taille ou somme de contrôle fausse) : relancez le téléchargement",
        file.name(),
        model.label()
    )]
    FileRefused {
        /// Le modèle.
        model: MeaningModel,
        /// Le fichier refusé.
        file: ModelFile,
    },
    /// Le disque a refusé de supprimer le modèle.
    #[error(
        "la suppression du modèle « {} » a échoué ({reason}) : vérifiez les droits sur le dossier des modèles",
        model.label()
    )]
    RemovalFailed {
        /// Le modèle.
        model: MeaningModel,
        /// La cause, lisible.
        reason: String,
    },
    /// Le calcul d'un vecteur de sens, ou le chargement du modèle, a échoué.
    #[error(
        "le calcul du sens a échoué ({0}) : supprimez le modèle dans les réglages puis téléchargez-le de nouveau"
    )]
    ComputationFailed(String),
}

/// Où en est un téléchargement : octets faits, sur octets à faire (tous les fichiers du modèle).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DownloadProgress {
    /// Les octets déjà reçus et gardés ou en cours de réception.
    pub done: u64,
    /// Les octets à recevoir en tout.
    pub total: u64,
}

/// Ce que l'appelant répond à chaque avancement : continuer, ou interrompre le téléchargement.
pub type ProgressListener<'a> = &'a mut dyn FnMut(DownloadProgress) -> ControlFlow<()>;

/// L'état d'un modèle sur le Mac.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelState {
    /// Tous ses fichiers sont là, de la bonne taille.
    Downloaded,
    /// Il manque au moins un fichier (jamais téléchargé, supprimé, ou téléchargement raté).
    NotDownloaded,
}

/// Un modèle de sens chargé en mémoire : il donne un vecteur de sens à un texte.
pub trait Embedder: Send + Sync + Debug {
    /// Le modèle chargé.
    fn model(&self) -> MeaningModel;

    /// Un vecteur de sens par segment, dans l'ordre reçu ; aucun segment, aucun vecteur.
    ///
    /// # Errors
    ///
    /// [`MeaningError::ComputationFailed`] si le calcul échoue.
    fn embed_segments(&self, segments: &[String]) -> Result<Vec<MeaningVector>, MeaningError>;

    /// Le vecteur de sens d'une question : il se compare à ceux des segments.
    ///
    /// # Errors
    ///
    /// [`MeaningError::ComputationFailed`] si le calcul échoue.
    fn embed_query(&self, query: &str) -> Result<MeaningVector, MeaningError>;
}

/// Ce qui touche aux modèles de sens rangés sur le Mac.
pub trait MeaningModels: Send + Sync + Debug {
    /// L'état de `model` : téléchargé en entier, ou non.
    fn state(&self, model: MeaningModel) -> ModelState;

    /// Télécharge `model` (un modèle déjà là n'est pas retéléchargé). `progress` reçoit
    /// l'avancement et répond `Break` pour interrompre.
    ///
    /// # Errors
    ///
    /// [`MeaningError::DownloadFailed`], [`MeaningError::FileRefused`] ou
    /// [`MeaningError::DownloadInterrupted`] ; dans tous ces cas, le modèle reste non téléchargé
    /// et rien de partiel n'est gardé.
    fn download(
        &self,
        model: MeaningModel,
        progress: ProgressListener<'_>,
    ) -> Result<(), MeaningError>;

    /// Supprime `model` du Mac (un modèle absent n'est pas une erreur).
    ///
    /// # Errors
    ///
    /// [`MeaningError::RemovalFailed`] si le disque refuse.
    fn remove(&self, model: MeaningModel) -> Result<(), MeaningError>;

    /// Charge `model` en mémoire.
    ///
    /// # Errors
    ///
    /// [`MeaningError::ModelMissing`] s'il n'est pas téléchargé ;
    /// [`MeaningError::ComputationFailed`] si ses fichiers sont inutilisables.
    fn open(&self, model: MeaningModel) -> Result<Arc<dyn Embedder>, MeaningError>;
}

/// Le temps écoulé depuis un point fixe, à la milliseconde, qui ne recule jamais : ce que le
/// minuteur du modèle gardé en mémoire lit (l'horloge `Clock` n'a que la minute et peut être
/// remise à l'heure par le Mac).
pub trait Uptime: Send + Sync + Debug {
    /// Le temps passé depuis le point fixe de ce minuteur.
    fn elapsed(&self) -> Duration;
}
