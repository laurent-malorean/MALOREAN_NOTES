//! Tests de contrat : joués à l'identique sur le faux et sur le vrai stockage.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::{FileName, Folder, NotePath};

use crate::{NoteStore, StoreError};

fn name(text: &str) -> NotePath {
    NotePath::parse(text).unwrap_or_else(|e| unreachable!("{e}"))
}

fn file(text: &str) -> FileName {
    FileName::parse(text).unwrap_or_else(|e| unreachable!("{e}"))
}

fn root() -> Folder {
    Folder::root()
}

/// Joue tout le contrat ; `empty_store` fabrique une bibliothèque vide à chaque appel.
pub fn note_store_contract<S: NoteStore>(empty_store: impl Fn() -> S) {
    written_note_can_be_read_back(&empty_store());
    rewriting_replaces_content_and_advances_modified(&empty_store());
    list_returns_every_note(&empty_store());
    missing_note_is_not_found(&empty_store());
    names_are_those_of_every_note(&empty_store());
    renamed_note_moves_to_its_new_name(&empty_store());
    rename_refuses_a_taken_name(&empty_store());
    created_folders_are_listed_at_any_depth(&empty_store());
    a_folder_lists_its_own_notes_only(&empty_store());
    a_note_is_renamed_inside_its_folder(&empty_store());
    creating_an_existing_folder_is_refused(&empty_store());
    creating_a_folder_in_a_missing_parent_is_refused(&empty_store());
    a_moved_folder_takes_its_notes_and_sub_folders(&empty_store());
    a_folder_is_renamed_by_moving_it_beside_itself(&empty_store());
    moving_onto_an_existing_folder_is_refused(&empty_store());
    moving_a_missing_folder_or_into_a_missing_one_is_refused(&empty_store());
    a_moved_note_leaves_its_folder_for_the_new_one(&empty_store());
    moving_a_note_onto_a_taken_name_is_refused(&empty_store());
    moving_a_missing_note_or_into_a_missing_folder_is_refused(&empty_store());
    rewriting_while_keeping_the_date_changes_only_the_content(&empty_store());
    rewriting_a_missing_note_while_keeping_the_date_is_refused(&empty_store());
}

fn rewriting_while_keeping_the_date_changes_only_the_content(store: &impl NoteStore) {
    store.write(&name("x.md"), "avant").unwrap();
    store.write(&name("y.md"), "autre").unwrap();
    let before = store.read(&name("x.md")).unwrap().modified;
    store.write_keeping_date(&name("x.md"), "après").unwrap();
    let after = store.read(&name("x.md")).unwrap();
    assert_eq!(after.content, "après");
    assert_eq!(after.modified, before);
}

fn rewriting_a_missing_note_while_keeping_the_date_is_refused(store: &impl NoteStore) {
    assert_eq!(
        store.write_keeping_date(&name("absente.md"), "x"),
        Err(StoreError::NotFound(name("absente.md")))
    );
    assert!(store.names(&root()).unwrap().is_empty());
}

fn a_moved_note_leaves_its_folder_for_the_new_one(store: &impl NoteStore) {
    store.create_folder(&folder("a")).unwrap();
    store.create_folder(&folder("a/b")).unwrap();
    store.write(&name("x.md"), "X").unwrap();
    store.move_note(&name("x.md"), &name("a/b/x.md")).unwrap();
    assert!(store.names(&root()).unwrap().is_empty());
    assert_eq!(store.read(&name("a/b/x.md")).unwrap().content, "X");
}

fn moving_a_note_onto_a_taken_name_is_refused(store: &impl NoteStore) {
    store.create_folder(&folder("a")).unwrap();
    store.write(&name("x.md"), "racine").unwrap();
    store.write(&name("a/x.md"), "dossier").unwrap();
    assert_eq!(
        store.move_note(&name("x.md"), &name("a/x.md")),
        Err(StoreError::AlreadyExists(name("a/x.md")))
    );
    assert_eq!(store.read(&name("x.md")).unwrap().content, "racine");
    assert_eq!(store.read(&name("a/x.md")).unwrap().content, "dossier");
}

fn moving_a_missing_note_or_into_a_missing_folder_is_refused(store: &impl NoteStore) {
    store.create_folder(&folder("a")).unwrap();
    assert_eq!(
        store.move_note(&name("absente.md"), &name("a/absente.md")),
        Err(StoreError::NotFound(name("absente.md")))
    );
    store.write(&name("x.md"), "X").unwrap();
    assert_eq!(
        store.move_note(&name("x.md"), &name("z/x.md")),
        Err(StoreError::FolderNotFound(folder("z")))
    );
    assert_eq!(store.read(&name("x.md")).unwrap().content, "X");
}

fn folder(path: &str) -> Folder {
    Folder::parse(path).unwrap_or_else(|e| unreachable!("{e}"))
}

fn sorted_folders(store: &impl NoteStore) -> Vec<String> {
    let mut folders: Vec<String> = store
        .folders()
        .unwrap()
        .iter()
        .map(Folder::to_path)
        .collect();
    folders.sort();
    folders
}

fn created_folders_are_listed_at_any_depth(store: &impl NoteStore) {
    store.create_folder(&folder("Travail")).unwrap();
    store.create_folder(&folder("Travail/Réunions")).unwrap();
    store.create_folder(&folder("Perso")).unwrap();
    assert_eq!(
        sorted_folders(store),
        ["Perso", "Travail", "Travail/Réunions"]
    );
}

fn a_folder_lists_its_own_notes_only(store: &impl NoteStore) {
    store.create_folder(&folder("a")).unwrap();
    store.create_folder(&folder("a/b")).unwrap();
    store.write(&name("a/x.md"), "X").unwrap();
    store.write(&name("a/b/y.md"), "Y").unwrap();
    store.write(&name("z.md"), "Z").unwrap();
    let listed: Vec<_> = store
        .list(&folder("a"))
        .unwrap()
        .into_iter()
        .map(|n| n.path)
        .collect();
    assert_eq!(listed, [name("a/x.md")]);
    assert_eq!(store.names(&folder("a")).unwrap(), [file("x.md")]);
    assert_eq!(store.names(&root()).unwrap(), [file("z.md")]);
    assert_eq!(store.read(&name("a/b/y.md")).unwrap().content, "Y");
}

fn a_note_is_renamed_inside_its_folder(store: &impl NoteStore) {
    store.create_folder(&folder("a")).unwrap();
    store.write(&name("a/x.md"), "X").unwrap();
    store.rename(&name("a/x.md"), &file("y.md")).unwrap();
    assert_eq!(store.names(&folder("a")).unwrap(), [file("y.md")]);
    assert!(store.names(&root()).unwrap().is_empty());
}

fn creating_an_existing_folder_is_refused(store: &impl NoteStore) {
    store.create_folder(&folder("a")).unwrap();
    assert_eq!(
        store.create_folder(&folder("a")),
        Err(StoreError::FolderAlreadyExists(folder("a")))
    );
}

fn creating_a_folder_in_a_missing_parent_is_refused(store: &impl NoteStore) {
    assert_eq!(
        store.create_folder(&folder("absent/a")),
        Err(StoreError::FolderNotFound(folder("absent")))
    );
    assert!(sorted_folders(store).is_empty());
}

fn a_moved_folder_takes_its_notes_and_sub_folders(store: &impl NoteStore) {
    store.create_folder(&folder("a")).unwrap();
    store.create_folder(&folder("a/b")).unwrap();
    store.write(&name("a/b/n.md"), "N").unwrap();
    store.create_folder(&folder("x")).unwrap();
    store.move_folder(&folder("a"), &folder("x/a")).unwrap();
    assert_eq!(sorted_folders(store), ["x", "x/a", "x/a/b"]);
    assert_eq!(store.read(&name("x/a/b/n.md")).unwrap().content, "N");
}

fn a_folder_is_renamed_by_moving_it_beside_itself(store: &impl NoteStore) {
    store.create_folder(&folder("travail")).unwrap();
    store.write(&name("travail/n.md"), "N").unwrap();
    store
        .move_folder(&folder("travail"), &folder("Travail"))
        .unwrap();
    assert_eq!(sorted_folders(store), ["Travail"]);
    assert_eq!(store.read(&name("Travail/n.md")).unwrap().content, "N");
}

fn moving_onto_an_existing_folder_is_refused(store: &impl NoteStore) {
    store.create_folder(&folder("a")).unwrap();
    store.create_folder(&folder("b")).unwrap();
    assert_eq!(
        store.move_folder(&folder("a"), &folder("b")),
        Err(StoreError::FolderAlreadyExists(folder("b")))
    );
    assert_eq!(sorted_folders(store), ["a", "b"]);
}

fn moving_a_missing_folder_or_into_a_missing_one_is_refused(store: &impl NoteStore) {
    store.create_folder(&folder("a")).unwrap();
    assert_eq!(
        store.move_folder(&folder("absent"), &folder("b")),
        Err(StoreError::FolderNotFound(folder("absent")))
    );
    assert_eq!(
        store.move_folder(&folder("a"), &folder("absent/a")),
        Err(StoreError::FolderNotFound(folder("absent")))
    );
    assert_eq!(sorted_folders(store), ["a"]);
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
        .list(&root())
        .unwrap()
        .into_iter()
        .map(|n| n.path)
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

fn names_are_those_of_every_note(store: &impl NoteStore) {
    store.write(&name("a.md"), "A").unwrap();
    store.write(&name("b.md"), "B").unwrap();
    let mut names = store.names(&root()).unwrap();
    names.sort();
    assert_eq!(names, [file("a.md"), file("b.md")]);
}

fn renamed_note_moves_to_its_new_name(store: &impl NoteStore) {
    store.write(&name("a.md"), "A").unwrap();
    store.rename(&name("a.md"), &file("b.md")).unwrap();
    assert_eq!(store.names(&root()).unwrap(), [file("b.md")]);
    assert_eq!(store.read(&name("b.md")).unwrap().content, "A");
}

fn rename_refuses_a_taken_name(store: &impl NoteStore) {
    store.write(&name("a.md"), "A").unwrap();
    store.write(&name("b.md"), "B").unwrap();
    assert_eq!(
        store.rename(&name("a.md"), &file("b.md")),
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
