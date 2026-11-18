//! Adaptateurs de sortie : espace de travail Markdown sur disque, sa surveillance, préférences, horloge.

mod fs_note_store;
mod fs_watcher;
mod json_preferences;
mod system_clock;

pub use fs_note_store::{FsNoteStore, FsWorkspaceOpener};
pub use fs_watcher::FsWorkspaceWatcher;
pub use json_preferences::JsonPreferences;
pub use system_clock::SystemClock;
