//! L'historique en mémoire : il ne survit pas à la session. C'est celui d'une session sans
//! historique sur disque, et le faux des tests de contrat de l'historique
//! (voir `testing::history_contract`).

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use domain::history::Version;
use domain::{Folder, NotePath};

use crate::{History, HistoryOpener, HistoryPlace, StoreError, WorkspaceLocation};

type Versions = BTreeMap<Version, String>;

/// Historique rangé en mémoire, vide à sa création.
#[derive(Debug, Default)]
pub struct MemoryHistory {
    notes: Mutex<BTreeMap<(HistoryPlace, NotePath), Versions>>,
}

impl MemoryHistory {
    fn notes(&self) -> MutexGuard<'_, BTreeMap<(HistoryPlace, NotePath), Versions>> {
        self.notes.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl History for MemoryHistory {
    fn versions(&self, note: &NotePath) -> Result<Vec<Version>, StoreError> {
        let notes = self.notes();
        let versions = notes.get(&(HistoryPlace::Workspace, note.clone()));
        Ok(versions
            .map(|v| v.keys().copied().collect())
            .unwrap_or_default())
    }

    fn read_version(&self, note: &NotePath, version: &Version) -> Result<String, StoreError> {
        self.notes()
            .get(&(HistoryPlace::Workspace, note.clone()))
            .and_then(|versions| versions.get(version).cloned())
            .ok_or(StoreError::VersionNotFound(*version))
    }

    fn write_version(
        &self,
        note: &NotePath,
        version: &Version,
        content: &str,
    ) -> Result<(), StoreError> {
        self.notes()
            .entry((HistoryPlace::Workspace, note.clone()))
            .or_default()
            .insert(*version, content.to_owned());
        Ok(())
    }

    fn remove_versions(&self, note: &NotePath, versions: &[Version]) -> Result<(), StoreError> {
        let mut notes = self.notes();
        let key = (HistoryPlace::Workspace, note.clone());
        if let Some(kept) = notes.get_mut(&key) {
            kept.retain(|version, _| !versions.contains(version));
            if kept.is_empty() {
                notes.remove(&key);
            }
        }
        Ok(())
    }

    fn move_note_versions(
        &self,
        (from_place, from): (HistoryPlace, &NotePath),
        (to_place, to): (HistoryPlace, &NotePath),
    ) -> Result<(), StoreError> {
        let mut notes = self.notes();
        if let Some(moved) = notes.remove(&(from_place, from.clone())) {
            notes
                .entry((to_place, to.clone()))
                .or_default()
                .extend(moved);
        }
        Ok(())
    }

    fn move_folder_versions(
        &self,
        (from_place, from): (HistoryPlace, &Folder),
        (to_place, to): (HistoryPlace, &Folder),
    ) -> Result<(), StoreError> {
        let mut notes = self.notes();
        // Les notes du même chemin à l'autre place n'ont pas de clé `from_place` : rien ne les déplace.
        let inside: Vec<NotePath> = notes
            .keys()
            .filter(|(_, note)| note.folder().is_within(from))
            .map(|(_, note)| note.clone())
            .collect();
        for note in inside {
            if let Some(moved) = notes.remove(&(from_place, note.clone())) {
                let target = NotePath::new(note.folder().moved(from, to), note.name().clone());
                notes.entry((to_place, target)).or_default().extend(moved);
            }
        }
        Ok(())
    }

    fn empty_trash(&self) -> Result<(), StoreError> {
        self.notes()
            .retain(|(place, _), _| *place == HistoryPlace::Workspace);
        Ok(())
    }
}

/// Ouvre un historique en mémoire, vide, pour chaque espace de travail ouvert.
#[derive(Debug, Default, Clone, Copy)]
pub struct MemoryHistories;

impl HistoryOpener for MemoryHistories {
    fn open(&self, _location: &WorkspaceLocation) -> Result<Arc<dyn History>, StoreError> {
        Ok(Arc::new(MemoryHistory::default()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::history_contract::history_contract;

    #[test]
    fn the_memory_history_honours_the_history_contract() {
        history_contract(MemoryHistory::default);
    }

    #[test]
    fn each_open_workspace_gets_an_empty_history() {
        let location = WorkspaceLocation::new("/Users/moi/Notes").unwrap();
        let history = MemoryHistories.open(&location).unwrap();
        let note = NotePath::parse("a.md").unwrap();
        assert!(history.versions(&note).unwrap().is_empty());
    }
}
