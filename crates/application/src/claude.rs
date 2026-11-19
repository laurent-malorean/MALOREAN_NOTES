//! Port de Claude Code : le programme qui répond aux messages de la colonne Claude Code en
//! travaillant sur les notes de l'espace de travail (fiche 0032).

use std::fmt::Debug;

use domain::claude::{ClaudeEvent, ConversationId, TurnSettings};

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
    /// Claude Code n'a pas pu se déconnecter.
    #[error(
        "la déconnexion n'a pas abouti : réessayez, ou tapez « claude auth logout » dans le Terminal"
    )]
    LogoutFailed,
    /// La connexion n'a pas été menée à son terme dans le navigateur.
    #[error(
        "la connexion n'a pas abouti : réessayez, ou tapez « claude auth login » dans le Terminal"
    )]
    LoginFailed,
}

/// Le compte Claude avec lequel Claude Code est connecté : adresse et organisation, si Claude Code
/// les donne. Montré dans la colonne, jamais écrit dans le journal : sa forme de débogage les tait.
#[derive(Clone, Default, PartialEq, Eq)]
pub struct ClaudeAccount {
    /// L'adresse e-mail du compte.
    pub email: Option<String>,
    /// Le nom de l'organisation du compte.
    pub organization: Option<String>,
}

impl Debug for ClaudeAccount {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("ClaudeAccount { .. }")
    }
}

/// Si Claude Code peut répondre, et avec quel compte, sinon pourquoi ; chaque message dit quoi
/// faire.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ClaudeStatus {
    /// Claude Code est installé et connecté à ce compte Claude.
    #[error("Claude Code est prêt, connecté à votre abonnement Claude")]
    Ready(ClaudeAccount),
    /// Claude Code n'est pas installé sur ce Mac.
    #[error(
        "Claude Code n'est pas installé sur ce Mac : installez-le, tapez « claude auth login » dans le Terminal, puis rouvrez la colonne Claude Code"
    )]
    Missing,
    /// Claude Code est installé, mais personne n'y est connecté.
    #[error(
        "Claude Code n'est pas connecté à votre abonnement Claude : cliquez sur « Se connecter », ou tapez « claude auth login » dans le Terminal puis rouvrez la colonne Claude Code"
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
    /// Si Claude Code peut répondre, et avec quel compte, sinon pourquoi ; le modèle n'est pas
    /// appelé.
    fn status(&self) -> ClaudeStatus;

    /// Déconnecte Claude Code de son compte, pour tout le Mac (Terminal et VS Code compris).
    ///
    /// # Errors
    ///
    /// [`ClaudeError::Missing`] si Claude Code ne peut pas être lancé, [`ClaudeError::Busy`] si un
    /// tour ou une connexion est en cours, [`ClaudeError::LogoutFailed`] s'il n'a pas pu.
    fn log_out(&self) -> Result<(), ClaudeError>;

    /// Connecte Claude Code à un compte Claude, pour tout le Mac : Claude Code ouvre le navigateur
    /// sur la page de connexion et attend qu'on y termine. `on_address` reçoit l'adresse de cette
    /// page dès que Claude Code la donne. Rend la main une fois la connexion terminée ; [`stop`]
    /// l'annule.
    ///
    /// [`stop`]: ClaudeCode::stop
    ///
    /// # Errors
    ///
    /// [`ClaudeError::Missing`] si Claude Code ne peut pas être lancé, [`ClaudeError::Busy`] si un
    /// tour ou une connexion est en cours, [`ClaudeError::Stopped`] si elle a été annulée,
    /// [`ClaudeError::LoginFailed`] si elle n'a pas abouti.
    fn log_in(&self, on_address: &mut dyn FnMut(&str)) -> Result<(), ClaudeError>;

    /// Joue un tour : envoie `message` à Claude dans l'espace de travail `workspace`, en
    /// continuant la conversation `conversation` s'il y en a une, avec le modèle et le niveau
    /// d'effort de `settings`, et donne à `on_event` chaque événement de Claude dès qu'il arrive.
    /// Rend la main à la fin du tour.
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
        settings: TurnSettings,
        message: &str,
        on_event: &mut dyn FnMut(ClaudeEvent),
    ) -> Result<(), ClaudeError>;

    /// Arrête le tour en cours, s'il y en a un (ce que Claude a déjà écrit reste écrit), ou
    /// annule la connexion en cours.
    fn stop(&self);
}
