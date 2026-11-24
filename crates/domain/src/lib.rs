//! Règles pures de MALOREAN Notes : titre, nom de fichier, en-tête, pièces jointes, adresses web, historique,
//! aide à l'écriture, événements de Claude Code, outils de l'application.
//! Aucun accès au disque, à l'horloge ni au réseau.

pub mod app_tools;
pub mod attachment_name;
pub mod attachments;
pub mod canvas;
pub mod canvas_color;
mod canvas_merge;
mod canvas_write;
pub mod claude;
pub mod conflict;
pub mod content_type;
pub mod diff;
pub mod export;
pub mod file_name;
pub mod folder;
pub mod front_matter;
pub mod history;
pub mod journal;
pub mod json;
pub mod links;
pub mod meaning;
pub mod meaning_vector;
pub mod mind_map;
pub mod note;
pub mod ranking;
pub mod research_notebook;
pub mod saving;
pub mod search;
pub mod segments;
pub mod tag;
pub mod template;
pub mod title;
pub mod web_address;
pub mod writing;

pub use attachment_name::{
    AttachmentKind, AttachmentName, InvalidMoment, Moment, RefusedAttachment,
};
pub use conflict::{Fingerprint, InvalidFingerprint};
pub use content_type::ContentType;
pub use file_name::{FileName, InvalidFileName};
pub use folder::{Folder, FolderName, InvalidFolderName, NotePath};
pub use meaning::{Architecture, MeaningModel, ModelFile, ModelFileInfo};
pub use meaning_vector::{InvalidMeaningVector, MeaningVector, dot_product};
pub use note::{Modified, NoteOrder, NoteSummary};
pub use title::Title;
pub use web_address::WebAddress;
