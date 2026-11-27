//! Adaptateurs de sortie : espace de travail Markdown sur disque, son historique, sa surveillance,
//! son index SQLite, exports, préférences, horloge, presse-papiers du Mac, assistant d'écriture
//! (modèle d'IA du Mac), Claude Code piloté en arrière-plan.

mod apple_voice;
mod apple_writing;
mod candle_embedder;
mod claude_code_cli;
mod claude_stream;
mod fs_connection_keys;
mod fs_export_store;
mod fs_gestures;
mod fs_history;
mod fs_note_store;
mod fs_watcher;
mod json_preferences;
mod kept_models;
mod local_socket;
#[cfg(target_os = "macos")]
mod mac_clipboard;
mod mcp_relay;
mod model_folder;
mod permanent_socket;
mod sqlite_index;
mod sqlite_meaning_index;
mod system_clock;
mod web_guard;

pub use apple_voice::{AppleTranscriber, VOICE_HELPER};
pub use apple_writing::{AppleWritingAssistant, WRITING_HELPER};
pub use candle_embedder::CandleEmbedder;
pub use claude_code_cli::{AppToolsRelay, ClaudeCodeCli, claude_folders};
pub use fs_connection_keys::{FsConnectionKeys, SystemSecretMaker};
pub use fs_export_store::FsExportStore;
pub use fs_gestures::{FsPendingGestures, FsPendingGesturesOpener};
pub use fs_history::{FsHistories, FsHistory};
pub use fs_note_store::{FsNoteStore, FsWorkspaceOpener};
pub use fs_watcher::FsWorkspaceWatcher;
pub use json_preferences::JsonPreferences;
pub use kept_models::{KEEP_DURATION, KeptModels};
pub use local_socket::{LineAnswer, LocalSocket, SocketPlace};
#[cfg(target_os = "macos")]
pub use mac_clipboard::MacClipboard;
pub use mcp_relay::{CONNECT_OPTION, RELAY_OPTION, connect, relay};
pub use model_folder::ModelFolder;
pub use permanent_socket::{PermanentSocket, connection_folder, connection_socket};
pub use sqlite_index::{FORMAT_VERSION, SqliteIndex, SqliteIndexes};
pub use sqlite_meaning_index::SqliteMeaningIndex;
pub use system_clock::{SystemClock, SystemUptime};
