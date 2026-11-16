//! Cas d'usage de MALOREAN Notes. Ne parle au stockage que par les ports.

pub mod error;
pub mod ports;
#[cfg(any(test, feature = "testing"))]
pub mod testing;
pub mod use_cases;

pub use error::AppError;
pub use ports::{LibraryLocation, LibraryOpener, NoteStore, Preferences, StoreError, StoredNote};
