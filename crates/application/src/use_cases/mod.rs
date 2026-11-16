//! Un type par intention de l'utilisateur.

mod attachments;
mod create_note;
mod folders;
mod library;
mod list_notes;
mod move_note;
mod pin_note;
mod read_note;
mod save_note;
mod search_notes;
mod trash;

pub use attachments::{AttachFile, AttachmentSource, MAX_ATTACHMENT_MEGABYTES, OpenAttachment};
pub use create_note::CreateNote;
pub use folders::{CreateFolder, ListFolders, MoveFolder, RenameFolder};
pub use library::{OpenLibrary, OpenedLibrary, ReopenLastLibrary};
pub use list_notes::ListNotes;
pub use move_note::MoveNote;
pub use pin_note::PinNote;
pub use read_note::ReadNote;
pub use save_note::{SaveNote, SaveOutcome};
pub use search_notes::{MAX_RESULTS, SearchNotes, SearchResult};
pub use trash::{Trash, TrashView};
