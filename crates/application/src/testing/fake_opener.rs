//! Faux ouvreur d'espaces de travail, qui rend des stockages en mémoire.

use std::sync::Arc;

use crate::testing::InMemoryNoteStore;
use crate::{NoteStore, StoreError, WorkspaceLocation, WorkspaceOpener};

/// Ouvre un espace de travail en mémoire : toujours le même, quel que soit l'emplacement, ou celui
/// qui est rangé à l'emplacement demandé ([`FakeOpener::by_location`]).
#[derive(Debug)]
pub struct FakeOpener {
    store: Option<Arc<InMemoryNoteStore>>,
    by_location: Vec<(String, Arc<InMemoryNoteStore>)>,
}

impl FakeOpener {
    /// Un ouvreur qui rend toujours `store`.
    #[must_use]
    pub fn new(store: Arc<InMemoryNoteStore>) -> Self {
        Self {
            store: Some(store),
            by_location: Vec::new(),
        }
    }

    /// Un ouvreur qui rend, pour chaque emplacement, le stockage rangé sous lui ; un autre
    /// emplacement est un dossier introuvable.
    #[must_use]
    pub fn by_location(stores: Vec<(&str, Arc<InMemoryNoteStore>)>) -> Self {
        Self {
            store: None,
            by_location: stores
                .into_iter()
                .map(|(location, store)| (location.to_owned(), store))
                .collect(),
        }
    }
}

impl WorkspaceOpener for FakeOpener {
    fn open(&self, location: &WorkspaceLocation) -> Result<Arc<dyn NoteStore>, StoreError> {
        if let Some(store) = &self.store {
            return Ok(store.clone());
        }
        self.by_location
            .iter()
            .find(|(known, _)| known == location.as_str())
            .map(|(_, store)| store.clone() as Arc<dyn NoteStore>)
            .ok_or_else(|| StoreError::Unavailable("dossier introuvable".to_owned()))
    }
}
