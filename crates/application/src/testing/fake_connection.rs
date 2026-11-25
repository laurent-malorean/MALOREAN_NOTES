//! Faux de la clé de branchement : gardée en mémoire, secrets comptés.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, PoisonError};

use domain::connection_key::ConnectionKey;

use crate::{ConnectionKeys, SecretMaker, StoreError};

/// La clé de branchement gardée en mémoire.
#[derive(Debug, Default)]
pub struct InMemoryConnectionKeys {
    key: Mutex<Option<ConnectionKey>>,
}

impl ConnectionKeys for InMemoryConnectionKeys {
    fn load(&self) -> Result<Option<ConnectionKey>, StoreError> {
        Ok(self
            .key
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone())
    }

    fn save(&self, key: &ConnectionKey) -> Result<(), StoreError> {
        *self.key.lock().unwrap_or_else(PoisonError::into_inner) = Some(key.clone());
        Ok(())
    }

    fn delete(&self) -> Result<(), StoreError> {
        *self.key.lock().unwrap_or_else(PoisonError::into_inner) = None;
        Ok(())
    }
}

/// Une source de secrets qui compte : `secret-1`, `secret-2`, etc.
#[derive(Debug, Default)]
pub struct CountingSecretMaker {
    drawn: AtomicUsize,
}

impl SecretMaker for CountingSecretMaker {
    fn secret(&self) -> Result<String, StoreError> {
        Ok(format!(
            "secret-{}",
            self.drawn.fetch_add(1, Ordering::Relaxed) + 1
        ))
    }
}
