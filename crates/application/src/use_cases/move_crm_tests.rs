//! Un CRM déplacé emporte ses fiches (fiche 0091).

use super::*;
use crate::testing::InMemoryNoteStore;

const CRM: &str = "---\ntype: crm\n---\n# CRM\n";
const ACTION: &str = "---\ntype: crm-action\n---\n# Action\n";
const PERSON: &str = "---\ntype: crm-personne\n---\n# Personne\n";

fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

fn folder(text: &str) -> Folder {
    Folder::parse(text).unwrap()
}

fn workspace() -> InMemoryNoteStore {
    let store = InMemoryNoteStore::with_notes(&[
        ("toto/crm1.md", CRM),
        ("toto/crm1/actions/a.md", ACTION),
        ("toto/crm1/personnes/p.md", PERSON),
        ("toto/crm2.md", CRM),
        ("toto/crm2/actions/b.md", ACTION),
    ]);
    store.create_folder(&folder("Perso")).unwrap();
    store
}

fn all(store: &InMemoryNoteStore) -> Vec<String> {
    let mut paths: Vec<String> = store
        .folders()
        .unwrap()
        .into_iter()
        .chain([Folder::root()])
        .flat_map(|f| store.list(&f).unwrap())
        .map(|n| n.path.to_path())
        .collect();
    paths.sort();
    paths
}

#[test]
fn a_crm_moves_with_its_fiches() {
    let store = workspace();
    let moved = MoveNote::new(&store)
        .execute(&path("toto/crm1.md"), &folder("Perso"))
        .unwrap();
    assert_eq!(moved, path("Perso/crm1.md"));
    assert_eq!(
        all(&store),
        [
            "Perso/crm1.md",
            "Perso/crm1/actions/a.md",
            "Perso/crm1/personnes/p.md",
            "toto/crm2.md",
            "toto/crm2/actions/b.md",
        ]
    );
    assert!(!store.folders().unwrap().contains(&folder("toto/crm1")));
}

#[test]
fn a_crm_without_fiches_moves_like_a_note() {
    let store = InMemoryNoteStore::with_notes(&[("c.md", CRM)]);
    store.create_folder(&folder("Perso")).unwrap();
    MoveNote::new(&store)
        .execute(&path("c.md"), &folder("Perso"))
        .unwrap();
    assert_eq!(all(&store), ["Perso/c.md"]);
}

#[test]
fn an_ordinary_note_in_the_folder_stays_and_only_the_fiches_move() {
    let store = workspace();
    store
        .write(&path("toto/crm1/ma-note.md"), "# Ma note")
        .unwrap();
    MoveNote::new(&store)
        .execute(&path("toto/crm1.md"), &folder("Perso"))
        .unwrap();
    assert_eq!(
        all(&store),
        [
            "Perso/crm1.md",
            "Perso/crm1/actions/a.md",
            "Perso/crm1/personnes/p.md",
            "toto/crm1/ma-note.md",
            "toto/crm2.md",
            "toto/crm2/actions/b.md",
        ]
    );
}

#[test]
fn a_taken_name_gives_the_crm_and_its_folder_the_same_suffix() {
    let store = workspace();
    store.write(&path("Perso/crm1.md"), "# Autre").unwrap();
    let moved = MoveNote::new(&store)
        .execute(&path("toto/crm1.md"), &folder("Perso"))
        .unwrap();
    assert_eq!(moved, path("Perso/crm1-2.md"));
    assert!(all(&store).contains(&"Perso/crm1-2/actions/a.md".to_owned()));
    assert!(all(&store).contains(&"Perso/crm1.md".to_owned()));
}

#[test]
fn a_folder_already_named_like_the_crm_gives_it_a_suffix() {
    let store = workspace();
    store.create_folder(&folder("Perso/crm1")).unwrap();
    store.write(&path("Perso/crm1/x.md"), "# X").unwrap();
    let moved = MoveNote::new(&store)
        .execute(&path("toto/crm1.md"), &folder("Perso"))
        .unwrap();
    assert_eq!(moved, path("Perso/crm1-2.md"));
    assert!(all(&store).contains(&"Perso/crm1-2/actions/a.md".to_owned()));
    assert!(all(&store).contains(&"Perso/crm1/x.md".to_owned()));
}

#[test]
fn a_nested_crm_moves_alone_and_keeps_its_own_fiches() {
    let store = InMemoryNoteStore::with_notes(&[
        ("c.md", CRM),
        ("c/actions/a.md", ACTION),
        ("c/d.md", CRM),
        ("c/d/actions/x.md", ACTION),
    ]);
    store.create_folder(&folder("Perso")).unwrap();
    MoveNote::new(&store)
        .execute(&path("c/d.md"), &folder("Perso"))
        .unwrap();
    assert_eq!(
        all(&store),
        [
            "Perso/d.md",
            "Perso/d/actions/x.md",
            "c.md",
            "c/actions/a.md"
        ]
    );
}

#[test]
fn the_outer_crm_moves_with_the_inner_one_left_in_its_folder() {
    let store = InMemoryNoteStore::with_notes(&[
        ("c.md", CRM),
        ("c/actions/a.md", ACTION),
        ("c/d.md", CRM),
        ("c/d/actions/x.md", ACTION),
    ]);
    store.create_folder(&folder("Perso")).unwrap();
    MoveNote::new(&store)
        .execute(&path("c.md"), &folder("Perso"))
        .unwrap();
    assert_eq!(
        all(&store),
        [
            "Perso/c.md",
            "Perso/c/actions/a.md",
            "c/d.md",
            "c/d/actions/x.md"
        ]
    );
}

#[test]
fn a_crm_cannot_move_into_its_own_folder_of_fiches() {
    let store = workspace();
    assert_eq!(
        MoveNote::new(&store).execute(&path("toto/crm1.md"), &folder("toto/crm1/actions")),
        Err(AppError::FolderInsideItself(folder("toto/crm1")))
    );
    assert_eq!(all(&store).len(), 5);
}

#[test]
fn moving_a_crm_onto_its_own_folder_changes_nothing() {
    let store = workspace();
    let moved = MoveNote::new(&store)
        .execute(&path("toto/crm1.md"), &folder("toto"))
        .unwrap();
    assert_eq!(moved, path("toto/crm1.md"));
    assert_eq!(all(&store).len(), 5);
}
