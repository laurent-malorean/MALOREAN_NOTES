//! Un agenda 12 emporte ses événements, archives comprises, quand il est mis à la corbeille,
//! restauré, déplacé ou renommé ; le nom de fichier d'un événement ne change jamais.

use domain::{Fingerprint, Folder, NotePath};

use super::fixture::*;
use crate::testing::{InMemoryNoteStore, indexed};
use crate::use_cases::{ListShownFolders, MoveNote, RenameNote, SaveNote, Trash};
use crate::{MemoryHistory, NoteStore};

fn folder(text: &str) -> Folder {
    Folder::parse(text).unwrap()
}

fn paths_under(store: &InMemoryNoteStore, root: &str) -> Vec<String> {
    let mut paths: Vec<String> = store
        .folders()
        .unwrap()
        .into_iter()
        .chain([Folder::root()])
        .filter(|f| f.is_within(&folder(root)) || root.is_empty())
        .flat_map(|f| store.list(&f).unwrap())
        .map(|n| n.path.to_path())
        .collect();
    paths.sort();
    paths
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

const WHOLE: [&str; 7] = [
    "pro/salons.md",
    "pro/salons/archives/salon-passe.md",
    "pro/salons/archives/salon-tres-passe.md",
    "pro/salons/audit-iso.md",
    "pro/salons/notes.md",
    "pro/salons/salon-embedded-world.md",
    "pro/salons/sans-mois.md",
];

#[test]
fn an_agenda_goes_to_the_trash_with_its_events_open_or_closed() {
    let store = workspace();
    // La note ordinaire du dossier ne part pas : le dossier n'est pas fait que d'événements.
    let at = Trash::new(&store).put_note(&agenda()).unwrap();
    assert_eq!(at, agenda());
    let mut gone: Vec<&str> = WHOLE.to_vec();
    gone.retain(|p| *p != "pro/salons/notes.md");
    gone.push("pro/salons/vivatech.md");
    gone.sort_unstable();
    assert_eq!(trashed(&store), gone);
    assert_eq!(paths_under(&store, "pro/salons"), ["pro/salons/notes.md"]);
}

#[test]
fn an_agenda_whose_folder_holds_only_events_takes_the_whole_folder() {
    let store = workspace();
    store
        .trash_note(&path("pro/salons/notes.md"), &path("pro/salons/notes.md"))
        .unwrap();
    Trash::new(&store).put_note(&agenda()).unwrap();
    assert!(!store.folders().unwrap().contains(&folder("pro/salons")));
    assert!(
        !store
            .folders()
            .unwrap()
            .contains(&folder("pro/salons/archives"))
    );
}

#[test]
fn a_restored_agenda_brings_back_its_events_in_the_grid_and_in_the_archives() {
    let store = workspace();
    let trash = Trash::new(&store);
    let at = trash.put_note(&agenda()).unwrap();
    let back = trash.restore_note(&at).unwrap();
    assert_eq!(back, agenda());
    assert_eq!(
        paths_under(&store, "pro/salons"),
        [
            "pro/salons/archives/salon-passe.md",
            "pro/salons/archives/salon-tres-passe.md",
            "pro/salons/audit-iso.md",
            "pro/salons/notes.md",
            "pro/salons/salon-embedded-world.md",
            "pro/salons/sans-mois.md",
            "pro/salons/vivatech.md",
        ]
    );
    assert!(trashed(&store).is_empty());
}

#[test]
fn an_agenda_moves_with_its_events_and_its_archives() {
    let store = workspace();
    store.create_folder(&folder("Perso")).unwrap();
    store
        .trash_note(&path("pro/salons/notes.md"), &path("pro/salons/notes.md"))
        .unwrap();
    let moved = MoveNote::new(&store)
        .execute(&agenda(), &folder("Perso"))
        .unwrap();
    assert_eq!(moved, path("Perso/salons.md"));
    assert_eq!(
        paths_under(&store, "Perso"),
        [
            "Perso/salons.md",
            "Perso/salons/archives/salon-passe.md",
            "Perso/salons/archives/salon-tres-passe.md",
            "Perso/salons/audit-iso.md",
            "Perso/salons/salon-embedded-world.md",
            "Perso/salons/sans-mois.md",
            "Perso/salons/vivatech.md",
        ]
    );
    assert!(!store.folders().unwrap().contains(&folder("pro/salons")));
}

#[test]
fn an_agenda_cannot_go_into_its_own_folder_of_events() {
    let store = workspace();
    let refused = MoveNote::new(&store).execute(&agenda(), &folder("pro/salons/archives"));
    assert!(refused.is_err());
}

#[test]
fn renaming_an_agenda_takes_its_events_to_the_folder_of_its_new_name() {
    let store = workspace();
    store
        .trash_note(&path("pro/salons/notes.md"), &path("pro/salons/notes.md"))
        .unwrap();
    let history = MemoryHistory::default();
    let renamed = RenameNote::new(&store, &history, &clock())
        .execute(&agenda(), "Foires")
        .unwrap();
    assert_eq!(renamed.path, path("pro/foires.md"));
    assert_eq!(renamed.content, "---\ntype: agenda-12\n---\n# Foires\n");
    assert!(
        paths_under(&store, "pro/foires")
            .contains(&"pro/foires/archives/salon-passe.md".to_owned())
    );
    assert!(paths_under(&store, "pro/foires").contains(&"pro/foires/vivatech.md".to_owned()));
    assert!(!store.folders().unwrap().contains(&folder("pro/salons")));
}

#[test]
fn renaming_an_event_changes_its_title_and_never_its_file_name() {
    let store = workspace();
    let history = MemoryHistory::default();
    let renamed = RenameNote::new(&store, &history, &clock())
        .execute(&path(AUDIT_PATH), "Audit qualité")
        .unwrap();
    assert_eq!(renamed.path, path(AUDIT_PATH));
    assert_eq!(
        text(&store, AUDIT_PATH),
        "---\ntype: agenda-12-evenement\nmois: 1\njour: 15\n---\n# Audit qualité\n"
    );
}

#[test]
fn saving_an_event_from_the_editor_never_renames_its_file() {
    let store = workspace();
    let content = AUDIT.replace("# Audit ISO", "# Autre titre\n\nTexte écrit.");
    let saved = SaveNote::new(&store, &clock())
        .execute(&path(AUDIT_PATH), &content, &Fingerprint::of(AUDIT))
        .unwrap();
    assert_eq!(saved.path, path(AUDIT_PATH));
    assert_eq!(text(&store, AUDIT_PATH), content);
}

#[test]
fn the_folder_of_the_events_is_not_shown_in_the_list_of_folders_unless_it_holds_a_note() {
    let store = workspace();
    let shown = |store: &InMemoryNoteStore| -> Vec<String> {
        ListShownFolders::new(store, &indexed(store))
            .execute()
            .unwrap()
            .iter()
            .map(Folder::to_path)
            .collect()
    };
    assert_eq!(shown(&store), ["pro", "pro/salons", "pro/salons/archives"]);
    store
        .trash_note(&path("pro/salons/notes.md"), &path("pro/salons/notes.md"))
        .unwrap();
    store
        .trash_note(
            &path("pro/salons/sans-mois.md"),
            &path("pro/salons/sans-mois.md"),
        )
        .unwrap();
    assert_eq!(shown(&store), ["pro"]);
}

#[test]
fn an_event_is_indexed_with_its_agenda_for_container() {
    let store = workspace();
    let index = indexed(&store);
    let notes = crate::NoteIndex::all_notes(&index).unwrap();
    let find = |note: &str| {
        notes
            .iter()
            .find(|n| n.path() == &NotePath::parse(note).unwrap())
            .unwrap()
            .clone()
    };
    assert_eq!(find(EMBEDDED_PATH).container(), Some(&agenda()));
    assert_eq!(find(OLD_PATH).container(), Some(&agenda()));
    assert_eq!(find(AGENDA).container(), None);
}
