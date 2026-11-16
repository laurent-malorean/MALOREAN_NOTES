//! Ports : ce dont les cas d'usage ont besoin, sans savoir comment c'est fait.

use std::fmt::Debug;
use std::sync::Arc;

use domain::{FileName, Folder, Modified, NotePath};

/// Une note telle qu'elle est gardée : chemin, contenu Markdown, date de modification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredNote {
    /// Le dossier et le nom de fichier de la note.
    pub path: NotePath,
    /// Le contenu Markdown complet, en-tête compris.
    pub content: String,
    /// La date de dernière modification.
    pub modified: Modified,
}

/// Le contenu de la corbeille. Chaque élément y garde son chemin d'origine, avec un suffixe
/// si un élément supprimé avant lui portait déjà le même.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct TrashContents {
    /// Tous les dossiers de la corbeille, à toute profondeur : ceux qu'on a supprimés et ceux
    /// qui contiennent une note supprimée.
    pub folders: Vec<Folder>,
    /// Toutes les notes de la corbeille, à toute profondeur.
    pub notes: Vec<StoredNote>,
}

/// Échec du stockage.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreError {
    /// Aucune note ne porte ce nom.
    NotFound(NotePath),
    /// Une note (ou son dossier de pièces jointes) porte déjà ce nom.
    AlreadyExists(NotePath),
    /// Le fichier n'est pas du texte UTF-8 : on ne l'ouvre pas, pour ne pas l'abîmer.
    Unreadable(NotePath),
    /// Aucun dossier n'existe à ce chemin.
    FolderNotFound(Folder),
    /// Un dossier existe déjà à ce chemin.
    FolderAlreadyExists(Folder),
    /// Le stockage ne répond pas (dossier absent, droits, disque plein) ; la cause est lisible.
    Unavailable(String),
}

/// Les notes d'une bibliothèque, rangées dans ses dossiers.
pub trait NoteStore: Send + Sync + Debug {
    /// Les notes du dossier, sans celles de ses sous-dossiers. Une note qui n'est pas
    /// du texte UTF-8 y figure quand même, avec ce qui en est lisible.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le dossier ne peut pas être lu.
    fn list(&self, folder: &Folder) -> Result<Vec<StoredNote>, StoreError>;

    /// La note à ce chemin.
    ///
    /// # Errors
    ///
    /// [`StoreError::NotFound`] si elle n'existe pas, [`StoreError::Unreadable`] si elle
    /// n'est pas du texte UTF-8, [`StoreError::Unavailable`] si le stockage ne répond pas.
    fn read(&self, note: &NotePath) -> Result<StoredNote, StoreError>;

    /// Écrit la note entière, en la créant si besoin ; jamais de fichier à moitié écrit.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'écriture échoue ; l'ancienne version reste intacte.
    fn write(&self, note: &NotePath, content: &str) -> Result<(), StoreError>;

    /// Réécrit une note existante sans changer sa date de modification : pour un changement
    /// qui ne touche pas au texte (épingler), la note garde sa place parmi les plus récentes.
    ///
    /// # Errors
    ///
    /// [`StoreError::NotFound`] si la note n'existe pas, [`StoreError::Unavailable`] si
    /// l'écriture échoue ; l'ancienne version reste intacte.
    fn write_keeping_date(&self, note: &NotePath, content: &str) -> Result<(), StoreError>;

    /// Renomme la note et son dossier de pièces jointes, dans le même dossier.
    ///
    /// # Errors
    ///
    /// [`StoreError::AlreadyExists`] si le nouveau nom (ou son dossier de pièces jointes)
    /// est pris, [`StoreError::NotFound`] si la note n'existe pas,
    /// [`StoreError::Unavailable`] si le stockage ne répond pas.
    fn rename(&self, from: &NotePath, to: &FileName) -> Result<(), StoreError> {
        self.move_note(from, &from.renamed(to.clone()))
    }

    /// Déplace la note et son dossier de pièces jointes au chemin `to`, dans le même dossier
    /// ou dans un autre ; ses pièces jointes restent à côté d'elle.
    ///
    /// # Errors
    ///
    /// [`StoreError::AlreadyExists`] si `to` (ou son dossier de pièces jointes) est pris,
    /// [`StoreError::NotFound`] si la note n'existe pas, [`StoreError::FolderNotFound`] si le
    /// dossier de `to` n'existe pas, [`StoreError::Unavailable`] si le stockage ne répond pas.
    fn move_note(&self, from: &NotePath, to: &NotePath) -> Result<(), StoreError>;

    /// Les noms des notes du dossier, sans lire leur contenu.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le dossier ne peut pas être lu.
    fn names(&self, folder: &Folder) -> Result<Vec<FileName>, StoreError>;

    /// Tous les dossiers de la bibliothèque, à toute profondeur, sans la racine. Ni les
    /// dossiers cachés ni les dossiers de pièces jointes n'en font partie.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si la bibliothèque ne peut pas être lue.
    fn folders(&self) -> Result<Vec<Folder>, StoreError>;

    /// Crée le dossier, vide, dans son dossier parent.
    ///
    /// # Errors
    ///
    /// [`StoreError::FolderAlreadyExists`] s'il existe déjà, [`StoreError::FolderNotFound`]
    /// si son parent n'existe pas, [`StoreError::Unavailable`] si le stockage ne répond pas.
    fn create_folder(&self, folder: &Folder) -> Result<(), StoreError>;

    /// Déplace (ou renomme) le dossier `from` en `to`, avec tout ce qu'il contient.
    ///
    /// # Errors
    ///
    /// [`StoreError::FolderNotFound`] si `from` ou le parent de `to` n'existe pas,
    /// [`StoreError::FolderAlreadyExists`] si `to` est pris, [`StoreError::Unavailable`]
    /// si le stockage ne répond pas.
    fn move_folder(&self, from: &Folder, to: &Folder) -> Result<(), StoreError>;

    /// Ce que contient la corbeille ; rien si elle n'a jamais servi.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si la corbeille ne peut pas être lue.
    fn trash(&self) -> Result<TrashContents, StoreError>;

    /// Place la note et son dossier de pièces jointes dans la corbeille, au chemin `at`.
    ///
    /// # Errors
    ///
    /// [`StoreError::NotFound`] si la note n'existe pas, [`StoreError::AlreadyExists`] si
    /// `at` est pris dans la corbeille, [`StoreError::Unavailable`] si le stockage ne répond pas.
    fn trash_note(&self, note: &NotePath, at: &NotePath) -> Result<(), StoreError>;

    /// Place le dossier, avec tout ce qu'il contient, dans la corbeille, au chemin `at`.
    ///
    /// # Errors
    ///
    /// [`StoreError::FolderNotFound`] si le dossier n'existe pas,
    /// [`StoreError::FolderAlreadyExists`] si `at` est pris dans la corbeille,
    /// [`StoreError::Unavailable`] si le stockage ne répond pas.
    fn trash_folder(&self, folder: &Folder, at: &Folder) -> Result<(), StoreError>;

    /// Remet la note `at` de la corbeille (et ses pièces jointes) au chemin `to` de la
    /// bibliothèque, en recréant les dossiers qui manquent. Les dossiers de la corbeille
    /// qu'elle laisse vides en disparaissent.
    ///
    /// # Errors
    ///
    /// [`StoreError::NotFound`] si la corbeille n'a pas cette note, [`StoreError::AlreadyExists`]
    /// si `to` est pris, [`StoreError::Unavailable`] si le stockage ne répond pas.
    fn restore_note(&self, at: &NotePath, to: &NotePath) -> Result<(), StoreError>;

    /// Remet le dossier `at` de la corbeille, avec tout ce qu'il contient, au chemin `to` de la
    /// bibliothèque, en recréant les dossiers qui manquent. Si `to` existe déjà, le dossier de
    /// la corbeille doit être vide : il en est alors simplement retiré.
    ///
    /// # Errors
    ///
    /// [`StoreError::FolderNotFound`] si la corbeille n'a pas ce dossier,
    /// [`StoreError::FolderAlreadyExists`] si `to` existe et que le dossier de la corbeille
    /// n'est pas vide, [`StoreError::Unavailable`] si le stockage ne répond pas.
    fn restore_folder(&self, at: &Folder, to: &Folder) -> Result<(), StoreError>;

    /// Supprime définitivement tout ce que contient la corbeille.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si la suppression échoue.
    fn empty_trash(&self) -> Result<(), StoreError>;
}

/// Emplacement d'une bibliothèque, tel que l'utilisateur l'a choisi.
///
/// L'application ne l'interprète pas : seul l'adaptateur de stockage sait le traduire.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LibraryLocation(String);

/// Emplacement refusé parce qu'il est vide.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("l'emplacement de la bibliothèque est vide")]
pub struct EmptyLocation;

impl LibraryLocation {
    /// L'emplacement choisi par l'utilisateur.
    ///
    /// # Errors
    ///
    /// [`EmptyLocation`] si l'emplacement est vide.
    pub fn new(location: impl Into<String>) -> Result<Self, EmptyLocation> {
        let location = location.into();
        if location.is_empty() {
            Err(EmptyLocation)
        } else {
            Ok(Self(location))
        }
    }

    /// L'emplacement, tel qu'il a été choisi.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Ouvre la bibliothèque qui se trouve à un emplacement.
pub trait LibraryOpener: Send + Sync + Debug {
    /// Les notes de la bibliothèque située à `location`.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si rien d'utilisable ne se trouve à cet emplacement.
    fn open(&self, location: &LibraryLocation) -> Result<Arc<dyn NoteStore>, StoreError>;
}

/// Préférences gardées d'un lancement à l'autre.
pub trait Preferences: Send + Sync + Debug {
    /// La dernière bibliothèque ouverte, s'il y en a une.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si les préférences ne peuvent pas être lues.
    fn last_library(&self) -> Result<Option<LibraryLocation>, StoreError>;

    /// Se souvenir de cette bibliothèque pour le prochain lancement.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si les préférences ne peuvent pas être écrites.
    fn remember_library(&self, location: &LibraryLocation) -> Result<(), StoreError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_location_is_given_back_as_chosen() {
        let location = LibraryLocation::new("/Users/moi/Notes").unwrap();
        assert_eq!(location.as_str(), "/Users/moi/Notes");
    }

    #[test]
    fn an_empty_location_is_refused() {
        assert_eq!(LibraryLocation::new(""), Err(EmptyLocation));
    }
}
