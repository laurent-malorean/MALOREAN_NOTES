//! Règles pures de MALOREAN Notes : titre, nom de fichier, en-tête, pièces jointes.
//! Aucun accès au disque, à l'horloge ni au réseau.

pub mod attachments;
pub mod file_name;
pub mod front_matter;
pub mod note;
pub mod title;

pub use file_name::{FileName, InvalidFileName};
pub use note::{Modified, NoteSummary};
pub use title::Title;
