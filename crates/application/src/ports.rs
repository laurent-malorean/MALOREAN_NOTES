//! Ports : ce dont les cas d'usage ont besoin, sans savoir comment c'est fait.

pub use crate::preferences::Preferences;
use std::fmt::Debug;
use std::sync::Arc;

use crate::{MeaningStore, MemoryMeaningIndex};
use domain::export::ExportDestination;
use domain::history::Version;
use domain::search::SearchQuery;
use domain::{
    AttachmentName, ContentType, FileName, Folder, Modified, Moment, NotePath, NoteSummary,
};

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

/// Le relevé du fichier d'une note : sa date de modification et sa taille, lues sans l'ouvrir.
/// Si l'un des deux a changé depuis que l'index l'a lue, la note est à relire.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteStamp {
    /// Le dossier et le nom de fichier de la note.
    pub path: NotePath,
    /// La date de dernière modification.
    pub modified: Modified,
    /// La taille du fichier, en octets.
    pub size: u64,
}

/// Une note telle que l'index la garde : son relevé, et son contenu (avec ce qui en est lisible
/// s'il n'est pas du texte UTF-8, comme dans la liste).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedNote {
    /// Le relevé du fichier, pris avant de lire le contenu.
    pub stamp: NoteStamp,
    /// Le contenu Markdown complet, en-tête compris.
    pub content: String,
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
    /// Le dossier de pièces jointes de la note a déjà un fichier de ce nom.
    AttachmentAlreadyExists(String),
    /// La note n'a pas de pièce jointe de ce nom.
    AttachmentNotFound(String),
    /// Un dossier existe déjà à ce chemin.
    FolderAlreadyExists(Folder),
    /// La note n'a pas (ou plus) cette version dans son historique.
    VersionNotFound(Version),
    /// Le stockage ne répond pas (dossier absent, droits, disque plein) ; la cause est lisible.
    Unavailable(String),
}

/// Les notes d'un espace de travail, rangées dans ses dossiers.
pub trait NoteStore: Send + Sync + Debug {
    /// Les notes du dossier, sans celles de ses sous-dossiers. Une note qui n'est pas
    /// du texte UTF-8 y figure quand même, avec ce qui en est lisible.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le dossier ne peut pas être lu.
    fn list(&self, folder: &Folder) -> Result<Vec<StoredNote>, StoreError>;

    /// Le relevé de chaque note du dossier, sans celles de ses sous-dossiers ni lire leur
    /// contenu.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le dossier ne peut pas être lu.
    fn stamps(&self, folder: &Folder) -> Result<Vec<NoteStamp>, StoreError>;

    /// La note à ce chemin, pour l'index : son relevé, pris avant de la lire, et son contenu, même
    /// s'il n'est pas du texte UTF-8 (ce qui en est lisible, comme dans la liste).
    ///
    /// # Errors
    ///
    /// [`StoreError::NotFound`] si elle n'existe pas, [`StoreError::Unavailable`] si le stockage
    /// ne répond pas.
    fn read_indexed(&self, note: &NotePath) -> Result<IndexedNote, StoreError>;

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

    /// Tous les dossiers de l'espace de travail, à toute profondeur, sans la racine. Ni les
    /// dossiers cachés ni les dossiers de pièces jointes n'en font partie.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'espace de travail ne peut pas être lue.
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

    /// Remet la note `at` de la corbeille (et ses pièces jointes) au chemin `to` de
    /// l'espace de travail, en recréant les dossiers qui manquent. Les dossiers de la corbeille
    /// qu'elle laisse vides en disparaissent.
    ///
    /// # Errors
    ///
    /// [`StoreError::NotFound`] si la corbeille n'a pas cette note, [`StoreError::AlreadyExists`]
    /// si `to` est pris, [`StoreError::Unavailable`] si le stockage ne répond pas.
    fn restore_note(&self, at: &NotePath, to: &NotePath) -> Result<(), StoreError>;

    /// Remet le dossier `at` de la corbeille, avec tout ce qu'il contient, au chemin `to` de
    /// l'espace de travail, en recréant les dossiers qui manquent. Si `to` existe déjà, le dossier de
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

    /// Les pièces jointes de la note (images et PDF de son dossier de pièces jointes) ; aucune
    /// si elle n'a pas encore de dossier de pièces jointes.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le dossier de pièces jointes ne peut pas être lu.
    fn attachment_names(&self, note: &NotePath) -> Result<Vec<AttachmentName>, StoreError>;

    /// Le contenu d'une pièce jointe de la note.
    ///
    /// # Errors
    ///
    /// [`StoreError::AttachmentNotFound`] si la note n'a pas cette pièce jointe,
    /// [`StoreError::Unavailable`] si elle ne peut pas être lue.
    fn read_attachment(
        &self,
        note: &NotePath,
        name: &AttachmentName,
    ) -> Result<Vec<u8>, StoreError>;

    /// Le contenu d'un fichier de l'espace de travail qui n'est pas une note (une image ou un
    /// PDF rangé dans un dossier), pour en faire la pièce jointe d'une note.
    ///
    /// # Errors
    ///
    /// [`StoreError::AttachmentNotFound`] si le fichier n'existe pas, ou si un lien symbolique le
    /// fait sortir de l'espace de travail, [`StoreError::Unavailable`] s'il ne peut pas être lu.
    fn read_file(&self, folder: &Folder, name: &AttachmentName) -> Result<Vec<u8>, StoreError>;

    /// Écrit une nouvelle pièce jointe dans le dossier de pièces jointes de la note, créé si
    /// besoin ; n'écrase jamais un fichier existant.
    ///
    /// # Errors
    ///
    /// [`StoreError::NotFound`] si la note n'existe pas, [`StoreError::AttachmentAlreadyExists`]
    /// si le nom est pris, [`StoreError::Unavailable`] si l'écriture échoue ; rien n'est laissé
    /// à moitié écrit.
    fn write_attachment(
        &self,
        note: &NotePath,
        name: &AttachmentName,
        bytes: &[u8],
    ) -> Result<(), StoreError>;

    /// Où se trouve une pièce jointe de la note, pour l'ouvrir avec une application du Mac.
    ///
    /// # Errors
    ///
    /// [`StoreError::AttachmentNotFound`] si la note n'a pas cette pièce jointe,
    /// [`StoreError::Unavailable`] si le stockage ne répond pas.
    fn attachment_location(
        &self,
        note: &NotePath,
        name: &AttachmentName,
    ) -> Result<AttachmentLocation, StoreError>;
}

/// Emplacement d'une pièce jointe, que seul l'adaptateur de stockage sait fabriquer et que
/// seul l'ouvreur d'applications sait lire.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttachmentLocation(String);

impl AttachmentLocation {
    /// L'emplacement donné par l'adaptateur de stockage.
    #[must_use]
    pub fn new(location: String) -> Self {
        Self(location)
    }

    /// L'emplacement, tel que l'adaptateur l'a donné.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Ce qui a changé dans l'espace de travail hors de l'application.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WorkspaceChange {
    /// Les notes créées, modifiées, supprimées ou renommées. Vide quand seuls des dossiers
    /// ont changé : il faut tout de même relire les dossiers et la liste.
    pub notes: Vec<NotePath>,
}

/// Reçoit chaque changement de l'espace de travail, depuis un fil de la surveillance.
pub type ChangeListener = Arc<dyn Fn(WorkspaceChange) + Send + Sync>;

/// Une surveillance en cours ; elle s'arrête quand on la lâche.
pub trait Watching: Send + Sync + Debug {}

/// Écoute les changements faits dans l'espace de travail hors de l'application : fichiers
/// cachés, corbeille et dossiers de pièces jointes exceptés.
pub trait WorkspaceWatcher: Send + Sync + Debug {
    /// Commence à surveiller l'espace de travail situé à `location` ; chaque changement
    /// (regroupé avec ceux qui le suivent de près) est passé à `listener`.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le dossier ne peut pas être surveillé.
    fn watch(
        &self,
        location: &WorkspaceLocation,
        listener: ChangeListener,
    ) -> Result<Box<dyn Watching>, StoreError>;
}

/// Une pièce jointe copiée avec un export Markdown.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExportedAttachment {
    /// Son nom, gardé dans le dossier de pièces jointes de l'export.
    pub name: AttachmentName,
    /// Son contenu.
    pub bytes: Vec<u8>,
}

/// Écrit les fichiers exportés, hors de l'espace de travail, là où l'utilisateur l'a choisi.
pub trait ExportStore: Send + Sync + Debug {
    /// Écrit le texte d'un export Markdown au fichier exporté, à la place d'un fichier existant
    /// (la fenêtre d'enregistrement l'a fait confirmer), et chaque pièce jointe dans le dossier
    /// de pièces jointes de l'export, créé si besoin.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si un fichier ne peut pas être écrit.
    fn write_markdown(
        &self,
        destination: &ExportDestination,
        text: &str,
        attachments: &[ExportedAttachment],
    ) -> Result<(), StoreError>;

    /// Écrit une image au fichier exporté, à la place d'un fichier existant.
    /// # Errors
    /// [`StoreError::Unavailable`] si le fichier ne peut pas être écrit.
    fn write_image(&self, to: &ExportDestination, bytes: &[u8]) -> Result<(), StoreError>;
}

/// Le presse-papiers du système, où une note copiée est posée pour être collée ailleurs.
pub trait Clipboard: Send + Sync + Debug {
    /// Remplace le contenu du presse-papiers par la même note en deux formats à la fois : le
    /// texte mis en forme `html` et le texte brut `text` ; l'application qui colle prend celui
    /// qu'elle sait lire.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le presse-papiers refuse l'un des deux formats.
    fn copy_rich_text(&self, html: &str, text: &str) -> Result<(), StoreError>;

    /// Remplace le contenu du presse-papiers par le texte brut `text` seul (le texte Markdown
    /// d'une note, tel quel).
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si le presse-papiers refuse le texte.
    fn copy_plain_text(&self, text: &str) -> Result<(), StoreError>;
}

/// Donne le moment présent.
pub trait Clock: Send + Sync + Debug {
    /// La date et l'heure locales, à la minute.
    fn now(&self) -> Moment;
}

/// Emplacement d'un espace de travail, tel que l'utilisateur l'a choisi.
///
/// L'application ne l'interprète pas : seul l'adaptateur de stockage sait le traduire.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceLocation(String);

/// Emplacement refusé parce qu'il est vide.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("l'emplacement de l'espace de travail est vide")]
pub struct EmptyLocation;

impl WorkspaceLocation {
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

/// Ouvre l'espace de travail qui se trouve à un emplacement.
pub trait WorkspaceOpener: Send + Sync + Debug {
    /// Les notes de l'espace de travail situé à `location`.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si rien d'utilisable ne se trouve à cet emplacement.
    fn open(&self, location: &WorkspaceLocation) -> Result<Arc<dyn NoteStore>, StoreError>;
}

/// L'index d'un espace de travail : ce que la liste, le tri, les étiquettes et la recherche
/// savent de chaque note sans relire les fichiers. Les fichiers Markdown restent la seule
/// vérité : l'index se reconstruit à partir d'eux sans rien perdre.
pub trait NoteIndex: Send + Sync + Debug {
    /// Le relevé de chaque note connue de l'index, tel qu'il était quand il l'a lue.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'index ne répond pas.
    fn stamps(&self) -> Result<Vec<NoteStamp>, StoreError>;

    /// Garde ces notes, à la place de ce qu'il savait d'elles.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'index ne peut pas être écrit ; rien n'est alors gardé.
    fn put(&self, notes: &[IndexedNote]) -> Result<(), StoreError>;

    /// Oublie ces notes ; celles qu'il ne connaît pas sont ignorées.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'index ne peut pas être écrit.
    fn remove(&self, notes: &[NotePath]) -> Result<(), StoreError>;

    /// Oublie toutes les notes.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'index ne peut pas être écrit.
    fn clear(&self) -> Result<(), StoreError>;

    /// Le texte de la note tel que l'index l'a lu en dernier ; rien s'il ne la connaît pas.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'index ne répond pas.
    fn content(&self, note: &NotePath) -> Result<Option<String>, StoreError>;

    /// Le résumé de chaque note du dossier, sans celles de ses sous-dossiers, dans aucun ordre.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'index ne répond pas.
    fn notes_in(&self, folder: &Folder) -> Result<Vec<NoteSummary>, StoreError>;

    /// Le résumé de chaque note de l'espace de travail, dans aucun ordre.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'index ne répond pas.
    fn all_notes(&self) -> Result<Vec<NoteSummary>, StoreError>;

    /// Le résumé de chaque note qui porte l'étiquette `tag`, telle qu'écrite (les majuscules
    /// comptent), dans aucun ordre.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'index ne répond pas.
    fn tagged(&self, tag: &str) -> Result<Vec<NoteSummary>, StoreError>;

    /// Les notes de l'un des types de contenu `types` qui contiennent tous les mots de `query`
    /// (voir [`domain::search`]), avec leur contenu pour en tirer l'extrait, dans aucun ordre.
    /// Aucun type : rien n'est trouvé.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si l'index ne répond pas.
    fn search(
        &self,
        query: &SearchQuery,
        types: &[ContentType],
    ) -> Result<Vec<(NoteSummary, String)>, StoreError>;
}

/// Ouvre l'index d'un espace de travail : un par espace, rangé hors de lui.
pub trait IndexOpener: Send + Sync + Debug {
    /// L'index de l'espace de travail situé à `location` ; vide s'il n'existait pas, s'il était
    /// abîmé ou d'un ancien format.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si aucun index ne peut être ouvert ni créé.
    fn open(&self, location: &WorkspaceLocation) -> Result<Arc<dyn NoteIndex>, StoreError>;

    /// L'index de mots de l'espace de travail situé à `location`, et son index de sens (le
    /// même fichier). Par défaut, l'index de mots de [`IndexOpener::open`] et un index de sens
    /// vide, que rien ne remplit : la recherche par le sens n'y trouve rien.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si aucun index ne peut être ouvert ni créé.
    fn open_with_meaning(&self, location: &WorkspaceLocation) -> Result<OpenedIndex, StoreError> {
        Ok(OpenedIndex {
            words: self.open(location)?,
            meaning: Arc::new(MemoryMeaningIndex::default()),
        })
    }
}

/// Les index d'un espace de travail ouvert : celui des mots (qui tient celui du sens à jour) et
/// celui du sens.
#[derive(Debug, Clone)]
pub struct OpenedIndex {
    /// L'index de mots, que l'application met à jour à chaque changement des notes.
    pub words: Arc<dyn NoteIndex>,
    /// L'index de sens du même espace de travail.
    pub meaning: Arc<dyn MeaningStore>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_location_is_given_back_as_chosen() {
        let location = WorkspaceLocation::new("/Users/moi/Notes").unwrap();
        assert_eq!(location.as_str(), "/Users/moi/Notes");
    }

    #[test]
    fn an_empty_location_is_refused() {
        assert_eq!(WorkspaceLocation::new(""), Err(EmptyLocation));
    }
}
