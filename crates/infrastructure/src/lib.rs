//! Adaptateurs de sortie : espace de travail Markdown sur disque, son historique, sa surveillance,
//! son index SQLite, exports, préférences, horloge, presse-papiers du Mac, assistant d'écriture
//! (modèle d'IA du Mac), Claude Code piloté en arrière-plan.

mod apple_writing;
mod claude_code_cli;
mod claude_stream;
mod fs_export_store;
mod fs_history;
mod fs_note_store;
mod fs_watcher;
mod json_preferences;
#[cfg(target_os = "macos")]
mod mac_clipboard;
mod sqlite_index;
mod system_clock;
mod web_guard;

pub use apple_writing::{AppleWritingAssistant, WRITING_HELPER};
pub use claude_code_cli::{ClaudeCodeCli, claude_folders};
pub use fs_export_store::FsExportStore;
pub use fs_history::{FsHistories, FsHistory};
pub use fs_note_store::{FsNoteStore, FsWorkspaceOpener};
pub use fs_watcher::FsWorkspaceWatcher;
pub use json_preferences::JsonPreferences;
#[cfg(target_os = "macos")]
pub use mac_clipboard::MacClipboard;
pub use sqlite_index::{FORMAT_VERSION, SqliteIndex, SqliteIndexes};
pub use system_clock::SystemClock;
