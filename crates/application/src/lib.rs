//! Cas d'usage de MALOREAN Notes. Ne parle au stockage que par les ports.

pub mod error;
mod indexed_store;
mod memory_index;
pub mod ports;
#[cfg(any(test, feature = "testing"))]
pub mod testing;
pub mod use_cases;
pub mod workspaces;

pub use error::AppError;
pub use indexed_store::IndexedStore;
pub use memory_index::{MemoryIndex, MemoryIndexes};
pub use ports::{
    AttachmentLocation, ChangeListener, Clipboard, Clock, EmptyLocation, ExportStore,
    ExportedAttachment, IndexOpener, IndexedNote, NoteIndex, NoteStamp, NoteStore, Preferences,
    StoreError, StoredNote, TrashContents, Watching, WorkspaceChange, WorkspaceLocation,
    WorkspaceOpener, WorkspaceWatcher,
};
pub use workspaces::{Workspace, WorkspaceName, Workspaces};
