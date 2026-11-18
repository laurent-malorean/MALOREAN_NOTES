//! Cas d'usage de MALOREAN Notes. Ne parle au stockage que par les ports.

pub mod error;
pub mod ports;
#[cfg(any(test, feature = "testing"))]
pub mod testing;
pub mod use_cases;
pub mod workspaces;

pub use error::AppError;
pub use ports::{
    AttachmentLocation, ChangeListener, Clock, EmptyLocation, NoteStore, Preferences, StoreError,
    StoredNote, TrashContents, Watching, WorkspaceChange, WorkspaceLocation, WorkspaceOpener,
    WorkspaceWatcher,
};
pub use workspaces::{Workspace, WorkspaceName, Workspaces};
