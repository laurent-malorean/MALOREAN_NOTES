//! Faux en mémoire et tests de contrat, pour les tests des couches.

pub mod attachment_contract;
pub mod contract;
mod fakes;
pub mod preferences_contract;
mod trash_contract;

pub use fakes::{FakeOpener, FakePreferences, FakeWatcher, FixedClock, InMemoryNoteStore};
