//! Adaptateurs de sortie : bibliothèque Markdown sur disque, préférences.

mod fs_note_store;
mod json_preferences;

pub use fs_note_store::{FsLibraryOpener, FsNoteStore};
pub use json_preferences::JsonPreferences;
