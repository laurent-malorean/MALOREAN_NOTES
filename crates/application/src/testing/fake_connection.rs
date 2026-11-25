//! Faux de la clé de branchement : gardée en mémoire, secrets comptés.

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Mutex, PoisonError};

use domain::connection_key::ConnectionKey;

use crate::{ConnectionKeys, ConnectionSocket, SecretMaker, StoreError};

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

/// Une prise de branchement qui dit seulement si elle est ouverte.
#[derive(Debug, Default)]
pub struct FakeConnectionSocket {
    open: AtomicBool,
    fails: AtomicBool,
}

impl FakeConnectionSocket {
    /// Dit si la prise est ouverte.
    #[must_use]
    pub fn is_open(&self) -> bool {
        self.open.load(Ordering::Relaxed)
    }

    /// Fait refuser les prochaines ouvertures, ou les laisse aboutir.
    pub fn fail_to_open(&self, fails: bool) {
        self.fails.store(fails, Ordering::Relaxed);
    }
}

impl ConnectionSocket for FakeConnectionSocket {
    fn open(&self) -> Result<(), StoreError> {
        if self.fails.load(Ordering::Relaxed) {
            return Err(StoreError::Unavailable("prise refusée".to_owned()));
        }
        self.open.store(true, Ordering::Relaxed);
        Ok(())
    }

    fn close(&self) {
        self.open.store(false, Ordering::Relaxed);
    }
}
