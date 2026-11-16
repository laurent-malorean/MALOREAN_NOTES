//! Faux en mémoire et tests de contrat, pour les tests des couches.

pub mod contract;
mod fakes;
mod trash_contract;

pub use fakes::{FakeOpener, FakePreferences, InMemoryNoteStore};
