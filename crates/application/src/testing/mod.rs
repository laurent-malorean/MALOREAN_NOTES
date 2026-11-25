//! Faux en mémoire et tests de contrat, pour les tests des couches.

pub mod attachment_contract;
pub mod claude_contract;
pub mod clipboard_contract;
pub mod connection_contract;
pub mod contract;
pub mod export_contract;
mod fake_claude;
mod fake_clipboard;
mod fake_connection;
mod fake_exports;
mod fake_meaning;
mod fake_opener;
mod fake_watcher;
mod fake_writing;
mod fakes;
pub mod gestures_contract;
pub mod history_contract;
pub mod index_contract;
pub mod meaning_contract;
pub mod meaning_index_contract;
pub mod preferences_contract;
mod trash_contract;
pub mod writing_contract;

pub use fake_claude::{ClaudeRequest, FakeClaudeCode};
pub use fake_clipboard::InMemoryClipboard;
pub use fake_connection::{CountingSecretMaker, FakeConnectionSocket, InMemoryConnectionKeys};
pub use fake_exports::InMemoryExportStore;
pub use fake_meaning::{FakeEmbedder, FakeMeaningModels};
pub use fake_watcher::FakeWatcher;
pub use fake_writing::FakeWritingAssistant;

use crate::{MemoryIndex, NoteStore};

/// Un index en mémoire, à jour sur les notes de `store`.
///
/// # Panics
///
/// Si l'espace de travail ne peut pas être lu.
#[must_use]
pub fn indexed(store: &dyn NoteStore) -> MemoryIndex {
    let index = MemoryIndex::default();
    crate::indexed_store::refresh(store, &index).unwrap_or_else(|e| unreachable!("{e:?}"));
    index
}
pub use fake_opener::FakeOpener;
pub use fakes::{FakePreferences, FixedClock, InMemoryNoteStore};
