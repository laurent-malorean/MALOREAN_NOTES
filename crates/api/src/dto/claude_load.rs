//! La charge annoncée par Claude Code, envoyée à la page : la limite d'utilisation de
//! l'abonnement, par période (fiche 0032).

use domain::claude::{LimitPeriod, UsageWindow};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Une période de la limite d'utilisation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum LimitPeriodItem {
    /// La période de 5 heures (« session » chez Anthropic).
    Session,
    /// La période de 7 jours.
    Week,
}

/// La part utilisée d'une période de la limite d'utilisation, et sa remise à zéro.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UsageWindowItem {
    /// La période.
    pub period: LimitPeriodItem,
    /// La part utilisée, en pourcentage arrondi.
    pub percent: u32,
    /// Sa remise à zéro, en secondes depuis le 1ᵉʳ janvier 1970 (UTC).
    #[ts(type = "number")]
    pub resets_at: u64,
}

impl From<UsageWindow> for UsageWindowItem {
    fn from(window: UsageWindow) -> Self {
        Self {
            period: match window.period {
                LimitPeriod::Session => LimitPeriodItem::Session,
                LimitPeriod::Week => LimitPeriodItem::Week,
            },
            percent: window.percent,
            resets_at: window.resets_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_period_keeps_its_share_and_its_reset_for_the_page() {
        let window = UsageWindowItem::from(UsageWindow {
            period: LimitPeriod::Session,
            percent: 16,
            resets_at: 1_795_141_800,
        });
        assert_eq!(
            serde_json::to_value(window).unwrap(),
            serde_json::json!({ "period": "session", "percent": 16, "resetsAt": 1_795_141_800_u64 })
        );
    }

    #[test]
    fn the_week_is_named_for_the_page() {
        let window = UsageWindowItem::from(UsageWindow {
            period: LimitPeriod::Week,
            percent: 43,
            resets_at: 1,
        });
        assert_eq!(window.period, LimitPeriodItem::Week);
    }
}
