//! La recherche par le sens (fiche 0042) : calculer les vecteurs de sens, chercher par le sens
//! seul ou mêlé à la recherche par mots, trouver les notes proches, choisir et gérer les modèles.

mod compute;
#[cfg(test)]
mod fixture;
mod models;
mod related;
mod search;
mod search_mixed;

pub use compute::{BATCH_SIZE, ComputeListener, ComputeMeaning, ComputeOutcome, ComputeProgress};
pub use models::{
    ChooseModel, DownloadModel, MeaningOverview, ModelOverview, ReadMeaningStatus, RebuildMeaning,
    RemoveModel,
};
pub use related::RelatedNotes;
pub use search::{SEGMENTS_PER_NOTE, SearchByMeaning};
pub use search_mixed::{MeaningUse, MixedResults, SearchWithMeaning};
