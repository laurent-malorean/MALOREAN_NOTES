//! Tests de contrat des gestes en attente : joués à l'identique sur le faux en mémoire et sur
//! les gestes rangés sur le disque.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::NotePath;

use crate::{Gesture, GestureId, GestureStep, PendingGestures};

fn note(text: &str) -> NotePath {
    NotePath::parse(text).unwrap_or_else(|e| unreachable!("{e}"))
}

fn rewrite(path: &str, content: &str) -> GestureStep {
    GestureStep::Rewrite {
        note: note(path),
        content: content.to_owned(),
    }
}

fn trash(path: &str) -> GestureStep {
    GestureStep::Trash { note: note(path) }
}

/// Joue tout le contrat ; `empty` fabrique des gestes en attente vides à chaque appel.
pub fn pending_gestures_contract<P: PendingGestures>(empty: impl Fn() -> P) {
    nothing_is_pending_at_first(&empty());
    a_kept_gesture_is_given_back_whole(&empty());
    gestures_come_back_oldest_first(&empty());
    an_ended_gesture_is_forgotten(&empty());
    an_unknown_gesture_ends_without_error(&empty());
}

fn nothing_is_pending_at_first(pending: &impl PendingGestures) {
    assert!(pending.interrupted().unwrap().is_empty());
}

fn a_kept_gesture_is_given_back_whole(pending: &impl PendingGestures) {
    let text = "---\ntype: crm\n---\n# « Clients »\n\n\"guillemets\" \\ et\ttabulation\r\nfin\n";
    let gesture = Gesture::new(vec![
        rewrite("Été/clients/personnes/jean.md", text),
        trash("clients/entreprises/acme.md"),
        rewrite("a.md", ""),
    ]);
    let id = pending.begin(&gesture).unwrap();
    assert_eq!(pending.interrupted().unwrap(), [(id, gesture)]);
}

fn gestures_come_back_oldest_first(pending: &impl PendingGestures) {
    let first = pending.begin(&Gesture::new(vec![trash("a.md")])).unwrap();
    let second = pending.begin(&Gesture::new(vec![trash("b.md")])).unwrap();
    let third = pending.begin(&Gesture::new(vec![trash("c.md")])).unwrap();
    assert!(first < second && second < third);
    let ids: Vec<GestureId> = pending
        .interrupted()
        .unwrap()
        .into_iter()
        .map(|(id, _)| id)
        .collect();
    assert_eq!(ids, [first, second, third]);
}

fn an_ended_gesture_is_forgotten(pending: &impl PendingGestures) {
    let first = pending.begin(&Gesture::new(vec![trash("a.md")])).unwrap();
    let second = pending.begin(&Gesture::new(vec![trash("b.md")])).unwrap();
    pending.end(first).unwrap();
    let left = pending.interrupted().unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].0, second);
    // Un numéro ne sert pas deux fois, même une fois le geste oublié.
    let third = pending.begin(&Gesture::new(vec![trash("c.md")])).unwrap();
    assert!(third > second);
}

fn an_unknown_gesture_ends_without_error(pending: &impl PendingGestures) {
    pending.end(GestureId(99)).unwrap();
    assert!(pending.interrupted().unwrap().is_empty());
}
