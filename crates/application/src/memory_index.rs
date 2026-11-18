//! L'index en mémoire : il ne survit pas à la session. C'est celui d'une session sans index gardé
//! sur disque, et le faux des tests de contrat de l'index (voir `testing::index_contract`).

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use domain::search::{SearchQuery, search};
use domain::{Folder, NotePath, NoteSummary};

use crate::{IndexOpener, IndexedNote, NoteIndex, NoteStamp, StoreError, WorkspaceLocation};

/// Ce que l'index en mémoire sait d'une note.
#[derive(Debug)]
struct Entry {
    stamp: NoteStamp,
    summary: NoteSummary,
    content: String,
}

/// Index rangé en mémoire, vide à sa création.
#[derive(Debug, Default)]
pub struct MemoryIndex {
    notes: Mutex<BTreeMap<NotePath, Entry>>,
}

impl MemoryIndex {
    fn notes(&self) -> MutexGuard<'_, BTreeMap<NotePath, Entry>> {
        self.notes.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn summaries(&self, keep: impl Fn(&Entry) -> bool) -> Vec<NoteSummary> {
        self.notes()
            .values()
            .filter(|entry| keep(entry))
            .map(|entry| entry.summary.clone())
            .collect()
    }
}

impl NoteIndex for MemoryIndex {
    fn stamps(&self) -> Result<Vec<NoteStamp>, StoreError> {
        Ok(self.notes().values().map(|e| e.stamp.clone()).collect())
    }

    fn put(&self, notes: &[IndexedNote]) -> Result<(), StoreError> {
        let mut known = self.notes();
        for note in notes {
            let stamp = note.stamp.clone();
            let summary = NoteSummary::new(stamp.path.clone(), &note.content, stamp.modified);
            let entry = Entry {
                stamp,
                summary,
                content: note.content.clone(),
            };
            known.insert(note.stamp.path.clone(), entry);
        }
        Ok(())
    }

    fn remove(&self, notes: &[NotePath]) -> Result<(), StoreError> {
        let mut known = self.notes();
        for note in notes {
            known.remove(note);
        }
        Ok(())
    }

    fn clear(&self) -> Result<(), StoreError> {
        self.notes().clear();
        Ok(())
    }

    fn notes_in(&self, folder: &Folder) -> Result<Vec<NoteSummary>, StoreError> {
        Ok(self.summaries(|entry| entry.stamp.path.folder() == folder))
    }

    fn all_notes(&self) -> Result<Vec<NoteSummary>, StoreError> {
        Ok(self.summaries(|_| true))
    }

    fn tagged(&self, tag: &str) -> Result<Vec<NoteSummary>, StoreError> {
        Ok(self.summaries(|entry| entry.summary.tags().iter().any(|t| t == tag)))
    }

    fn search(&self, query: &SearchQuery) -> Result<Vec<(NoteSummary, String)>, StoreError> {
        Ok(self
            .notes()
            .values()
            .filter(|entry| search(query, &entry.content).is_some())
            .map(|entry| (entry.summary.clone(), entry.content.clone()))
            .collect())
    }
}

/// Ouvre un nouvel index en mémoire, vide, pour chaque espace de travail ouvert.
#[derive(Debug, Default)]
pub struct MemoryIndexes;

impl IndexOpener for MemoryIndexes {
    fn open(&self, _location: &WorkspaceLocation) -> Result<Arc<dyn NoteIndex>, StoreError> {
        Ok(Arc::new(MemoryIndex::default()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::index_contract::note_index_contract;

    #[test]
    fn the_memory_index_honours_the_contract() {
        note_index_contract(MemoryIndex::default);
    }

    #[test]
    fn each_workspace_opened_gets_an_empty_index() {
        let location = WorkspaceLocation::new("/Users/moi/Notes").unwrap();
        let first = MemoryIndexes.open(&location).unwrap();
        first
            .put(&[IndexedNote {
                stamp: NoteStamp {
                    path: NotePath::parse("a.md").unwrap(),
                    modified: domain::Modified(1),
                    size: 1,
                },
                content: "a".to_owned(),
            }])
            .unwrap();
        assert!(
            MemoryIndexes
                .open(&location)
                .unwrap()
                .stamps()
                .unwrap()
                .is_empty()
        );
    }
}
