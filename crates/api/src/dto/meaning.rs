//! Données de la recherche par le sens échangées avec l'interface (fiches 0042 et 0046). Un modèle
//! de sens y est désigné par son nom (`e5-small`, `e5-large`).

use application::ModelState;
use application::use_cases::{MeaningOverview, MeaningUse, ModelOverview};
use domain::MeaningModel;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::SearchResultItem;

/// Un modèle de sens proposé, tel que l'écran des réglages le montre.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModelOverviewItem {
    /// Son nom, à rendre aux commandes : `e5-small`.
    pub model: String,
    /// Son nom lisible : « E5 petit ».
    pub label: String,
    /// Tous ses fichiers sont sur le Mac.
    pub downloaded: bool,
    /// Son téléchargement est en cours.
    pub downloading: bool,
    /// Son poids à télécharger, en octets.
    #[ts(type = "number")]
    pub size: u64,
}

impl ModelOverviewItem {
    pub(crate) fn of(overview: &ModelOverview, downloading: Option<MeaningModel>) -> Self {
        Self {
            model: overview.model.name().to_owned(),
            label: overview.model.label().to_owned(),
            downloaded: overview.state == ModelState::Downloaded,
            downloading: downloading == Some(overview.model),
            size: overview.size,
        }
    }
}

/// L'état de la recherche par le sens : le modèle choisi, chaque modèle, l'index de sens de
/// l'espace de travail ouvert pour le modèle choisi, et le calcul.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MeaningOverviewItem {
    /// Le nom du modèle choisi.
    pub chosen: String,
    /// Chaque modèle proposé.
    pub models: Vec<ModelOverviewItem>,
    /// Les segments gardés par l'index de sens ; 0 sans espace de travail ouvert.
    #[ts(type = "number")]
    pub segments: usize,
    /// Parmi eux, ceux qui ont leur vecteur de sens pour le modèle choisi.
    #[ts(type = "number")]
    pub with_vector: usize,
    /// Les notes qui ont au moins un segment.
    #[ts(type = "number")]
    pub notes: usize,
    /// Un calcul de vecteurs de sens est en cours.
    pub computing: bool,
}

impl MeaningOverviewItem {
    pub(crate) fn of(
        overview: &MeaningOverview,
        downloading: Option<MeaningModel>,
        computing: bool,
    ) -> Self {
        Self {
            chosen: overview.chosen.name().to_owned(),
            models: overview
                .models
                .iter()
                .map(|model| ModelOverviewItem::of(model, downloading))
                .collect(),
            segments: overview.segments,
            with_vector: overview.with_vector,
            notes: overview.notes,
            computing,
        }
    }
}

/// Où en est le calcul des vecteurs de sens en arrière-plan ; envoyé à l'interface par
/// l'événement `meaning-progress`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum MeaningProgressItem {
    /// Un lot de plus est calculé.
    Progress {
        /// Les segments qui ont leur vecteur.
        #[ts(type = "number")]
        done: usize,
        /// Les segments gardés, à calculer en tout.
        #[ts(type = "number")]
        total: usize,
        /// Le nom du modèle.
        model: String,
    },
    /// Tous les segments ont leur vecteur.
    Finished {
        /// Le nom du modèle.
        model: String,
    },
    /// Le calcul s'est arrêté sur cette erreur, qui dit quoi faire.
    Failed {
        /// Le message, prêt à afficher.
        message: String,
    },
}

/// Où en est le téléchargement d'un modèle de sens ; envoyé à l'interface par l'événement
/// `model-download`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum ModelDownloadItem {
    /// Des octets de plus sont reçus.
    Progress {
        /// Le nom du modèle.
        model: String,
        /// Les octets reçus.
        #[ts(type = "number")]
        done: u64,
        /// Les octets à recevoir en tout.
        #[ts(type = "number")]
        total: u64,
    },
    /// Le modèle est entier et vérifié sur le Mac.
    Finished {
        /// Le nom du modèle.
        model: String,
    },
    /// Le téléchargement s'est arrêté (échec, coupure ou annulation), sans rien garder.
    Failed {
        /// Le nom du modèle.
        model: String,
        /// Le message, prêt à afficher.
        message: String,
    },
}

/// Pourquoi, ou non, le sens a servi à une recherche.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum MeaningUseItem {
    /// Les résultats mêlent les mots et le sens.
    Used,
    /// Le modèle n'est pas téléchargé : les mots ont répondu seuls.
    ModelMissing {
        /// Le nom du modèle.
        model: String,
        /// Ce qui manque et ce qu'on peut faire, prêt à afficher.
        message: String,
    },
    /// Le sens des notes n'est pas encore calculé : les mots ont répondu seuls.
    NotComputed {
        /// Le nom du modèle.
        model: String,
        /// Ce qui manque et ce qu'on peut faire, prêt à afficher.
        message: String,
    },
    /// Le sens a échoué : les mots ont répondu seuls.
    Failed {
        /// Ce qui s'est passé et ce qu'on peut faire, prêt à afficher.
        message: String,
    },
}

impl From<&MeaningUse> for MeaningUseItem {
    fn from(meaning: &MeaningUse) -> Self {
        let message = meaning.reason().unwrap_or_default();
        match meaning {
            MeaningUse::Used => Self::Used,
            MeaningUse::ModelMissing(model) => Self::ModelMissing {
                model: model.name().to_owned(),
                message,
            },
            MeaningUse::NotComputed(model) => Self::NotComputed {
                model: model.name().to_owned(),
                message,
            },
            MeaningUse::Failed(_) => Self::Failed { message },
        }
    }
}

/// Le résultat d'une recherche par les mots et par le sens.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct MeaningSearchItem {
    /// Les notes trouvées, la mieux classée d'abord.
    pub results: Vec<SearchResultItem>,
    /// Ce qu'il est advenu du sens.
    pub meaning: MeaningUseItem,
}

#[cfg(test)]
mod tests {
    use application::use_cases::ModelOverview;
    use serde_json::json;

    use super::*;

    fn overview() -> MeaningOverview {
        MeaningOverview {
            chosen: MeaningModel::Large,
            models: vec![
                ModelOverview {
                    model: MeaningModel::Small,
                    state: ModelState::Downloaded,
                    size: 10,
                },
                ModelOverview {
                    model: MeaningModel::Large,
                    state: ModelState::NotDownloaded,
                    size: 20,
                },
            ],
            segments: 7,
            with_vector: 3,
            notes: 2,
        }
    }

    #[test]
    fn the_overview_names_each_model_and_says_which_is_downloading() {
        let item = MeaningOverviewItem::of(&overview(), Some(MeaningModel::Large), true);
        assert_eq!(
            serde_json::to_value(&item).unwrap(),
            json!({
                "chosen": "e5-large",
                "models": [
                    { "model": "e5-small", "label": "E5 petit", "downloaded": true,
                      "downloading": false, "size": 10 },
                    { "model": "e5-large", "label": "E5 grand", "downloaded": false,
                      "downloading": true, "size": 20 },
                ],
                "segments": 7, "withVector": 3, "notes": 2, "computing": true,
            })
        );
        let idle = MeaningOverviewItem::of(&overview(), None, false);
        assert!(!idle.computing);
        assert!(idle.models.iter().all(|model| !model.downloading));
    }

    #[test]
    fn progress_events_are_tagged_by_kind() {
        assert_eq!(
            serde_json::to_value(MeaningProgressItem::Progress {
                done: 1,
                total: 4,
                model: "e5-small".into()
            })
            .unwrap(),
            json!({ "kind": "progress", "done": 1, "total": 4, "model": "e5-small" })
        );
        assert_eq!(
            serde_json::to_value(MeaningProgressItem::Finished {
                model: "e5-small".into()
            })
            .unwrap(),
            json!({ "kind": "finished", "model": "e5-small" })
        );
        assert_eq!(
            serde_json::to_value(MeaningProgressItem::Failed {
                message: "raté".into()
            })
            .unwrap(),
            json!({ "kind": "failed", "message": "raté" })
        );
        assert_eq!(
            serde_json::to_value(ModelDownloadItem::Progress {
                model: "e5-small".into(),
                done: 5,
                total: 9
            })
            .unwrap(),
            json!({ "kind": "progress", "model": "e5-small", "done": 5, "total": 9 })
        );
        assert_eq!(
            serde_json::to_value(ModelDownloadItem::Finished {
                model: "e5-small".into()
            })
            .unwrap(),
            json!({ "kind": "finished", "model": "e5-small" })
        );
        assert_eq!(
            serde_json::to_value(ModelDownloadItem::Failed {
                model: "e5-small".into(),
                message: "raté".into()
            })
            .unwrap(),
            json!({ "kind": "failed", "model": "e5-small", "message": "raté" })
        );
    }

    #[test]
    fn the_reason_the_meaning_is_missing_is_typed_and_readable() {
        assert_eq!(
            MeaningUseItem::from(&MeaningUse::Used),
            MeaningUseItem::Used
        );
        let missing = MeaningUse::ModelMissing(MeaningModel::Small);
        assert_eq!(
            MeaningUseItem::from(&missing),
            MeaningUseItem::ModelMissing {
                model: "e5-small".into(),
                message: missing.reason().unwrap()
            }
        );
        let waiting = MeaningUse::NotComputed(MeaningModel::Large);
        assert_eq!(
            MeaningUseItem::from(&waiting),
            MeaningUseItem::NotComputed {
                model: "e5-large".into(),
                message: waiting.reason().unwrap()
            }
        );
        let failed = MeaningUse::Failed("disque plein".into());
        assert_eq!(
            MeaningUseItem::from(&failed),
            MeaningUseItem::Failed {
                message: failed.reason().unwrap()
            }
        );
        assert_eq!(
            serde_json::to_value(MeaningUseItem::Used).unwrap(),
            json!({ "kind": "used" })
        );
    }
}
