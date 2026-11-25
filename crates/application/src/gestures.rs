//! Port des gestes en attente (fiche 0058) : un geste qui change plusieurs fichiers du CRM est
//! gardé avant d'être appliqué, puis oublié une fois appliqué en entier ; interrompu, il reste là
//! et se termine à l'ouverture suivante de l'espace de travail, ou avant le geste suivant.

use std::fmt::Debug;
use std::sync::Arc;

use domain::NotePath;

use crate::{StoreError, WorkspaceLocation};

/// Un pas d'un geste.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GestureStep {
    /// Réécrire la note, qui existe, avec ce texte entier.
    Rewrite {
        /// La note à réécrire.
        note: NotePath,
        /// Son nouveau texte.
        content: String,
    },
    /// Mettre la note, avec ses pièces jointes, à la corbeille.
    Trash {
        /// La note à mettre à la corbeille.
        note: NotePath,
    },
}

/// Ce qu'un seul geste de l'utilisateur change : des pas, appliqués dans l'ordre. Une note qui
/// n'existe plus au moment d'un pas le laisse sans effet : le geste ne la recrée jamais.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Gesture {
    steps: Vec<GestureStep>,
}

impl Gesture {
    /// Le geste fait de ces pas.
    #[must_use]
    pub fn new(steps: Vec<GestureStep>) -> Self {
        Self { steps }
    }

    /// Les pas, dans l'ordre où ils s'appliquent.
    #[must_use]
    pub fn steps(&self) -> &[GestureStep] {
        &self.steps
    }
}

/// Le numéro sous lequel un geste est gardé : les numéros croissent avec l'ordre des gestes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GestureId(pub u64);

/// Les gestes en attente d'un espace de travail.
pub trait PendingGestures: Send + Sync + Debug {
    /// Garde ce geste avant de l'appliquer ; rend son numéro, plus grand que celui de tout geste
    /// gardé avant lui.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le geste ne peut pas être gardé : il ne doit alors pas être
    /// appliqué.
    fn begin(&self, gesture: &Gesture) -> Result<GestureId, StoreError>;

    /// Oublie ce geste, appliqué en entier ; un numéro inconnu est ignoré.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le geste ne peut pas être oublié.
    fn end(&self, id: GestureId) -> Result<(), StoreError>;

    /// Les gestes gardés et pas oubliés, le plus ancien d'abord.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si les gestes ne peuvent pas être lus.
    fn interrupted(&self) -> Result<Vec<(GestureId, Gesture)>, StoreError>;
}

/// Ouvre les gestes en attente d'un espace de travail.
pub trait PendingGesturesOpener: Send + Sync + Debug {
    /// Les gestes en attente de l'espace de travail situé à `location` ; aucun s'il n'en avait pas.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] s'ils ne peuvent pas être ouverts.
    fn open(&self, location: &WorkspaceLocation) -> Result<Arc<dyn PendingGestures>, StoreError>;
}
