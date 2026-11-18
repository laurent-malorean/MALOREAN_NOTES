//! Faux en mémoire et tests de contrat, pour les tests des couches.

pub mod attachment_contract;
pub mod contract;
pub mod export_contract;
mod fake_exports;
mod fakes;
pub mod preferences_contract;
mod trash_contract;

pub use fake_exports::InMemoryExportStore;
pub use fakes::{FakeOpener, FakePreferences, FakeWatcher, FixedClock, InMemoryNoteStore};
