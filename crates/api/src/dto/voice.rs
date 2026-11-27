//! La saisie vocale vue de l'interface (fiche 0103) : son état pour le micro et l'onglet des
//! réglages, et ses événements.

use application::use_cases::VoiceStatus;
use application::{VoiceAccess, VoiceLanguage};
use domain::voice_input::{SILENCE_MESSAGE, VoiceEvent};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Où en est l'autorisation du micro.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum VoiceAccessItem {
    /// Accordée.
    Allowed,
    /// Refusée : le micro est grisé, un clic ouvre le message qui renvoie aux réglages de macOS.
    Denied,
    /// Pas encore demandée : le premier clic sur le micro la demande.
    Undecided,
}

impl From<VoiceAccess> for VoiceAccessItem {
    fn from(access: VoiceAccess) -> Self {
        match access {
            VoiceAccess::Allowed => Self::Allowed,
            VoiceAccess::Denied => Self::Denied,
            VoiceAccess::Undecided => Self::Undecided,
        }
    }
}

/// Une langue que macOS sait transcrire.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct VoiceLanguageItem {
    /// Son identifiant (`fr-FR`).
    pub id: String,
    /// Son nom, dans la langue du Mac (« français (France) »).
    pub name: String,
    /// Son modèle de langue est-il déjà sur le Mac ? Sinon, le premier usage le télécharge.
    pub ready: bool,
}

impl From<VoiceLanguage> for VoiceLanguageItem {
    fn from(language: VoiceLanguage) -> Self {
        Self {
            id: language.id,
            name: language.name,
            ready: language.ready,
        }
    }
}

/// L'état de la saisie vocale : si elle peut servir sur ce Mac, sa langue, ses langues.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum VoiceInputStatusItem {
    /// Le moteur répond.
    #[serde(rename_all = "camelCase")]
    Available {
        /// L'autorisation du micro.
        access: VoiceAccessItem,
        /// La langue utilisée : la langue choisie, sinon celle du Mac ; rien si aucune ne convient.
        language: Option<String>,
        /// Le nom de la langue utilisée.
        language_name: Option<String>,
        /// Aucune langue n'est choisie : c'est celle du Mac.
        using_mac_language: bool,
        /// Les langues que macOS sait transcrire.
        languages: Vec<VoiceLanguageItem>,
        /// Une saisie vocale est en cours (ou se termine).
        listening: bool,
    },
    /// Il ne peut pas servir : le micro est grisé, l'info-bulle dit `message`.
    Unavailable {
        /// Le code de la raison (`systemTooOld`, `engineMissing`).
        code: String,
        /// La raison, prête à afficher.
        message: String,
    },
}

impl From<VoiceStatus> for VoiceInputStatusItem {
    fn from(status: VoiceStatus) -> Self {
        match status.engine {
            Err(failure) => Self::Unavailable {
                code: failure.code().to_owned(),
                message: failure.to_string(),
            },
            Ok(catalog) => {
                let using_mac_language = status.chosen.is_none();
                let language = status.chosen.or(catalog.system);
                let language_name = language.as_ref().and_then(|id| {
                    catalog
                        .languages
                        .iter()
                        .find(|known| &known.id == id)
                        .map(|known| known.name.clone())
                });
                Self::Available {
                    access: catalog.access.into(),
                    language,
                    language_name,
                    using_mac_language,
                    languages: catalog.languages.into_iter().map(Into::into).collect(),
                    listening: status.listening,
                }
            }
        }
    }
}

/// Un événement de la saisie vocale, envoyé à l'interface (`voice-input-event`), dans l'ordre.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum VoiceEventItem {
    /// Le modèle de la langue se prépare : le micro tourne (« préparation »).
    Preparing,
    /// Le micro écoute.
    Listening,
    /// Le texte provisoire, en entier : il remplace le précédent ; vide, il s'efface.
    Provisional {
        /// Le texte.
        text: String,
    },
    /// Le texte fixé : il entre dans la note, le texte provisoire repart de zéro.
    Fixed {
        /// Le texte.
        text: String,
    },
    /// Le niveau sonore, de 0 à 1.
    Level {
        /// Le niveau.
        value: f32,
    },
    /// Trente secondes sans parole : la saisie vocale s'arrête.
    Silence {
        /// Le message bref à montrer.
        message: String,
    },
    /// La saisie vocale s'arrête pour cette raison ; la fin suit.
    Failed {
        /// Le code de la raison (`accessDenied`, `noMicrophone`, `stopped`, `languageDownload`...).
        reason: String,
        /// La raison, prête à afficher telle quelle.
        message: String,
    },
    /// Fin de la saisie vocale : plus aucun événement ne suit, le micro revient au repos.
    Ended,
}

impl From<&VoiceEvent> for VoiceEventItem {
    fn from(event: &VoiceEvent) -> Self {
        match event {
            VoiceEvent::Preparing => Self::Preparing,
            VoiceEvent::Listening => Self::Listening,
            VoiceEvent::Provisional(text) => Self::Provisional { text: text.clone() },
            VoiceEvent::Fixed(text) => Self::Fixed { text: text.clone() },
            VoiceEvent::Level(value) => Self::Level { value: *value },
            VoiceEvent::Silence => Self::Silence {
                message: SILENCE_MESSAGE.to_owned(),
            },
            VoiceEvent::Failed(failure) => Self::Failed {
                reason: failure.code().to_owned(),
                message: failure.to_string(),
            },
            VoiceEvent::Ended => Self::Ended,
        }
    }
}

#[cfg(test)]
mod tests {
    use application::VoiceCatalog;
    use domain::voice_input::VoiceFailure;

    use super::*;

    fn catalog(system: Option<&str>) -> VoiceCatalog {
        VoiceCatalog {
            system: system.map(str::to_owned),
            access: VoiceAccess::Undecided,
            languages: vec![
                VoiceLanguage {
                    id: "en-US".to_owned(),
                    name: "anglais (États-Unis)".to_owned(),
                    ready: false,
                },
                VoiceLanguage {
                    id: "fr-FR".to_owned(),
                    name: "français (France)".to_owned(),
                    ready: true,
                },
            ],
        }
    }

    fn status(system: Option<&str>, chosen: Option<&str>, listening: bool) -> VoiceInputStatusItem {
        VoiceStatus {
            engine: Ok(catalog(system)),
            chosen: chosen.map(str::to_owned),
            listening,
        }
        .into()
    }

    fn json(item: &VoiceInputStatusItem) -> serde_json::Value {
        serde_json::to_value(item).unwrap()
    }

    #[test]
    fn the_mac_language_is_used_without_a_choice() {
        assert_eq!(
            json(&status(Some("fr-FR"), None, false)),
            serde_json::json!({
                "kind": "available",
                "access": "undecided",
                "language": "fr-FR",
                "languageName": "français (France)",
                "usingMacLanguage": true,
                "languages": [
                    { "id": "en-US", "name": "anglais (États-Unis)", "ready": false },
                    { "id": "fr-FR", "name": "français (France)", "ready": true },
                ],
                "listening": false,
            })
        );
    }

    #[test]
    fn the_chosen_language_wins_over_the_mac_language() {
        let item = json(&status(Some("fr-FR"), Some("en-US"), true));
        assert_eq!(item["language"], "en-US");
        assert_eq!(item["languageName"], "anglais (États-Unis)");
        assert_eq!(item["usingMacLanguage"], false);
        assert_eq!(item["listening"], true);
    }

    #[test]
    fn a_mac_without_a_language_has_none_to_show() {
        let item = json(&status(None, None, false));
        assert_eq!(item["language"], serde_json::Value::Null);
        assert_eq!(item["languageName"], serde_json::Value::Null);
    }

    #[test]
    fn a_chosen_language_the_mac_no_longer_lists_has_no_name() {
        let item = json(&status(Some("fr-FR"), Some("tlh"), false));
        assert_eq!(item["language"], "tlh");
        assert_eq!(item["languageName"], serde_json::Value::Null);
    }

    #[test]
    fn each_access_is_carried_over() {
        for (access, item) in [
            (VoiceAccess::Allowed, VoiceAccessItem::Allowed),
            (VoiceAccess::Denied, VoiceAccessItem::Denied),
            (VoiceAccess::Undecided, VoiceAccessItem::Undecided),
        ] {
            assert_eq!(VoiceAccessItem::from(access), item);
        }
    }

    #[test]
    fn an_engine_that_cannot_serve_says_why() {
        let item: VoiceInputStatusItem = VoiceStatus {
            engine: Err(VoiceFailure::SystemTooOld),
            chosen: None,
            listening: false,
        }
        .into();
        assert_eq!(
            item,
            VoiceInputStatusItem::Unavailable {
                code: "systemTooOld".to_owned(),
                message: "Saisie vocale : macOS 26 minimum".to_owned()
            }
        );
    }

    #[test]
    fn each_event_is_carried_over_with_its_message_ready() {
        let text = |value: &str| value.to_owned();
        let cases = [
            (VoiceEvent::Preparing, VoiceEventItem::Preparing),
            (VoiceEvent::Listening, VoiceEventItem::Listening),
            (
                VoiceEvent::Provisional(text("bon")),
                VoiceEventItem::Provisional { text: text("bon") },
            ),
            (
                VoiceEvent::Fixed(text("Bon.")),
                VoiceEventItem::Fixed { text: text("Bon.") },
            ),
            (VoiceEvent::Level(0.5), VoiceEventItem::Level { value: 0.5 }),
            (
                VoiceEvent::Silence,
                VoiceEventItem::Silence {
                    message: text("Saisie vocale arrêtée : silence"),
                },
            ),
            (
                VoiceEvent::Failed(VoiceFailure::NoMicrophone),
                VoiceEventItem::Failed {
                    reason: text("noMicrophone"),
                    message: text("Aucun micro disponible."),
                },
            ),
            (VoiceEvent::Ended, VoiceEventItem::Ended),
        ];
        for (event, item) in cases {
            assert_eq!(VoiceEventItem::from(&event), item);
        }
    }

    #[test]
    fn the_events_are_written_with_their_kind() {
        let json = serde_json::to_value(VoiceEventItem::Provisional {
            text: "bon".to_owned(),
        });
        assert_eq!(
            json.unwrap(),
            serde_json::json!({"kind": "provisional", "text": "bon"})
        );
    }
}
