//! Adaptateurs de sortie : espace de travail Markdown sur disque, sa surveillance, exports,
//! préférences, horloge.

mod fs_export_store;
mod fs_note_store;
mod fs_watcher;
mod json_preferences;
mod system_clock;

pub use fs_export_store::FsExportStore;
pub use fs_note_store::{FsNoteStore, FsWorkspaceOpener};
pub use fs_watcher::FsWorkspaceWatcher;
pub use json_preferences::JsonPreferences;
pub use system_clock::SystemClock;
