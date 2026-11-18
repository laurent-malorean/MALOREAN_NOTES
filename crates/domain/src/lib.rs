//! Règles pures de MALOREAN Notes : titre, nom de fichier, en-tête, pièces jointes.
//! Aucun accès au disque, à l'horloge ni au réseau.

pub mod attachment_name;
pub mod attachments;
pub mod conflict;
pub mod file_name;
pub mod folder;
pub mod front_matter;
pub mod journal;
pub mod links;
pub mod note;
pub mod saving;
pub mod search;
pub mod tag;
pub mod template;
pub mod title;

pub use attachment_name::{
    AttachmentKind, AttachmentName, InvalidMoment, Moment, RefusedAttachment,
};
pub use conflict::{Fingerprint, InvalidFingerprint};
pub use file_name::{FileName, InvalidFileName};
pub use folder::{Folder, FolderName, InvalidFolderName, NotePath};
pub use note::{Modified, NoteOrder, NoteSummary};
pub use title::Title;
