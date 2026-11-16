//! Un type par intention de l'utilisateur.

mod create_note;
mod library;
mod list_notes;
mod read_note;
mod save_note;

pub use create_note::CreateNote;
pub use library::{OpenLibrary, OpenedLibrary, ReopenLastLibrary};
pub use list_notes::ListNotes;
pub use read_note::ReadNote;
pub use save_note::SaveNote;
