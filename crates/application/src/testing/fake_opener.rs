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

#[cfg(test)]
mod tests {
    use domain::NotePath;

    use super::*;

    fn store_with(note: &str) -> Arc<InMemoryNoteStore> {
        Arc::new(InMemoryNoteStore::with_notes(&[(note, "# Note")]))
    }

    fn location(text: &str) -> WorkspaceLocation {
        WorkspaceLocation::new(text).unwrap()
    }

    fn knows(store: &Arc<dyn NoteStore>, note: &str) -> bool {
        store.read(&NotePath::parse(note).unwrap()).is_ok()
    }

    #[test]
    fn the_opener_by_location_opens_the_workspace_kept_under_that_location_only() {
        let opener = FakeOpener::by_location(vec![
            ("/a", store_with("dans-a.md")),
            ("/b", store_with("dans-b.md")),
        ]);
        let a = opener.open(&location("/a")).unwrap();
        assert!(knows(&a, "dans-a.md") && !knows(&a, "dans-b.md"));
        let b = opener.open(&location("/b")).unwrap();
        assert!(knows(&b, "dans-b.md") && !knows(&b, "dans-a.md"));
        assert!(matches!(
            opener.open(&location("/c")),
            Err(StoreError::Unavailable(_))
        ));
    }

    #[test]
    fn the_plain_opener_opens_the_same_workspace_whatever_the_location() {
        let opener = FakeOpener::new(store_with("seule.md"));
        let opened = opener.open(&location("/n/importe/ou")).unwrap();
        assert!(knows(&opened, "seule.md"));
    }
}
