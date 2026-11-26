//! Un CRM part à la corbeille et en revient avec ses fiches (fiche 0091).

use super::*;
use crate::testing::InMemoryNoteStore;

const CRM: &str = "---\ntype: crm\n---\n# CRM\n";
const ACTION: &str = "---\ntype: crm-action\n---\n# Action\n";
const PERSON: &str = "---\ntype: crm-personne\n---\n# Personne\n";
const COMPANY: &str = "---\ntype: crm-entreprise\n---\n# Entreprise\n";
const PROJECT: &str = "---\ntype: crm-projet\n---\n# Projet\n";

fn note(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

fn folder(text: &str) -> Folder {
    Folder::parse(text).unwrap()
}

/// Deux CRM voisins, chacun avec des fiches de chaque sorte.
fn workspace() -> InMemoryNoteStore {
    InMemoryNoteStore::with_notes(&[
        ("toto/crm1.md", CRM),
        ("toto/crm1/actions/a.md", ACTION),
        ("toto/crm1/personnes/p.md", PERSON),
        ("toto/crm1/entreprises/e.md", COMPANY),
        ("toto/crm1/projets/j.md", PROJECT),
        ("toto/crm2.md", CRM),
        ("toto/crm2/actions/b.md", ACTION),
        ("toto/ordinaire.md", "# Ordinaire"),
    ])
}

fn trashed(store: &InMemoryNoteStore) -> Vec<String> {
    let mut paths: Vec<String> = store
        .trash()
        .unwrap()
        .notes
        .iter()
        .map(|n| n.path.to_path())
        .collect();
    paths.sort();
    paths
}

fn kept(store: &InMemoryNoteStore, folder_path: &str) -> Vec<String> {
    let mut paths: Vec<String> = store
        .folders()
        .unwrap()
        .into_iter()
        .chain([Folder::root()])
        .filter(|f| f.is_within(&folder(folder_path)))
        .flat_map(|f| store.list(&f).unwrap())
        .map(|n| n.path.to_path())
        .collect();
    paths.sort();
    paths
}

#[test]
fn a_crm_goes_to_the_trash_with_all_its_fiches_and_its_folder() {
    let store = workspace();
    let at = Trash::new(&store).put_note(&note("toto/crm1.md")).unwrap();
    assert_eq!(at, note("toto/crm1.md"));
    assert_eq!(
        trashed(&store),
        [
            "toto/crm1.md",
            "toto/crm1/actions/a.md",
            "toto/crm1/entreprises/e.md",
            "toto/crm1/personnes/p.md",
            "toto/crm1/projets/j.md",
        ]
    );
    assert!(!store.folders().unwrap().contains(&folder("toto/crm1")));
}

#[test]
fn only_the_folder_of_that_crm_goes() {
    let store = workspace();
    Trash::new(&store).put_note(&note("toto/crm1.md")).unwrap();
    assert_eq!(
        kept(&store, "toto"),
        [
            "toto/crm2.md",
            "toto/crm2/actions/b.md",
            "toto/ordinaire.md"
        ]
    );
}

#[test]
fn a_crm_without_fiches_goes_like_a_note() {
    let store = InMemoryNoteStore::with_notes(&[("c.md", CRM), ("x.md", "# X")]);
    Trash::new(&store).put_note(&note("c.md")).unwrap();
    assert_eq!(trashed(&store), ["c.md"]);
    assert_eq!(kept(&store, ""), ["x.md"]);
}

#[test]
fn an_empty_folder_of_the_fiches_goes_with_the_crm() {
    let store = InMemoryNoteStore::with_notes(&[("c.md", CRM)]);
    store.create_folder(&folder("c")).unwrap();
    Trash::new(&store).put_note(&note("c.md")).unwrap();
    assert!(!store.folders().unwrap().contains(&folder("c")));
}

#[test]
fn an_ordinary_note_in_the_folder_stays_with_the_folder_and_only_the_fiches_go() {
    let store = workspace();
    store
        .write(&note("toto/crm1/ma-note.md"), "# Ma note")
        .unwrap();
    Trash::new(&store).put_note(&note("toto/crm1.md")).unwrap();
    assert_eq!(
        trashed(&store),
        [
            "toto/crm1.md",
            "toto/crm1/actions/a.md",
            "toto/crm1/entreprises/e.md",
            "toto/crm1/personnes/p.md",
            "toto/crm1/projets/j.md",
        ]
    );
    assert!(
        kept(&store, "toto/crm1")
            .iter()
            .eq(["toto/crm1/ma-note.md"].iter())
    );
}

#[test]
fn a_crm_inside_the_folder_of_another_keeps_its_own_fiches() {
    let store = InMemoryNoteStore::with_notes(&[
        ("c.md", CRM),
        ("c/actions/a.md", ACTION),
        ("c/d.md", CRM),
        ("c/d/actions/x.md", ACTION),
    ]);
    Trash::new(&store).put_note(&note("c.md")).unwrap();
    assert_eq!(trashed(&store), ["c.md", "c/actions/a.md"]);
    assert_eq!(kept(&store, "c"), ["c/d.md", "c/d/actions/x.md"]);
}

#[test]
fn the_nested_crm_alone_takes_its_whole_folder() {
    let store = InMemoryNoteStore::with_notes(&[
        ("c.md", CRM),
        ("c/actions/a.md", ACTION),
        ("c/d.md", CRM),
        ("c/d/actions/x.md", ACTION),
    ]);
    Trash::new(&store).put_note(&note("c/d.md")).unwrap();
    assert_eq!(trashed(&store), ["c/d.md", "c/d/actions/x.md"]);
    assert!(!store.folders().unwrap().contains(&folder("c/d")));
    assert!(store.read(&note("c/actions/a.md")).is_ok());
}

#[test]
fn a_crm_restored_brings_back_its_fiches_and_the_trash_is_empty() {
    let store = workspace();
    let trash = Trash::new(&store);
    let at = trash.put_note(&note("toto/crm1.md")).unwrap();
    let back = trash.restore_note(&at).unwrap();
    assert_eq!(back, note("toto/crm1.md"));
    assert_eq!(
        kept(&store, "toto/crm1"),
        [
            "toto/crm1/actions/a.md",
            "toto/crm1/entreprises/e.md",
            "toto/crm1/personnes/p.md",
            "toto/crm1/projets/j.md",
        ]
    );
    assert_eq!(store.read(&back).unwrap().content, CRM);
    let left = trash.contents().unwrap();
    assert!(left.notes.is_empty());
    assert!(left.folders.is_empty());
}

#[test]
fn an_emptied_subfolder_comes_back_too() {
    let store = InMemoryNoteStore::with_notes(&[("c.md", CRM), ("c/actions/a.md", ACTION)]);
    store.create_folder(&folder("c/personnes")).unwrap();
    let trash = Trash::new(&store);
    trash.put_note(&note("c.md")).unwrap();
    trash.restore_note(&note("c.md")).unwrap();
    assert!(store.folders().unwrap().contains(&folder("c/personnes")));
    assert!(trash.contents().unwrap().folders.is_empty());
}

#[test]
fn an_ordinary_note_stays_where_it_was_when_the_crm_comes_back() {
    let store = workspace();
    store
        .write(&note("toto/crm1/ma-note.md"), "# Ma note")
        .unwrap();
    let trash = Trash::new(&store);
    trash.put_note(&note("toto/crm1.md")).unwrap();
    trash.restore_note(&note("toto/crm1.md")).unwrap();
    assert_eq!(kept(&store, "toto/crm1").len(), 5);
    assert!(trash.contents().unwrap().notes.is_empty());
}

#[test]
fn a_crm_trashed_twice_takes_the_same_suffix_as_its_folder() {
    let store = workspace();
    let trash = Trash::new(&store);
    trash.put_note(&note("toto/crm1.md")).unwrap();
    store.write(&note("toto/crm1.md"), CRM).unwrap();
    store
        .write(&note("toto/crm1/actions/neuve.md"), ACTION)
        .unwrap();
    let at = trash.put_note(&note("toto/crm1.md")).unwrap();
    assert_eq!(at, note("toto/crm1-2.md"));
    assert!(trashed(&store).contains(&"toto/crm1-2/actions/neuve.md".to_owned()));
    assert!(trashed(&store).contains(&"toto/crm1/actions/a.md".to_owned()));
}

#[test]
fn restoring_the_second_crm_brings_back_its_own_fiches_only() {
    let store = workspace();
    let trash = Trash::new(&store);
    trash.put_note(&note("toto/crm1.md")).unwrap();
    store.write(&note("toto/crm1.md"), CRM).unwrap();
    store
        .write(&note("toto/crm1/actions/neuve.md"), ACTION)
        .unwrap();
    let at = trash.put_note(&note("toto/crm1.md")).unwrap();
    let back = trash.restore_note(&at).unwrap();
    assert_eq!(back, note("toto/crm1-2.md"));
    assert_eq!(
        kept(&store, "toto/crm1-2"),
        ["toto/crm1-2/actions/neuve.md"]
    );
    assert_eq!(trashed(&store).len(), 5);
}

#[test]
fn a_crm_restored_under_a_new_name_takes_its_fiches_to_the_folder_of_that_name() {
    let store = workspace();
    let trash = Trash::new(&store);
    trash.put_note(&note("toto/crm1.md")).unwrap();
    store.write(&note("toto/crm1.md"), CRM).unwrap();
    let back = trash.restore_note(&note("toto/crm1.md")).unwrap();
    assert_eq!(back, note("toto/crm1-2.md"));
    assert_eq!(
        kept(&store, "toto/crm1-2/actions"),
        ["toto/crm1-2/actions/a.md"]
    );
    assert!(trashed(&store).is_empty());
}

#[test]
fn restoring_a_fiche_alone_does_not_bring_back_the_crm() {
    let store = workspace();
    let trash = Trash::new(&store);
    trash.put_note(&note("toto/crm1.md")).unwrap();
    trash.restore_note(&note("toto/crm1/actions/a.md")).unwrap();
    assert!(store.read(&note("toto/crm1/actions/a.md")).is_ok());
    assert!(store.read(&note("toto/crm1.md")).is_err());
}

#[test]
fn restoring_the_whole_trash_brings_back_each_fiche_once() {
    let store = workspace();
    let trash = Trash::new(&store);
    trash.put_note(&note("toto/crm1.md")).unwrap();
    trash.restore_folder(&Folder::root()).unwrap();
    assert!(trashed(&store).is_empty());
    assert_eq!(kept(&store, "toto/crm1").len(), 4);
    assert!(store.read(&note("toto/crm1.md")).is_ok());
}

#[test]
fn the_number_of_fiches_that_go_with_a_crm_is_told_before() {
    let store = workspace();
    let trash = Trash::new(&store);
    assert_eq!(trash.fiches_with(&note("toto/crm1.md")).unwrap(), 4);
    assert_eq!(trash.fiches_with(&note("toto/crm2.md")).unwrap(), 1);
    assert_eq!(trash.fiches_with(&note("toto/ordinaire.md")).unwrap(), 0);
}

#[test]
fn counting_the_fiches_of_a_missing_note_is_reported() {
    let store = InMemoryNoteStore::default();
    assert_eq!(
        Trash::new(&store).fiches_with(&note("absente.md")),
        Err(AppError::NoteNotFound(note("absente.md")))
    );
}
