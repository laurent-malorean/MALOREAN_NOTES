//! Un type par intention de l'utilisateur.

mod attachments;
mod create_note;
mod folders;
mod list_notes;
mod move_note;
mod note_links;
mod pin_note;
mod read_note;
mod recent_notes;
mod save_note;
mod search_notes;
mod tags;
mod trash;
mod workspace;

pub use attachments::{AttachFile, AttachmentSource, MAX_ATTACHMENT_MEGABYTES, OpenAttachment};
pub use create_note::{CreateDailyNote, CreateNote, CreateNoteFromTemplate};
pub use folders::{CreateFolder, ListFolders, MoveFolder, RenameFolder};
pub use list_notes::{ListAllNotes, ListNotes};
pub use move_note::MoveNote;
pub use note_links::{LinkingNote, NoteLinks};
pub use pin_note::PinNote;
pub use read_note::ReadNote;
pub use recent_notes::ListRecentNotes;
pub use save_note::{SaveNote, SaveOutcome};
pub use search_notes::{MAX_RESULTS, SearchNotes, SearchResult};
pub use tags::{ListTaggedNotes, ListTags};
pub use trash::{Trash, TrashView};
pub use workspace::{OpenWorkspace, OpenedWorkspace, ReopenLastWorkspace};
