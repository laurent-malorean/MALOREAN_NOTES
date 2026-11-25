//! Ports de la clé de branchement (fiche 0056) : où elle est gardée, et d'où vient son secret.
//! Aucun chemin, aucun octet ici : les adaptateurs savent où et comment.

use std::fmt::Debug;

use domain::connection_key::ConnectionKey;

use crate::StoreError;

/// La clé de branchement gardée d'un lancement à l'autre, hors de tout espace de travail. Il n'y
/// en a qu'une à la fois.
pub trait ConnectionKeys: Send + Sync + Debug {
    /// La clé gardée, s'il y en a une.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le fichier de la clé ne peut pas être lu ou est abîmé.
    fn load(&self) -> Result<Option<ConnectionKey>, StoreError>;

    /// Garde cette clé, à la place de la précédente, pour le seul compte de l'utilisateur.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si la clé ne peut pas être écrite.
    fn save(&self, key: &ConnectionKey) -> Result<(), StoreError>;

    /// Efface la clé gardée ; rien à faire s'il n'y en a pas.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le fichier de la clé ne peut pas être effacé.
    fn delete(&self) -> Result<(), StoreError>;
}

/// D'où vient le secret d'une clé de branchement : de l'aléa du système, que personne ne peut
/// deviner.
pub trait SecretMaker: Send + Sync + Debug {
    /// Un secret neuf, différent de tous les précédents.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le système ne donne pas d'aléa.
    fn secret(&self) -> Result<String, StoreError>;
}

/// La prise de branchement : où les IA extérieures joignent l'application. Elle n'existe que tant
/// qu'une clé de branchement existe ; la session l'ouvre et la ferme, l'adaptateur sait comment.
pub trait ConnectionSocket: Send + Sync + Debug {
    /// Ouvre la prise ; rien à faire si elle est déjà ouverte.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si la prise ne peut pas être ouverte.
    fn open(&self) -> Result<(), StoreError>;

    /// Ferme la prise : les IA branchées sont coupées tout de suite ; rien à faire si elle est
    /// déjà fermée.
    fn close(&self);
}
