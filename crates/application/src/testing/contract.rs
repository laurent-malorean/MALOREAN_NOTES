//! Tests de contrat : joués à l'identique sur le faux et sur le vrai stockage.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::FileName;

use crate::{NoteStore, StoreError};

fn name(text: &str) -> FileName {
    FileName::parse(text).unwrap_or_else(|e| unreachable!("{e}"))
}

/// Joue tout le contrat ; `empty_store` fabrique une bibliothèque vide à chaque appel.
pub fn note_store_contract<S: NoteStore>(empty_store: impl Fn() -> S) {
    written_note_can_be_read_back(&empty_store());
    rewriting_replaces_content_and_advances_modified(&empty_store());
    list_returns_every_note(&empty_store());
    missing_note_is_not_found(&empty_store());
    exists_tells_whether_a_note_is_there(&empty_store());
    renamed_note_moves_to_its_new_name(&empty_store());
    rename_refuses_a_taken_name(&empty_store());
}

fn written_note_can_be_read_back(store: &impl NoteStore) {
    store.write(&name("a.md"), "# A\nété ✅").unwrap();
    assert_eq!(store.read(&name("a.md")).unwrap().content, "# A\nété ✅");
}

fn rewriting_replaces_content_and_advances_modified(store: &impl NoteStore) {
    store.write(&name("a.md"), "v1").unwrap();
    let first = store.read(&name("a.md")).unwrap().modified;
    store.write(&name("a.md"), "v2").unwrap();
    let second = store.read(&name("a.md")).unwrap();
    assert_eq!(second.content, "v2");
    assert!(second.modified >= first);
}

fn list_returns_every_note(store: &impl NoteStore) {
    store.write(&name("a.md"), "A").unwrap();
    store.write(&name("b.md"), "B").unwrap();
    let mut names: Vec<_> = store
        .list()
        .unwrap()
        .into_iter()
        .map(|n| n.file_name)
        .collect();
    names.sort();
    assert_eq!(names, [name("a.md"), name("b.md")]);
}

fn missing_note_is_not_found(store: &impl NoteStore) {
    assert_eq!(
        store.read(&name("absente.md")),
        Err(StoreError::NotFound(name("absente.md")))
    );
}

fn exists_tells_whether_a_note_is_there(store: &impl NoteStore) {
    store.write(&name("a.md"), "A").unwrap();
    assert!(store.exists(&name("a.md")).unwrap());
    assert!(!store.exists(&name("b.md")).unwrap());
}

fn renamed_note_moves_to_its_new_name(store: &impl NoteStore) {
    store.write(&name("a.md"), "A").unwrap();
    store.rename(&name("a.md"), &name("b.md")).unwrap();
    assert!(!store.exists(&name("a.md")).unwrap());
    assert_eq!(store.read(&name("b.md")).unwrap().content, "A");
}

fn rename_refuses_a_taken_name(store: &impl NoteStore) {
    store.write(&name("a.md"), "A").unwrap();
    store.write(&name("b.md"), "B").unwrap();
    assert_eq!(
        store.rename(&name("a.md"), &name("b.md")),
        Err(StoreError::AlreadyExists(name("b.md")))
    );
    assert_eq!(store.read(&name("b.md")).unwrap().content, "B");
}

#[cfg(test)]
mod tests {
    use crate::testing::InMemoryNoteStore;

    #[test]
    fn in_memory_store_honours_the_contract() {
        super::note_store_contract(InMemoryNoteStore::default);
    }
}
