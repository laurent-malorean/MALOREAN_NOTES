//! Pont entre l'interface et Rust : une commande Tauri par intention.
//! Lit la requête, appelle un cas d'usage, met la réponse en forme. Aucune règle métier.

pub mod commands;
mod dto;
mod error;
mod session;

pub use dto::{
    AttachedFile, ExcerptPartItem, LibraryChanged, LibraryInfo, LibraryNoteItem, LinkingNoteItem,
    NoteContent, NoteListItem, NoteOrderItem, SaveResult, SavedNote, SearchResultItem, TagItem,
    TrashInfo, TrashedNoteItem,
};
pub use error::ApiError;
pub use session::Session;
