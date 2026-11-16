//! Contrat des pièces jointes : joué à l'identique sur le faux et sur le vrai stockage.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::{AttachmentName, FileName, Folder, NotePath};

use crate::{NoteStore, StoreError};

fn note(text: &str) -> NotePath {
    NotePath::parse(text).unwrap_or_else(|e| unreachable!("{e}"))
}

fn attachment(text: &str) -> AttachmentName {
    AttachmentName::existing(text).unwrap_or_else(|| unreachable!("{text}"))
}

fn names(store: &impl NoteStore, of: &str) -> Vec<String> {
    let mut names: Vec<_> = store
        .attachment_names(&note(of))
        .unwrap()
        .iter()
        .map(AttachmentName::to_name)
        .collect();
    names.sort();
    names
}

/// Joue tout le contrat ; `empty_store` fabrique une bibliothèque vide à chaque appel.
pub fn attachment_contract<S: NoteStore>(empty_store: impl Fn() -> S) {
    a_note_without_attachment_folder_has_no_attachment(&empty_store());
    a_written_attachment_is_listed_and_can_be_located(&empty_store());
    an_attachment_needs_an_existing_note(&empty_store());
    an_attachment_never_overwrites_another(&empty_store());
    a_missing_attachment_cannot_be_located(&empty_store());
    attachments_follow_a_renamed_or_moved_note(&empty_store());
    notes_of_the_same_name_in_two_folders_keep_their_own_attachments(&empty_store());
}

fn a_note_without_attachment_folder_has_no_attachment(store: &impl NoteStore) {
    store.write(&note("a.md"), "# A").unwrap();
    assert!(names(store, "a.md").is_empty());
}

fn a_written_attachment_is_listed_and_can_be_located(store: &impl NoteStore) {
    store.write(&note("a.md"), "# A").unwrap();
    store
        .write_attachment(&note("a.md"), &attachment("vue mer.png"), b"PNG")
        .unwrap();
    store
        .write_attachment(&note("a.md"), &attachment("doc.pdf"), b"PDF")
        .unwrap();
    assert_eq!(names(store, "a.md"), ["doc.pdf", "vue mer.png"]);
    let location = store
        .attachment_location(&note("a.md"), &attachment("doc.pdf"))
        .unwrap();
    assert!(location.as_str().ends_with("doc.pdf"), "{location:?}");
}

fn an_attachment_needs_an_existing_note(store: &impl NoteStore) {
    assert_eq!(
        store.write_attachment(&note("absente.md"), &attachment("a.png"), b"x"),
        Err(StoreError::NotFound(note("absente.md")))
    );
}

fn an_attachment_never_overwrites_another(store: &impl NoteStore) {
    store.write(&note("a.md"), "# A").unwrap();
    store
        .write_attachment(&note("a.md"), &attachment("a.png"), b"first")
        .unwrap();
    assert_eq!(
        store.write_attachment(&note("a.md"), &attachment("a.png"), b"second"),
        Err(StoreError::AttachmentAlreadyExists("a.png".into()))
    );
    assert_eq!(names(store, "a.md"), ["a.png"]);
}

fn a_missing_attachment_cannot_be_located(store: &impl NoteStore) {
    store.write(&note("a.md"), "# A").unwrap();
    assert_eq!(
        store.attachment_location(&note("a.md"), &attachment("x.pdf")),
        Err(StoreError::AttachmentNotFound("x.pdf".into()))
    );
}

fn attachments_follow_a_renamed_or_moved_note(store: &impl NoteStore) {
    store.write(&note("a.md"), "# A").unwrap();
    store
        .write_attachment(&note("a.md"), &attachment("a.png"), b"x")
        .unwrap();
    let renamed = FileName::parse("b.md").unwrap();
    store.rename(&note("a.md"), &renamed).unwrap();
    assert_eq!(names(store, "b.md"), ["a.png"]);
    store
        .create_folder(&Folder::parse("Travail").unwrap())
        .unwrap();
    store
        .move_note(&note("b.md"), &note("Travail/b.md"))
        .unwrap();
    assert_eq!(names(store, "Travail/b.md"), ["a.png"]);
    assert!(names(store, "b.md").is_empty());
}

fn notes_of_the_same_name_in_two_folders_keep_their_own_attachments(store: &impl NoteStore) {
    store
        .create_folder(&Folder::parse("Travail").unwrap())
        .unwrap();
    store.write(&note("a.md"), "# A").unwrap();
    store.write(&note("Travail/a.md"), "# A").unwrap();
    store
        .write_attachment(&note("Travail/a.md"), &attachment("t.png"), b"x")
        .unwrap();
    assert!(names(store, "a.md").is_empty());
    assert_eq!(names(store, "Travail/a.md"), ["t.png"]);
}

#[cfg(test)]
mod tests {
    use crate::testing::InMemoryNoteStore;

    #[test]
    fn in_memory_store_honours_the_attachment_contract() {
        super::attachment_contract(InMemoryNoteStore::default);
    }
}
