//! Adaptateurs de sortie : bibliothèque Markdown sur disque, sa surveillance, préférences, horloge.

mod fs_note_store;
mod fs_watcher;
mod json_preferences;
mod system_clock;

pub use fs_note_store::{FsLibraryOpener, FsNoteStore};
pub use fs_watcher::FsLibraryWatcher;
pub use json_preferences::JsonPreferences;
pub use system_clock::SystemClock;
