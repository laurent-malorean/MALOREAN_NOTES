//! La colonne Claude Code vue depuis la page : si Claude Code peut répondre (fiche 0032).

use std::sync::Arc;

use application::{ClaudeCode, ClaudeStatus};

use super::Session;
use crate::ClaudeStatusItem;

impl Session {
    /// La même session, dont la colonne Claude Code passe par `claude`. Sans lui, Claude Code se
    /// dit introuvable.
    #[must_use]
    pub fn with_claude(mut self, claude: Arc<dyn ClaudeCode>) -> Self {
        self.claude = Some(claude);
        self
    }

    /// Si Claude Code peut répondre, sinon pourquoi et quoi faire, prêt à afficher. Le modèle
    /// n'est pas appelé.
    #[must_use]
    pub fn claude_status(&self) -> ClaudeStatusItem {
        match self
            .claude
            .as_ref()
            .map_or(ClaudeStatus::Missing, |claude| claude.status())
        {
            ClaudeStatus::Ready => ClaudeStatusItem::Ready,
            reason => ClaudeStatusItem::Unavailable {
                reason: reason.to_string(),
            },
        }
    }
}
