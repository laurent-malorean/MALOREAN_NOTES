//! Cas d'usage de MALOREAN Notes. Ne parle au stockage que par les ports.

mod claude;
pub mod error;
mod history;
mod indexed_store;
mod memory_history;
mod memory_index;
pub mod ports;
#[cfg(any(test, feature = "testing"))]
pub mod testing;
pub mod use_cases;
mod versioned_store;
pub mod workspaces;
mod writing;

pub use claude::{ClaudeAccount, ClaudeCode, ClaudeError, ClaudeStatus, ClaudeTurn};
pub use error::AppError;
pub use history::{History, HistoryOpener, HistoryPlace};
pub use indexed_store::IndexedStore;
pub use memory_history::{MemoryHistories, MemoryHistory};
pub use memory_index::{MemoryIndex, MemoryIndexes};
pub use ports::{
    AttachmentLocation, ChangeListener, Clipboard, Clock, EmptyLocation, ExportStore,
    ExportedAttachment, IndexOpener, IndexedNote, NoteIndex, NoteStamp, NoteStore, Preferences,
    StoreError, StoredNote, TrashContents, Watching, WorkspaceChange, WorkspaceLocation,
    WorkspaceOpener, WorkspaceWatcher,
};
pub use versioned_store::VersionedStore;
pub use workspaces::{Workspace, WorkspaceName, Workspaces};
pub use writing::{AssistError, Unavailability, WritingAssistant};
