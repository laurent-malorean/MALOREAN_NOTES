//! Jouer un outil sur un autre espace de travail que l'espace ouvert (fiche 0074).
//!
//! Les outils passent par les mêmes méthodes que l'interface, qui lisent toutes l'espace ouvert
//! par `Session::opened`. Plutôt que de recopier chaque outil pour un espace donné, ou de changer
//! l'espace de l'utilisateur, `opened` est redirigé vers l'espace visé pour le seul fil qui joue
//! l'outil : l'interface, sur ses propres fils, ne voit rien. La redirection se défait à la fin de
//! l'appel, même s'il panique.

use std::cell::RefCell;

use super::OpenWorkspaceState;

thread_local! {
    /// L'espace visé par l'outil que ce fil est en train de jouer, s'il n'est pas l'espace ouvert.
    static REDIRECTED: RefCell<Option<OpenWorkspaceState>> = const { RefCell::new(None) };
}

/// L'espace vers lequel ce fil est redirigé, s'il l'est.
pub(super) fn current() -> Option<OpenWorkspaceState> {
    REDIRECTED.with(|redirected| redirected.borrow().clone())
}

/// Remet la redirection d'avant quand l'appel se termine.
struct Restore(Option<OpenWorkspaceState>);

impl Drop for Restore {
    fn drop(&mut self) {
        REDIRECTED.with(|redirected| *redirected.borrow_mut() = self.0.take());
    }
}

/// Joue `call` avec `state` pour espace ouvert, sur ce fil seulement.
pub(super) fn run<T>(state: OpenWorkspaceState, call: impl FnOnce() -> T) -> T {
    let before = REDIRECTED.with(|redirected| redirected.borrow_mut().replace(state));
    let _restore = Restore(before);
    call()
}

#[cfg(test)]
mod tests {
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;
    use crate::Session;

    /// L'état d'un espace de travail ouvert sous ce nom.
    fn state(name: &str) -> OpenWorkspaceState {
        let session = Session::new(
            Arc::new(FakeOpener::new(Arc::new(InMemoryNoteStore::default()))),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        session.add_workspace(name, "/Users/moi/Notes").unwrap();
        session.opened().unwrap()
    }

    fn name_of(state: Option<OpenWorkspaceState>) -> Option<String> {
        state.map(|state| state.name.as_str().to_owned())
    }

    #[test]
    fn nothing_is_redirected_outside_a_call() {
        assert!(current().is_none());
    }

    #[test]
    fn a_call_sees_its_workspace_and_leaves_nothing_behind() {
        let seen = run(state("Travail"), || name_of(current()));
        assert_eq!(seen.as_deref(), Some("Travail"));
        assert!(current().is_none());
    }

    #[test]
    fn a_nested_call_gives_back_the_workspace_of_the_outer_one() {
        // Les deux états sont faits avant : `opened` serait déjà redirigé dans l'appel.
        let (notes, travail) = (state("Notes"), state("Travail"));
        let (inner, outer) = run(notes, || {
            let inner = run(travail, || name_of(current()));
            (inner, name_of(current()))
        });
        assert_eq!(inner.as_deref(), Some("Travail"));
        assert_eq!(outer.as_deref(), Some("Notes"));
        assert!(current().is_none());
    }

    #[test]
    fn a_call_that_panics_still_leaves_nothing_behind() {
        let outcome = catch_unwind(AssertUnwindSafe(|| {
            run(state("Travail"), || panic!("l'outil a échoué"))
        }));
        assert!(outcome.is_err());
        assert!(current().is_none());
    }

    #[test]
    fn another_thread_does_not_see_the_redirection() {
        let seen = run(state("Travail"), || {
            std::thread::spawn(|| current().is_none()).join().unwrap()
        });
        assert!(seen);
    }
}
