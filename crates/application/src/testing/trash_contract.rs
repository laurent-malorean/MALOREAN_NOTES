//! Tests de contrat de la corbeille : joués à l'identique sur le faux et sur le vrai stockage.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::{Folder, NotePath};

use crate::{NoteStore, StoreError};

fn note(text: &str) -> NotePath {
    NotePath::parse(text).unwrap_or_else(|e| unreachable!("{e}"))
}

fn folder(path: &str) -> Folder {
    Folder::parse(path).unwrap_or_else(|e| unreachable!("{e}"))
}

/// Les chemins des notes de la corbeille, triés.
fn trashed_notes(store: &impl NoteStore) -> Vec<String> {
    let mut paths: Vec<_> = store
        .trash()
        .unwrap()
        .notes
        .into_iter()
        .map(|n| n.path.to_path())
        .collect();
    paths.sort();
    paths
}

/// Les chemins des dossiers de la corbeille, triés.
fn trashed_folders(store: &impl NoteStore) -> Vec<String> {
    let mut paths: Vec<_> = store
        .trash()
        .unwrap()
        .folders
        .iter()
        .map(Folder::to_path)
        .collect();
    paths.sort();
    paths
}

/// Une bibliothèque avec `Travail/lundi.md` et `Travail/Réunions/mardi.md`.
fn with_work_notes(store: &impl NoteStore) {
    store.create_folder(&folder("Travail")).unwrap();
    store.create_folder(&folder("Travail/Réunions")).unwrap();
    store.write(&note("Travail/lundi.md"), "# Lundi").unwrap();
    store
        .write(&note("Travail/Réunions/mardi.md"), "# Mardi")
        .unwrap();
}

/// Joue tout le contrat de la corbeille ; `empty_store` fabrique une bibliothèque vide à chaque appel.
pub fn trash_contract<S: NoteStore>(empty_store: impl Fn() -> S) {
    a_new_library_has_an_empty_trash(&empty_store());
    a_trashed_note_goes_to_its_original_path_in_the_trash(&empty_store());
    trashing_a_missing_note_or_onto_a_taken_place_is_refused(&empty_store());
    a_trashed_folder_goes_whole(&empty_store());
    trashing_a_missing_folder_or_onto_a_taken_place_is_refused(&empty_store());
    a_restored_note_goes_back_and_recreates_its_folders(&empty_store());
    restoring_a_missing_note_or_onto_a_taken_name_is_refused(&empty_store());
    a_restored_folder_goes_back_whole(&empty_store());
    restoring_onto_an_existing_folder_only_drops_an_empty_trashed_folder(&empty_store());
    restoring_a_missing_folder_is_refused(&empty_store());
    emptying_the_trash_deletes_everything_in_it(&empty_store());
}

fn a_new_library_has_an_empty_trash(store: &impl NoteStore) {
    assert!(trashed_notes(store).is_empty());
    assert!(trashed_folders(store).is_empty());
    store.empty_trash().unwrap();
}

fn a_trashed_note_goes_to_its_original_path_in_the_trash(store: &impl NoteStore) {
    with_work_notes(store);
    let lundi = note("Travail/lundi.md");
    store.trash_note(&lundi, &lundi).unwrap();
    assert_eq!(store.read(&lundi), Err(StoreError::NotFound(lundi.clone())));
    assert_eq!(trashed_notes(store), ["Travail/lundi.md"]);
    assert_eq!(trashed_folders(store), ["Travail"]);
    assert_eq!(store.trash().unwrap().notes[0].content, "# Lundi");
    assert!(store.folders().unwrap().contains(&folder("Travail")));
}

fn trashing_a_missing_note_or_onto_a_taken_place_is_refused(store: &impl NoteStore) {
    with_work_notes(store);
    let absent = note("Travail/absente.md");
    assert_eq!(
        store.trash_note(&absent, &absent),
        Err(StoreError::NotFound(absent.clone()))
    );
    let lundi = note("Travail/lundi.md");
    store.trash_note(&lundi, &lundi).unwrap();
    store.write(&lundi, "# Encore lundi").unwrap();
    assert_eq!(
        store.trash_note(&lundi, &lundi),
        Err(StoreError::AlreadyExists(lundi.clone()))
    );
    assert_eq!(store.read(&lundi).unwrap().content, "# Encore lundi");
}

fn a_trashed_folder_goes_whole(store: &impl NoteStore) {
    with_work_notes(store);
    store
        .trash_folder(&folder("Travail"), &folder("Travail"))
        .unwrap();
    assert!(store.folders().unwrap().is_empty());
    assert_eq!(trashed_folders(store), ["Travail", "Travail/Réunions"]);
    assert_eq!(
        trashed_notes(store),
        ["Travail/Réunions/mardi.md", "Travail/lundi.md"]
    );
}

fn trashing_a_missing_folder_or_onto_a_taken_place_is_refused(store: &impl NoteStore) {
    with_work_notes(store);
    assert_eq!(
        store.trash_folder(&folder("Absent"), &folder("Absent")),
        Err(StoreError::FolderNotFound(folder("Absent")))
    );
    let lundi = note("Travail/lundi.md");
    store.trash_note(&lundi, &lundi).unwrap();
    assert_eq!(
        store.trash_folder(&folder("Travail"), &folder("Travail")),
        Err(StoreError::FolderAlreadyExists(folder("Travail")))
    );
    assert!(store.folders().unwrap().contains(&folder("Travail")));
}

fn a_restored_note_goes_back_and_recreates_its_folders(store: &impl NoteStore) {
    with_work_notes(store);
    store
        .trash_folder(&folder("Travail"), &folder("Travail"))
        .unwrap();
    let mardi = note("Travail/Réunions/mardi.md");
    store.restore_note(&mardi, &mardi).unwrap();
    assert_eq!(store.read(&mardi).unwrap().content, "# Mardi");
    assert_eq!(trashed_notes(store), ["Travail/lundi.md"]);
    // Le dossier vidé ne reste pas dans la corbeille ; celui qui contient encore une note, si.
    assert_eq!(trashed_folders(store), ["Travail"]);
    let lundi = note("Travail/lundi.md");
    store.restore_note(&lundi, &lundi).unwrap();
    assert!(trashed_folders(store).is_empty());
}

fn restoring_a_missing_note_or_onto_a_taken_name_is_refused(store: &impl NoteStore) {
    with_work_notes(store);
    let lundi = note("Travail/lundi.md");
    assert_eq!(
        store.restore_note(&lundi, &lundi),
        Err(StoreError::NotFound(lundi.clone()))
    );
    store.trash_note(&lundi, &lundi).unwrap();
    store.write(&lundi, "# Nouveau lundi").unwrap();
    assert_eq!(
        store.restore_note(&lundi, &lundi),
        Err(StoreError::AlreadyExists(lundi.clone()))
    );
    let elsewhere = note("Travail/lundi-2.md");
    store.restore_note(&lundi, &elsewhere).unwrap();
    assert_eq!(store.read(&elsewhere).unwrap().content, "# Lundi");
    assert_eq!(store.read(&lundi).unwrap().content, "# Nouveau lundi");
}

fn a_restored_folder_goes_back_whole(store: &impl NoteStore) {
    with_work_notes(store);
    store
        .trash_folder(&folder("Travail"), &folder("Travail"))
        .unwrap();
    store
        .restore_folder(&folder("Travail"), &folder("Travail"))
        .unwrap();
    assert!(
        store
            .folders()
            .unwrap()
            .contains(&folder("Travail/Réunions"))
    );
    assert_eq!(
        store
            .read(&note("Travail/Réunions/mardi.md"))
            .unwrap()
            .content,
        "# Mardi"
    );
    assert!(trashed_folders(store).is_empty());
    assert!(trashed_notes(store).is_empty());
}

fn restoring_onto_an_existing_folder_only_drops_an_empty_trashed_folder(store: &impl NoteStore) {
    store.create_folder(&folder("Vide")).unwrap();
    store
        .trash_folder(&folder("Vide"), &folder("Vide"))
        .unwrap();
    store.create_folder(&folder("Vide")).unwrap();
    store
        .restore_folder(&folder("Vide"), &folder("Vide"))
        .unwrap();
    assert!(trashed_folders(store).is_empty());

    with_work_notes(store);
    store
        .trash_folder(&folder("Travail"), &folder("Travail"))
        .unwrap();
    store.create_folder(&folder("Travail")).unwrap();
    assert_eq!(
        store.restore_folder(&folder("Travail"), &folder("Travail")),
        Err(StoreError::FolderAlreadyExists(folder("Travail")))
    );
    assert_eq!(trashed_folders(store), ["Travail", "Travail/Réunions"]);
}

fn restoring_a_missing_folder_is_refused(store: &impl NoteStore) {
    assert_eq!(
        store.restore_folder(&folder("Absent"), &folder("Absent")),
        Err(StoreError::FolderNotFound(folder("Absent")))
    );
}

fn emptying_the_trash_deletes_everything_in_it(store: &impl NoteStore) {
    with_work_notes(store);
    store
        .trash_folder(&folder("Travail"), &folder("Travail"))
        .unwrap();
    store.empty_trash().unwrap();
    assert!(trashed_notes(store).is_empty());
    assert!(trashed_folders(store).is_empty());
    assert!(store.folders().unwrap().is_empty());
}
