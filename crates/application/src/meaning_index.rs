//! Ports de l'index de sens (fiche 0042) : où se rangent les segments des notes et leurs
//! vecteurs de sens, un index par espace de travail. L'écriture (ranger, effacer, ajouter les
//! vecteurs calculés) et la lecture (les plus proches, les notes proches, l'état) sont deux
//! ports : un cas d'usage ne prend que celui dont il a besoin.

use std::fmt::Debug;

use domain::segments::Segment;
use domain::{MeaningModel, MeaningVector, NotePath};

use crate::StoreError;

/// Ce qui peut échouer dans l'index de sens.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum MeaningIndexError {
    /// L'index ne répond pas (disque, base abîmée) ; la cause est lisible.
    #[error("l'index de sens est indisponible ({0}) : reconstruisez-le dans les réglages")]
    Unavailable(String),
    /// Un vecteur n'a pas les dimensions du modèle : il ne vient pas de ce modèle.
    #[error(
        "un vecteur de {found} dimensions ne vient pas du modèle « {} » ({expected} dimensions)",
        model.label()
    )]
    WrongDimensions {
        /// Le modèle.
        model: MeaningModel,
        /// Les dimensions de ses vecteurs.
        expected: usize,
        /// Les dimensions du vecteur reçu.
        found: usize,
    },
}

impl From<StoreError> for MeaningIndexError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::Unavailable(reason) => Self::Unavailable(reason),
            other => Self::Unavailable(format!("{other:?}")),
        }
    }
}

/// Refuse un vecteur qui n'a pas les dimensions de `model`.
///
/// # Errors
///
/// [`MeaningIndexError::WrongDimensions`].
pub fn check_dimensions(
    model: MeaningModel,
    vector: &MeaningVector,
) -> Result<(), MeaningIndexError> {
    let found = vector.values().len();
    if found == model.dimensions() {
        Ok(())
    } else {
        Err(MeaningIndexError::WrongDimensions {
            model,
            expected: model.dimensions(),
            found,
        })
    }
}

/// L'identifiant d'un segment gardé : il tient tant que le segment est gardé, et change si
/// le segment disparaît puis revient.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SegmentId(u64);

impl SegmentId {
    /// L'identifiant de valeur `value`.
    #[must_use]
    pub fn new(value: u64) -> Self {
        Self(value)
    }

    /// Sa valeur.
    #[must_use]
    pub fn value(self) -> u64 {
        self.0
    }
}

/// Un segment gardé qui attend son vecteur : de quoi le calculer (titre complet et texte) et de
/// quoi le ranger ensuite (l'identifiant).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingSegment {
    /// L'identifiant à rendre avec le vecteur.
    pub id: SegmentId,
    /// Le segment : titre complet et texte.
    pub segment: Segment,
}

/// Un segment proche d'une question, avec sa note et sa ressemblance.
#[derive(Debug, Clone, PartialEq)]
pub struct FoundSegment {
    /// La note du segment.
    pub note: NotePath,
    /// Le segment : titre complet et texte.
    pub segment: Segment,
    /// Le produit scalaire avec la question, de -1 à 1.
    pub score: f32,
}

/// Une note proche d'une autre, avec la ressemblance de son meilleur segment.
#[derive(Debug, Clone, PartialEq)]
pub struct RelatedNote {
    /// La note proche.
    pub note: NotePath,
    /// Le meilleur produit scalaire entre un de ses segments et un de la note de départ.
    pub score: f32,
}

/// Où en est l'index de sens pour un modèle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MeaningStatus {
    /// Les segments gardés.
    pub segments: usize,
    /// Parmi eux, ceux qui ont leur vecteur pour ce modèle.
    pub with_vector: usize,
    /// Les notes qui ont au moins un segment gardé.
    pub notes: usize,
}

/// L'écriture dans l'index de sens d'un espace de travail.
pub trait MeaningIndex: Send + Sync + Debug {
    /// Range les segments de `note` à la place des anciens. Un segment dont la clé n'a pas changé
    /// garde son identifiant et ses vecteurs (de tous les modèles) ; un segment disparu perd les
    /// siens. Rend le nombre de segments nouveaux ou changés.
    ///
    /// # Errors
    ///
    /// [`MeaningIndexError::Unavailable`] ; rien n'est alors changé.
    fn replace_segments(
        &self,
        note: &NotePath,
        segments: &[Segment],
    ) -> Result<usize, MeaningIndexError>;

    /// Efface les segments et les vecteurs de `note` ; une note inconnue est ignorée.
    ///
    /// # Errors
    ///
    /// [`MeaningIndexError::Unavailable`].
    fn remove_note(&self, note: &NotePath) -> Result<(), MeaningIndexError>;

    /// Efface tout : segments et vecteurs, de tous les modèles.
    ///
    /// # Errors
    ///
    /// [`MeaningIndexError::Unavailable`].
    fn clear(&self) -> Result<(), MeaningIndexError>;

    /// Efface les vecteurs de `model`, ceux des autres modèles et les segments restent.
    ///
    /// # Errors
    ///
    /// [`MeaningIndexError::Unavailable`].
    fn clear_vectors(&self, model: MeaningModel) -> Result<(), MeaningIndexError>;

    /// Au plus `limit` segments qui n'ont pas encore de vecteur pour `model`, les plus anciennement
    /// gardés d'abord.
    ///
    /// # Errors
    ///
    /// [`MeaningIndexError::Unavailable`].
    fn without_vector(
        &self,
        model: MeaningModel,
        limit: usize,
    ) -> Result<Vec<PendingSegment>, MeaningIndexError>;

    /// Garde ces vecteurs pour `model` (un vecteur déjà gardé est remplacé). Un segment qui n'est
    /// plus gardé est ignoré : il a disparu pendant le calcul.
    ///
    /// # Errors
    ///
    /// [`MeaningIndexError::WrongDimensions`] si un vecteur n'a pas les dimensions de `model` :
    /// aucun n'est alors gardé. [`MeaningIndexError::Unavailable`].
    fn put_vectors(
        &self,
        model: MeaningModel,
        vectors: &[(SegmentId, MeaningVector)],
    ) -> Result<(), MeaningIndexError>;
}

/// La lecture de l'index de sens d'un espace de travail.
pub trait MeaningSearch: Send + Sync + Debug {
    /// Les `limit` segments les plus proches de `question`, du plus proche au plus lointain ; à
    /// score égal, par note (ordre alphabétique du chemin) puis par place dans la note. Seuls
    /// comptent les segments qui ont un vecteur de `model`.
    ///
    /// # Errors
    ///
    /// [`MeaningIndexError::WrongDimensions`] si `question` n'a pas les dimensions de `model` ;
    /// [`MeaningIndexError::Unavailable`].
    fn nearest(
        &self,
        model: MeaningModel,
        question: &MeaningVector,
        limit: usize,
    ) -> Result<Vec<FoundSegment>, MeaningIndexError>;

    /// Les `limit` autres notes les plus proches de `note` : le score d'une note est celui de son
    /// meilleur segment face au meilleur segment de `note` ; `note` elle-même est exclue. Du plus
    /// proche au plus lointain ; à score égal, par chemin. Seuls comptent les segments qui ont un
    /// vecteur de `model`.
    ///
    /// # Errors
    ///
    /// [`MeaningIndexError::Unavailable`].
    fn related_notes(
        &self,
        model: MeaningModel,
        note: &NotePath,
        limit: usize,
    ) -> Result<Vec<RelatedNote>, MeaningIndexError>;

    /// Où en est l'index pour `model`.
    ///
    /// # Errors
    ///
    /// [`MeaningIndexError::Unavailable`].
    fn status(&self, model: MeaningModel) -> Result<MeaningStatus, MeaningIndexError>;
}

/// L'index de sens d'un espace de travail, écrit et lu par le même objet : ce que l'application
/// ouvre avec l'espace de travail, et dont chaque cas d'usage prend le port qu'il lui faut.
pub trait MeaningStore: MeaningIndex + MeaningSearch {}

impl<T: MeaningIndex + MeaningSearch> MeaningStore for T {}

#[cfg(test)]
mod tests {
    use super::SegmentId;

    #[test]
    fn a_segment_identifier_gives_back_its_value() {
        assert_eq!(SegmentId::new(42).value(), 42);
    }
}
