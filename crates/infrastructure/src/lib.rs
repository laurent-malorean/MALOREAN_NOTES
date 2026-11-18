//! Adaptateurs de sortie : espace de travail Markdown sur disque, sa surveillance, son index
//! SQLite, exports, préférences, horloge, presse-papiers du Mac.

mod fs_export_store;
mod fs_note_store;
mod fs_watcher;
mod json_preferences;
#[cfg(target_os = "macos")]
mod mac_clipboard;
mod sqlite_index;
mod system_clock;

pub use fs_export_store::FsExportStore;
pub use fs_note_store::{FsNoteStore, FsWorkspaceOpener};
pub use fs_watcher::FsWorkspaceWatcher;
pub use json_preferences::JsonPreferences;
#[cfg(target_os = "macos")]
pub use mac_clipboard::MacClipboard;
pub use sqlite_index::{FORMAT_VERSION, SqliteIndex, SqliteIndexes};
pub use system_clock::SystemClock;
