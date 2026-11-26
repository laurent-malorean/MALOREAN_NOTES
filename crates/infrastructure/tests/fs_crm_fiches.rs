//! Un CRM part à la corbeille, en revient et se déplace avec ses fiches, sur le disque (fiche 0091) :
//! le dossier de ses fiches, ses pièces jointes comprises, ne reste jamais derrière.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::path::Path;

use application::NoteStore;
use application::use_cases::{ActionDraft, CreateAction, CreateCrm, MoveNote, ReadCrm, Trash};
use domain::{Folder, NotePath};
use infrastructure::{FsNoteStore, SystemClock};
use tempfile::TempDir;

const CRM: &str = "---\ntype: crm\n---\n# CRM1\n";
const ACTION: &str = "---\ntype: crm-action\n---\n# Action\n![](a.assets/plan.png)\n";

fn note(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

fn folder(text: &str) -> Folder {
    Folder::parse(text).unwrap()
}

/// `generated_mcp/crm1.md` et ses fiches, dont une action avec une pièce jointe.
fn workspace() -> (TempDir, FsNoteStore) {
    let dir = TempDir::new().unwrap();
    let store = FsNoteStore::new(dir.path().to_path_buf());
    store.create_folder(&folder("generated_mcp")).unwrap();
    store.create_folder(&folder("Perso")).unwrap();
    store.write(&note("generated_mcp/crm1.md"), CRM).unwrap();
    store.create_folder(&folder("generated_mcp/crm1")).unwrap();
    store
        .create_folder(&folder("generated_mcp/crm1/actions"))
        .unwrap();
    store
        .write(&note("generated_mcp/crm1/actions/a.md"), ACTION)
        .unwrap();
    let assets = dir.path().join("generated_mcp/crm1/actions/a.assets");
    fs::create_dir(&assets).unwrap();
    fs::write(assets.join("plan.png"), [1, 2, 3]).unwrap();
    (dir, store)
}

fn on_disk(root: &Path, relative: &str) -> bool {
    root.join(relative).exists()
}

#[test]
fn trashing_a_crm_leaves_no_folder_behind() {
    let (dir, store) = workspace();
    Trash::new(&store)
        .put_note(&note("generated_mcp/crm1.md"))
        .unwrap();
    assert!(!on_disk(dir.path(), "generated_mcp/crm1.md"));
    assert!(!on_disk(dir.path(), "generated_mcp/crm1"));
    assert!(on_disk(
        dir.path(),
        ".trash/generated_mcp/crm1/actions/a.assets/plan.png"
    ));
    assert!(on_disk(dir.path(), ".trash/generated_mcp/crm1.md"));
    assert!(
        !store
            .folders()
            .unwrap()
            .contains(&folder("generated_mcp/crm1"))
    );
}

#[test]
fn restoring_a_crm_brings_back_its_folder_and_attachments_and_empties_the_trash() {
    let (dir, store) = workspace();
    let trash = Trash::new(&store);
    trash.put_note(&note("generated_mcp/crm1.md")).unwrap();
    trash.restore_note(&note("generated_mcp/crm1.md")).unwrap();
    assert!(on_disk(dir.path(), "generated_mcp/crm1.md"));
    assert!(on_disk(
        dir.path(),
        "generated_mcp/crm1/actions/a.assets/plan.png"
    ));
    assert!(on_disk(dir.path(), "generated_mcp/crm1/actions/a.md"));
    assert!(trash.contents().unwrap().notes.is_empty());
    assert!(!on_disk(dir.path(), ".trash/generated_mcp"));
}

#[test]
fn an_ordinary_note_in_the_folder_stays_and_the_attachments_follow_their_fiche() {
    let (dir, store) = workspace();
    store
        .write(&note("generated_mcp/crm1/ma-note.md"), "# Ma note")
        .unwrap();
    let trash = Trash::new(&store);
    trash.put_note(&note("generated_mcp/crm1.md")).unwrap();
    assert!(on_disk(dir.path(), "generated_mcp/crm1/ma-note.md"));
    assert!(!on_disk(dir.path(), "generated_mcp/crm1/actions/a.md"));
    assert!(on_disk(
        dir.path(),
        ".trash/generated_mcp/crm1/actions/a.assets/plan.png"
    ));
    trash.restore_note(&note("generated_mcp/crm1.md")).unwrap();
    assert!(on_disk(
        dir.path(),
        "generated_mcp/crm1/actions/a.assets/plan.png"
    ));
    assert!(on_disk(dir.path(), "generated_mcp/crm1/ma-note.md"));
}

#[test]
fn a_moved_crm_takes_its_folder_with_its_attachments() {
    let (dir, store) = workspace();
    let moved = MoveNote::new(&store)
        .execute(&note("generated_mcp/crm1.md"), &folder("Perso"))
        .unwrap();
    assert_eq!(moved, note("Perso/crm1.md"));
    assert!(on_disk(dir.path(), "Perso/crm1/actions/a.assets/plan.png"));
    assert!(!on_disk(dir.path(), "generated_mcp/crm1"));
}

#[test]
fn a_moved_crm_with_an_ordinary_note_in_its_folder_moves_its_fiches_and_their_attachments() {
    let (dir, store) = workspace();
    store
        .write(&note("generated_mcp/crm1/ma-note.md"), "# Ma note")
        .unwrap();
    MoveNote::new(&store)
        .execute(&note("generated_mcp/crm1.md"), &folder("Perso"))
        .unwrap();
    assert!(on_disk(dir.path(), "Perso/crm1/actions/a.assets/plan.png"));
    assert!(on_disk(dir.path(), "Perso/crm1/actions/a.md"));
    assert!(on_disk(dir.path(), "generated_mcp/crm1/ma-note.md"));
    assert!(!on_disk(dir.path(), "generated_mcp/crm1/actions/a.md"));
}

/// Le parcours de l'essai de l'application réelle : un CRM créé puis garni d'actions par les cas
/// d'usage, mis à la corbeille, puis restauré, sur le disque.
#[test]
fn a_crm_made_by_the_use_cases_goes_to_the_trash_and_comes_back_with_its_actions() {
    let dir = TempDir::new().unwrap();
    let store = FsNoteStore::new(dir.path().to_path_buf());
    let clock = SystemClock;
    let path = CreateCrm::new(&store)
        .execute(&Folder::root(), "Essai corbeille")
        .unwrap();
    assert_eq!(path, note("essai-corbeille.md"));
    for title in ["Appeler Paul", "Écrire à Léa"] {
        let draft = ActionDraft {
            title: title.to_owned(),
            ..ActionDraft::default()
        };
        CreateAction::new(&store, &clock)
            .execute(&path, draft)
            .unwrap();
    }
    let titles = |store: &FsNoteStore| {
        let view = ReadCrm::new(store, &clock)
            .execute(&path, &domain::crm::Filters::default(), None)
            .unwrap();
        view.actions.len()
    };
    assert_eq!(titles(&store), 2);
    let trash = Trash::new(&store);
    assert_eq!(trash.fiches_with(&path).unwrap(), 2);
    trash.put_note(&path).unwrap();
    assert!(!on_disk(dir.path(), "essai-corbeille.md"));
    assert!(!on_disk(dir.path(), "essai-corbeille"));
    // Un CRM à la corbeille ne se lit plus : l'essai ne doit pas le relire avant de le restaurer.
    let message = ReadCrm::new(&store, &clock)
        .execute(&path, &domain::crm::Filters::default(), None)
        .unwrap_err()
        .to_string();
    assert_eq!(message, "la note « essai-corbeille.md » n'existe pas");
    trash.restore_note(&path).unwrap();
    assert_eq!(titles(&store), 2);
}
