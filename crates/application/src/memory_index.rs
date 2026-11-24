//! L'index en mémoire : il ne survit pas à la session. C'est celui d'une session sans index gardé
//! sur disque, et le faux des tests de contrat de l'index (voir `testing::index_contract`).

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use domain::mind_map::{indexed_node_entries, searchable_text};
use domain::research_notebook::indexed_entries;
use domain::search::{SearchQuery, search};
use domain::{ContentType, Folder, NotePath, NoteSummary};

use crate::{IndexOpener, IndexedNote, NoteIndex, NoteStamp, StoreError, WorkspaceLocation};

/// Ce que l'index en mémoire sait d'une note : avec, pour un cahier de recherche, chacune de
/// ses entrées et son texte.
#[derive(Debug)]
struct Known {
    stamp: NoteStamp,
    summary: NoteSummary,
    content: String,
    /// Ce que la recherche par les mots lit de la note : son texte, sauf pour une carte mentale,
    /// dont seuls le titre et les étiquettes comptent.
    searchable: String,
    entries: Vec<(NoteSummary, String)>,
}

/// Index rangé en mémoire, vide à sa création.
#[derive(Debug, Default)]
pub struct MemoryIndex {
    notes: Mutex<BTreeMap<NotePath, Known>>,
}

impl MemoryIndex {
    fn notes(&self) -> MutexGuard<'_, BTreeMap<NotePath, Known>> {
        self.notes.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn summaries(&self, keep: impl Fn(&Known) -> bool) -> Vec<NoteSummary> {
        self.notes()
            .values()
            .filter(|known| keep(known))
            .map(|known| known.summary.clone())
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
            let mut entries = indexed_entries(&summary, &note.content);
            entries.extend(indexed_node_entries(&summary, &note.content));
            let searchable = match summary.content_type() {
                ContentType::MindMap => searchable_text(&summary),
                ContentType::Canvas => domain::canvas::indexed_text(summary.title(), &note.content),
                _ => note.content.clone(),
            };
            let kept = Known {
                stamp,
                summary,
                content: note.content.clone(),
                searchable,
                entries,
            };
            known.insert(note.stamp.path.clone(), kept);
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

    fn content(&self, note: &NotePath) -> Result<Option<String>, StoreError> {
        Ok(self.notes().get(note).map(|known| known.content.clone()))
    }

    fn notes_in(&self, folder: &Folder) -> Result<Vec<NoteSummary>, StoreError> {
        Ok(self.summaries(|known| known.stamp.path.folder() == folder))
    }

    fn all_notes(&self) -> Result<Vec<NoteSummary>, StoreError> {
        Ok(self.summaries(|_| true))
    }

    fn tagged(&self, tag: &str) -> Result<Vec<NoteSummary>, StoreError> {
        Ok(self.summaries(|known| known.summary.tags().iter().any(|t| t == tag)))
    }

    fn search(
        &self,
        query: &SearchQuery,
        types: &[ContentType],
    ) -> Result<Vec<(NoteSummary, String)>, StoreError> {
        let notes = self.notes();
        let items = notes.values().flat_map(|known| {
            std::iter::once((&known.summary, &known.searchable))
                .chain(known.entries.iter().map(|(summary, text)| (summary, text)))
        });
        Ok(items
            .filter(|(summary, _)| types.contains(&summary.content_type()))
            .filter(|(_, text)| search(query, text).is_some())
            .map(|(summary, text)| (summary.clone(), text.clone()))
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
