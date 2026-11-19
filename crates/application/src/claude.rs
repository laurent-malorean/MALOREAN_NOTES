//! Port de Claude Code : le programme qui répond aux messages de la colonne Claude Code en
//! travaillant sur les notes de l'espace de travail (fiche 0032).

use std::fmt::Debug;

use domain::claude::{ClaudeEvent, ConversationId};

use crate::WorkspaceLocation;

/// Ce qui peut empêcher un tour d'aller jusqu'au bout.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ClaudeError {
    /// Claude Code ne peut pas être lancé.
    #[error("Claude Code est introuvable : installez-le, puis rouvrez la colonne Claude Code")]
    Missing,
    /// Un tour est déjà en cours : on peut l'arrêter, pas en commencer un autre.
    #[error("Claude répond déjà : attendez la fin de sa réponse ou arrêtez-la")]
    Busy,
    /// Le tour a été arrêté avant la fin de la réponse.
    #[error("la réponse de Claude a été arrêtée")]
    Stopped,
    /// Claude Code s'est arrêté sans bilan ; la cause est lisible.
    #[error("Claude Code s'est arrêté sans répondre : {0}")]
    Failed(String),
}

/// Si Claude Code peut répondre, sinon pourquoi ; chaque message dit quoi faire. Seul « connecté
/// ou non » est connu : rien du compte de l'utilisateur.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, thiserror::Error)]
pub enum ClaudeStatus {
    /// Claude Code est installé et connecté à l'abonnement de l'utilisateur.
    #[error("Claude Code est prêt, connecté à votre abonnement Claude")]
    Ready,
    /// Claude Code n'est pas installé sur ce Mac.
    #[error(
        "Claude Code n'est pas installé sur ce Mac : installez-le, tapez « claude auth login » dans le Terminal, puis rouvrez la colonne Claude Code"
    )]
    Missing,
    /// Claude Code est installé, mais personne n'y est connecté.
    #[error(
        "Claude Code n'est pas connecté à votre abonnement Claude : tapez « claude auth login » dans le Terminal, puis rouvrez la colonne Claude Code"
    )]
    LoggedOut,
    /// Claude Code n'a pas pu dire s'il est connecté.
    #[error(
        "Claude Code n'a pas pu dire s'il est connecté : tapez « claude auth status » dans le Terminal pour voir ce qui ne va pas"
    )]
    Failed,
}

/// Claude Code, lancé pour chaque tour dans le dossier de l'espace de travail.
pub trait ClaudeCode: Send + Sync + Debug {
    /// Si Claude Code peut répondre, sinon pourquoi ; le modèle n'est pas appelé.
    fn status(&self) -> ClaudeStatus;

    /// Joue un tour : envoie `message` à Claude dans l'espace de travail `workspace`, en
    /// continuant la conversation `conversation` s'il y en a une, et donne à `on_event` chaque
    /// événement de Claude dès qu'il arrive. Rend la main à la fin du tour.
    ///
    /// # Errors
    ///
    /// [`ClaudeError::Missing`] si Claude Code ne peut pas être lancé, [`ClaudeError::Busy`] si un
    /// tour est déjà en cours, [`ClaudeError::Stopped`] si le tour a été arrêté,
    /// [`ClaudeError::Failed`] si Claude Code s'est arrêté sans bilan.
    fn send(
        &self,
        workspace: &WorkspaceLocation,
        conversation: Option<&ConversationId>,
        message: &str,
        on_event: &mut dyn FnMut(ClaudeEvent),
    ) -> Result<(), ClaudeError>;

    /// Arrête le tour en cours, s'il y en a un ; ce que Claude a déjà écrit reste écrit.
    fn stop(&self);
}
