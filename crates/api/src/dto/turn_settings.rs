//! Réglages d'un tour de Claude Code reçus de la page : le modèle et le niveau d'effort choisis
//! sur leur pastille (fiche 0032).

use domain::claude::{ClaudeModel, Effort, TurnSettings};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Le modèle qui répond, du plus léger au plus capable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ClaudeModelItem {
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
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum EffortItem {
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

/// Les réglages d'un tour ; rien de choisi laisse Claude Code faire son propre choix.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TurnSettingsItem {
    /// Le modèle choisi, s'il y en a un.
    pub model: Option<ClaudeModelItem>,
    /// Le niveau d'effort choisi, s'il y en a un.
    pub effort: Option<EffortItem>,
}

impl From<ClaudeModelItem> for ClaudeModel {
    fn from(model: ClaudeModelItem) -> Self {
        match model {
            ClaudeModelItem::Haiku => Self::Haiku,
            ClaudeModelItem::Sonnet => Self::Sonnet,
            ClaudeModelItem::Opus => Self::Opus,
            ClaudeModelItem::Fable => Self::Fable,
        }
    }
}

impl From<EffortItem> for Effort {
    fn from(effort: EffortItem) -> Self {
        match effort {
            EffortItem::Low => Self::Low,
            EffortItem::Medium => Self::Medium,
            EffortItem::High => Self::High,
            EffortItem::ExtraHigh => Self::ExtraHigh,
            EffortItem::Max => Self::Max,
        }
    }
}

impl From<TurnSettingsItem> for TurnSettings {
    fn from(settings: TurnSettingsItem) -> Self {
        Self {
            model: settings.model.map(Into::into),
            effort: settings.effort.map(Into::into),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn settings(json: serde_json::Value) -> TurnSettings {
        serde_json::from_value::<TurnSettingsItem>(json)
            .unwrap()
            .into()
    }

    #[test]
    fn each_model_is_read_under_the_name_used_by_the_page() {
        for (name, model) in [
            ("haiku", ClaudeModel::Haiku),
            ("sonnet", ClaudeModel::Sonnet),
            ("opus", ClaudeModel::Opus),
            ("fable", ClaudeModel::Fable),
        ] {
            let read = settings(json!({ "model": name, "effort": null }));
            assert_eq!(read.model, Some(model));
        }
    }

    #[test]
    fn each_effort_is_read_under_the_name_used_by_the_page() {
        for (name, effort) in [
            ("low", Effort::Low),
            ("medium", Effort::Medium),
            ("high", Effort::High),
            ("extraHigh", Effort::ExtraHigh),
            ("max", Effort::Max),
        ] {
            let read = settings(json!({ "model": null, "effort": name }));
            assert_eq!(read.effort, Some(effort));
        }
    }

    #[test]
    fn nothing_chosen_leaves_claude_code_its_own_choice() {
        let read = settings(json!({ "model": null, "effort": null }));
        assert_eq!(read, TurnSettings::default());
    }

    #[test]
    fn an_unknown_model_is_refused() {
        let read = serde_json::from_value::<TurnSettingsItem>(json!({ "model": "--help" }));
        assert!(read.is_err());
    }
}
