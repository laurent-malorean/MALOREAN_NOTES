//! Les gestes en attente en mémoire : ils ne survivent pas à la session. C'est ce que garde une
//! session sans disque, et le faux des tests de contrat (voir `testing::gestures_contract`).

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use crate::{
    Gesture, GestureId, PendingGestures, PendingGesturesOpener, StoreError, WorkspaceLocation,
};

/// Gestes en attente rangés en mémoire, aucun à la création.
#[derive(Debug, Default)]
pub struct MemoryPendingGestures {
    state: Mutex<State>,
}

#[derive(Debug, Default)]
struct State {
    next: u64,
    gestures: BTreeMap<GestureId, Gesture>,
}

impl MemoryPendingGestures {
    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl PendingGestures for MemoryPendingGestures {
    fn begin(&self, gesture: &Gesture) -> Result<GestureId, StoreError> {
        let mut state = self.state();
        state.next += 1;
        let id = GestureId(state.next);
        state.gestures.insert(id, gesture.clone());
        Ok(id)
    }

    fn end(&self, id: GestureId) -> Result<(), StoreError> {
        self.state().gestures.remove(&id);
        Ok(())
    }

    fn interrupted(&self) -> Result<Vec<(GestureId, Gesture)>, StoreError> {
        Ok(self
            .state()
            .gestures
            .iter()
            .map(|(id, gesture)| (*id, gesture.clone()))
            .collect())
    }
}

/// Ouvre de nouveaux gestes en attente, en mémoire, pour chaque espace de travail ouvert.
#[derive(Debug, Default)]
pub struct MemoryPendingGesturesOpener;

impl PendingGesturesOpener for MemoryPendingGesturesOpener {
    fn open(&self, _location: &WorkspaceLocation) -> Result<Arc<dyn PendingGestures>, StoreError> {
        Ok(Arc::new(MemoryPendingGestures::default()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::gestures_contract::pending_gestures_contract;

    #[test]
    fn the_memory_gestures_honour_the_contract() {
        pending_gestures_contract(MemoryPendingGestures::default);
    }

    #[test]
    fn each_workspace_opened_gets_no_pending_gesture() {
        let location = WorkspaceLocation::new("/Users/moi/Notes").unwrap();
        let first = MemoryPendingGesturesOpener.open(&location).unwrap();
        first.begin(&Gesture::default()).unwrap();
        assert!(
            MemoryPendingGesturesOpener
                .open(&location)
                .unwrap()
                .interrupted()
                .unwrap()
                .is_empty()
        );
    }
}
