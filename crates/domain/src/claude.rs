//! Colonne Claude Code : ce que Claude Code annonce pendant un tour, dans les mots de
//! l'application (fiche 0032). Le flux JSON de Claude Code est traduit par l'adaptateur ; ici, que
//! des valeurs.

use std::time::Duration;

/// Identifiant refusé parce qu'il est vide.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct EmptyIdentifier;

/// L'identifiant d'une conversation, que Claude Code donne au début de chaque tour et qu'on lui
/// rend pour la continuer ; jamais vide.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ConversationId(String);

impl ConversationId {
    /// L'identifiant donné par Claude Code.
    ///
    /// # Errors
    ///
    /// [`EmptyIdentifier`] s'il est vide.
    pub fn new(id: impl Into<String>) -> Result<Self, EmptyIdentifier> {
        non_empty(id.into()).map(Self)
    }

    /// L'identifiant tel que Claude Code l'a donné.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// L'identifiant d'une action de Claude : il rattache son issue, et les messages et actions du
/// sous-agent qu'elle a lancé ; jamais vide.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ActionId(String);

impl ActionId {
    /// L'identifiant donné par Claude Code.
    ///
    /// # Errors
    ///
    /// [`EmptyIdentifier`] s'il est vide.
    pub fn new(id: impl Into<String>) -> Result<Self, EmptyIdentifier> {
        non_empty(id.into()).map(Self)
    }

    /// L'identifiant tel que Claude Code l'a donné.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

fn non_empty(id: String) -> Result<String, EmptyIdentifier> {
    if id.is_empty() {
        Err(EmptyIdentifier)
    } else {
        Ok(id)
    }
}

/// Ce que fait une action de Claude.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ActionKind {
    /// Lire un fichier.
    Read,
    /// Chercher des fichiers par leur nom ou dans leur texte.
    Search,
    /// Créer un fichier ou remplacer tout son texte.
    Write,
    /// Modifier une partie d'un fichier.
    Edit,
    /// Lancer un sous-agent.
    SubAgent,
    /// Un outil que l'application ne connaît pas encore, par son nom.
    Other(String),
}

/// Une action de Claude : un outil utilisé pendant un tour.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ClaudeAction {
    /// Son identifiant.
    pub id: ActionId,
    /// Ce qu'elle fait.
    pub kind: ActionKind,
    /// Ce qu'elle vise, tel que Claude l'a écrit : le fichier, le motif cherché, la description
    /// du sous-agent.
    pub target: Option<String>,
}

/// L'issue d'une action de Claude qui a été faite.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ActionOutcome {
    /// L'outil a fait ce qui était demandé.
    Succeeded,
    /// L'outil a échoué (fichier introuvable, texte à remplacer absent…).
    Failed,
}

/// Où en est un sous-agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AgentState {
    /// Il travaille encore.
    Running,
    /// Il a terminé.
    Done,
    /// Il s'est arrêté en erreur.
    Failed,
    /// Il a été interrompu avant d'avoir terminé.
    Stopped,
}

/// Comment s'est terminée la réponse de Claude.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TurnOutcome {
    /// Claude a répondu.
    Succeeded,
    /// Claude n'a pas pu répondre, pour cette raison.
    Failed(String),
}

/// Le bilan de la réponse de Claude.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TurnSummary {
    /// Réussie ou en erreur.
    pub outcome: TurnOutcome,
    /// Sa durée.
    pub duration: Duration,
    /// Les jetons consommés, lus et écrits.
    pub tokens: u64,
}

/// Le modèle qui répond, du plus léger au plus capable ; chacun désigne le dernier modèle de sa
/// famille.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ClaudeModel {
    /// Le plus léger et le plus rapide.
    Haiku,
    /// L'équilibre entre rapidité et capacité.
    Sonnet,
    /// Le plus capable des modèles courants.
    Opus,
    /// Le plus capable.
    Fable,
}

/// Combien Claude réfléchit et travaille avant de répondre, du plus bas au plus haut.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Effort {
    /// Le plus bas.
    Low,
    /// Moyen.
    Medium,
    /// Élevé.
    High,
    /// Très élevé.
    ExtraHigh,
    /// Le plus haut.
    Max,
}

/// Les réglages d'un tour : le modèle et le niveau d'effort ; sans l'un ou l'autre, Claude Code
/// garde son propre choix.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash)]
pub struct TurnSettings {
    /// Le modèle choisi, s'il y en a un.
    pub model: Option<ClaudeModel>,
    /// Le niveau d'effort choisi, s'il y en a un.
    pub effort: Option<Effort>,
}

/// Ce que Claude Code annonce pendant un tour. `agent` est l'action qui a lancé le sous-agent
/// auteur du message ou de l'action ; aucune pour Claude lui-même.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ClaudeEvent {
    /// Le tour commence dans cette conversation.
    ConversationStarted(ConversationId),
    /// Un message de Claude, en Markdown.
    Message {
        /// Le sous-agent qui l'écrit, par l'action qui l'a lancé.
        agent: Option<ActionId>,
        /// Son texte.
        text: String,
    },
    /// Une action lancée.
    ActionStarted {
        /// Le sous-agent qui la lance, par l'action qui l'a lancé.
        agent: Option<ActionId>,
        /// L'action.
        action: ClaudeAction,
    },
    /// L'issue d'une action.
    ActionFinished {
        /// L'action.
        id: ActionId,
        /// Son issue.
        outcome: ActionOutcome,
    },
    /// Une action refusée par les autorisations de Claude.
    ActionRefused {
        /// L'action.
        id: ActionId,
    },
    /// Un sous-agent a fini son travail.
    SubAgentFinished {
        /// L'action qui l'a lancé.
        id: ActionId,
        /// Son état à la fin.
        state: AgentState,
        /// Le temps qu'il a travaillé.
        duration: Duration,
        /// Les jetons qu'il a consommés.
        tokens: u64,
        /// Son nombre d'actions.
        actions: u32,
    },
    /// Le bilan de la réponse.
    Summary(TurnSummary),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_conversation_id_keeps_the_id_given_by_claude() {
        assert_eq!(ConversationId::new("aae7").unwrap().as_str(), "aae7");
    }

    #[test]
    fn an_empty_conversation_id_is_refused() {
        assert_eq!(ConversationId::new(""), Err(EmptyIdentifier));
    }

    #[test]
    fn an_action_id_keeps_the_id_given_by_claude() {
        assert_eq!(ActionId::new("toolu_01").unwrap().as_str(), "toolu_01");
    }

    #[test]
    fn an_empty_action_id_is_refused() {
        assert_eq!(ActionId::new(""), Err(EmptyIdentifier));
    }
}
