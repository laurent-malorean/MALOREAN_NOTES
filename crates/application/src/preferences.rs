//! Port des préférences de l'application.

use std::fmt::Debug;

use domain::MeaningModel;

use crate::{StoreError, Workspaces};

/// Préférences gardées d'un lancement à l'autre.
pub trait Preferences: Send + Sync + Debug {
    /// Les espaces de travail connus, et celui ouvert en dernier ; aucun au premier lancement.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si les préférences ne peuvent pas être lues.
    fn workspaces(&self) -> Result<Workspaces, StoreError>;

    /// Garde cette liste d'espaces de travail, à la place de la précédente.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si les préférences ne peuvent pas être écrites.
    fn save_workspaces(&self, workspaces: &Workspaces) -> Result<(), StoreError>;

    /// Le modèle de sens choisi pour toute l'application ; [`MeaningModel::DEFAULT`] tant que
    /// rien n'est choisi, ou si le nom gardé n'est plus celui d'un modèle connu.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si les préférences ne peuvent pas être lues.
    fn meaning_model(&self) -> Result<MeaningModel, StoreError>;

    /// Garde ce modèle de sens comme choisi, sans toucher au reste des préférences.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si les préférences ne peuvent pas être écrites.
    fn save_meaning_model(&self, model: MeaningModel) -> Result<(), StoreError>;

    /// La langue de la saisie vocale choisie pour toute l'application (identifiant de langue,
    /// ex. `fr-FR`) ; rien tant qu'aucune n'est choisie : c'est alors la langue du Mac.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si les préférences ne peuvent pas être lues.
    fn voice_language(&self) -> Result<Option<String>, StoreError>;

    /// Garde cette langue pour la saisie vocale, ou, avec `None`, revient à la langue du Mac,
    /// sans toucher au reste des préférences.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si les préférences ne peuvent pas être écrites.
    fn save_voice_language(&self, language: Option<&str>) -> Result<(), StoreError>;
}
