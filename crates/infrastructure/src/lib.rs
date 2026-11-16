//! Adaptateurs de sortie : bibliothèque Markdown sur disque, préférences, horloge.

mod fs_note_store;
mod json_preferences;
mod system_clock;

pub use fs_note_store::{FsLibraryOpener, FsNoteStore};
pub use json_preferences::JsonPreferences;
pub use system_clock::SystemClock;
