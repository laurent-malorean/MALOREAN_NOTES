//! Cas d'usage de MALOREAN Notes. Ne parle au stockage que par les ports.

mod claude;
pub mod error;
mod gestures;
mod history;
mod indexed_store;
mod meaning_index;
mod meaning_ports;
mod memory_gestures;
mod memory_history;
mod memory_index;
mod memory_meaning_index;
mod no_meaning_models;
pub mod ports;
mod segmenting_index;
#[cfg(any(test, feature = "testing"))]
pub mod testing;
pub mod use_cases;
mod versioned_store;
pub mod workspaces;
mod writing;

pub use claude::{ClaudeAccount, ClaudeCode, ClaudeError, ClaudeStatus, ClaudeTurn};
pub use error::AppError;
pub use gestures::{Gesture, GestureId, GestureStep, PendingGestures, PendingGesturesOpener};
pub use history::{History, HistoryOpener, HistoryPlace};
pub use indexed_store::IndexedStore;
pub use meaning_index::{
    FoundSegment, MeaningIndex, MeaningIndexError, MeaningSearch, MeaningStatus, MeaningStore,
    PendingSegment, RelatedNote, SegmentId, check_dimensions,
};
pub use meaning_ports::{
    DownloadProgress, Embedder, MeaningError, MeaningModels, ModelState, ProgressListener,
};
pub use memory_gestures::{MemoryPendingGestures, MemoryPendingGesturesOpener};
pub use memory_history::{MemoryHistories, MemoryHistory};
pub use memory_index::{MemoryIndex, MemoryIndexes};
pub use memory_meaning_index::{MemoryMeaningIndex, MemoryMeaningIndexes};
pub use no_meaning_models::NoMeaningModels;
pub use ports::{
    AttachmentLocation, ChangeListener, Clipboard, Clock, EmptyLocation, ExportStore,
    ExportedAttachment, IndexOpener, IndexedNote, NoteIndex, NoteStamp, NoteStore, OpenedIndex,
    Preferences, StoreError, StoredNote, TrashContents, Watching, WorkspaceChange,
    WorkspaceLocation, WorkspaceOpener, WorkspaceWatcher,
};
pub use segmenting_index::{SegmentingIndex, note_segments};
pub use versioned_store::VersionedStore;
pub use workspaces::{Workspace, WorkspaceName, Workspaces};
pub use writing::{AssistError, Unavailability, WritingAssistant};
