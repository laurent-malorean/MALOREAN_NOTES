//! Surveillance d'un vrai dossier : les changements faits hors de l'application arrivent.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::sync::Arc;
use std::sync::mpsc::{Receiver, channel};
use std::time::Duration;

use application::use_cases::{ActionChange, ChangeAction, ChangeCanvas, ReplaceInNote};
use application::{
    History, KeepingStore, NoteStore, StoreError, WorkspaceChange, WorkspaceLocation,
    WorkspaceWatcher,
};
use domain::NotePath;
use domain::canvas::CardKind;
use domain::canvas_edit::NewCard;
use domain::crm::Reference;
use infrastructure::{FsHistory, FsNoteStore, FsWorkspaceWatcher, SystemClock};

/// Le disque du Mac annonce les changements avec un peu de retard.
const ARRIVAL: Duration = Duration::from_secs(10);
/// Temps pendant lequel on vérifie qu'un changement ignoré n'arrive pas.
const SILENCE: Duration = Duration::from_millis(1500);

fn watch(
    folder: &tempfile::TempDir,
) -> (Box<dyn application::Watching>, Receiver<WorkspaceChange>) {
    let (sender, received) = channel();
    let location = WorkspaceLocation::new(folder.path().to_str().unwrap()).unwrap();
    let watching = FsWorkspaceWatcher
        .watch(
            &location,
            Arc::new(move |change| {
                let _sent = sender.send(change);
            }),
        )
        .unwrap();
    // FSEvents ne voit pas les changements faits dans l'instant qui suit le départ.
    std::thread::sleep(Duration::from_millis(500));
    (watching, received)
}

/// Attend un changement qui annonce `note` ; ceux qui n'en parlent pas sont sautés.
/// Chaque attente dure au plus [`ARRIVAL`] : sans annonce, la surveillance a échoué.
fn announces(received: &Receiver<WorkspaceChange>, note: &str) -> bool {
    let wanted = NotePath::parse(note).unwrap();
    while let Ok(change) = received.recv_timeout(ARRIVAL) {
        if change.notes.contains(&wanted) {
            return true;
        }
    }
    false
}

#[test]
fn a_note_written_outside_the_app_is_announced() {
    let folder = tempfile::tempdir().unwrap();
    let (_watching, received) = watch(&folder);
    fs::write(folder.path().join("courses.md"), "# Courses").unwrap();
    assert!(announces(&received, "courses.md"));
}

#[test]
fn a_note_in_a_folder_changed_then_deleted_is_announced() {
    let folder = tempfile::tempdir().unwrap();
    fs::create_dir(folder.path().join("Travail")).unwrap();
    fs::write(folder.path().join("Travail/lundi.md"), "v1").unwrap();
    let (_watching, received) = watch(&folder);
    fs::remove_file(folder.path().join("Travail/lundi.md")).unwrap();
    assert!(announces(&received, "Travail/lundi.md"));
}

#[test]
fn hidden_files_and_attachments_are_not_announced() {
    let folder = tempfile::tempdir().unwrap();
    fs::create_dir(folder.path().join("voyage.assets")).unwrap();
    let (_watching, received) = watch(&folder);
    fs::write(folder.path().join(".courses.md.enregistrement"), "x").unwrap();
    fs::write(folder.path().join("voyage.assets/mer.png"), "x").unwrap();
    assert!(received.recv_timeout(SILENCE).is_err());
}

#[test]
fn changes_in_a_dependency_folder_are_not_announced() {
    let folder = tempfile::tempdir().unwrap();
    fs::create_dir_all(folder.path().join("Projet/node_modules/paquet")).unwrap();
    let (_watching, received) = watch(&folder);
    fs::write(
        folder.path().join("Projet/node_modules/paquet/README.md"),
        "x",
    )
    .unwrap();
    // La création des dossiers, juste avant le départ, peut encore arriver (sans note) quand
    // la machine est chargée : seule compte l'annonce d'une note.
    while let Ok(change) = received.recv_timeout(SILENCE) {
        assert_eq!(change.notes, []);
    }
}

#[test]
fn nothing_is_announced_once_watching_stops() {
    let folder = tempfile::tempdir().unwrap();
    let (watching, received) = watch(&folder);
    drop(watching);
    fs::write(folder.path().join("courses.md"), "# Courses").unwrap();
    assert!(received.recv_timeout(SILENCE).is_err());
}

#[test]
fn a_missing_folder_cannot_be_watched() {
    let location = WorkspaceLocation::new("/dossier/qui/n-existe/pas").unwrap();
    let result = FsWorkspaceWatcher.watch(&location, Arc::new(|_| {}));
    assert!(
        matches!(result, Err(StoreError::Unavailable(message)) if message.starts_with("surveillance impossible"))
    );
}

#[test]
fn a_watching_shows_its_kind_in_the_logs() {
    let folder = tempfile::tempdir().unwrap();
    let (watching, _received) = watch(&folder);
    assert_eq!(format!("{watching:?}"), "FsWatching");
}

/// L'écran suit le remplacement d'un texte par une IA (fiche 0075) : la note écrite sur le vrai
/// disque est annoncée à l'interface, qui la relit ; la version d'avant est gardée à part.
#[test]
fn a_text_replaced_by_the_tool_is_announced_so_that_the_screen_follows() {
    let folder = tempfile::tempdir().unwrap();
    fs::write(folder.path().join("courses.md"), "# Courses\n- pain\n").unwrap();
    let (_watching, received) = watch(&folder);
    let store = FsNoteStore::new(folder.path().to_path_buf());
    let history = FsHistory::new(folder.path().to_path_buf());
    let note = NotePath::parse("courses.md").unwrap();

    let replaced = ReplaceInNote::new(&store, &history, &SystemClock)
        .execute(&note, "- pain", "- lait", false)
        .unwrap();

    assert!(announces(&received, "courses.md"));
    assert_eq!(replaced.path, note);
    assert_eq!(
        fs::read_to_string(folder.path().join("courses.md")).unwrap(),
        "# Courses\n- lait\n"
    );
    let versions = history.versions(&note).unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(
        history.read_version(&note, &versions[0]).unwrap(),
        "# Courses\n- pain\n"
    );
    assert_eq!(store.read(&note).unwrap().content, "# Courses\n- lait\n");
}

/// L'écran suit un canvas changé par une IA (fiche 0079) : le canvas écrit sur le vrai disque est
/// annoncé à l'interface, qui le relit ; le texte d'avant est gardé à part comme version.
#[test]
fn a_canvas_changed_by_the_tools_is_announced_so_that_the_screen_follows() {
    let folder = tempfile::tempdir().unwrap();
    let before = "{\n\t\"nodes\":[],\n\t\"edges\":[]\n}";
    fs::write(folder.path().join("idees.canvas"), before).unwrap();
    let (_watching, received) = watch(&folder);
    let store = FsNoteStore::new(folder.path().to_path_buf());
    let history = FsHistory::new(folder.path().to_path_buf());
    let canvas = NotePath::parse("idees.canvas").unwrap();

    let changed = ChangeCanvas::new(&store, &history, &SystemClock)
        .execute(&canvas, |canvas| {
            canvas.add_card(NewCard {
                kind: CardKind::Text {
                    text: "Bonjour".into(),
                },
                x: 0,
                y: 0,
                width: None,
                height: None,
                color: None,
            })
        })
        .unwrap();

    assert!(announces(&received, "idees.canvas"));
    let written = fs::read_to_string(folder.path().join("idees.canvas")).unwrap();
    assert_eq!(written, changed.saved.text);
    assert!(written.contains(&changed.outcome));
    let versions = history.versions(&canvas).unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(history.read_version(&canvas, &versions[0]).unwrap(), before);
}

/// L'écran suit une action de CRM changée par une IA (fiche 0081) : la fiche écrite sur le vrai
/// disque est annoncée à l'interface, dont la vue CRM ouverte se rafraîchit ; le texte d'avant est
/// gardé à part comme version.
#[test]
fn a_crm_action_changed_by_the_tools_is_announced_so_that_the_screen_follows() {
    let folder = tempfile::tempdir().unwrap();
    fs::create_dir_all(folder.path().join("clients/actions")).unwrap();
    fs::write(
        folder.path().join("clients.md"),
        "---\ntype: crm\n---\n# Clients\n",
    )
    .unwrap();
    let before = "---\ntype: crm-action\nstatut: TODO\ndate: '2026-11-16'\n---\n# Appel\n";
    fs::write(folder.path().join("clients/actions/appel.md"), before).unwrap();
    let (_watching, received) = watch(&folder);
    let store = Arc::new(FsNoteStore::new(folder.path().to_path_buf()));
    let history = Arc::new(FsHistory::new(folder.path().to_path_buf()));
    let keeping = KeepingStore::new(store.clone(), history.clone(), Arc::new(SystemClock));
    let crm = NotePath::parse("clients.md").unwrap();
    let action = NotePath::parse("clients/actions/appel.md").unwrap();

    ChangeAction::new(&keeping, &SystemClock)
        .execute(
            &crm,
            &Reference::to("appel").unwrap(),
            ActionChange::Status("Done".to_owned()),
        )
        .unwrap();

    assert!(announces(&received, "clients/actions/appel.md"));
    assert!(
        fs::read_to_string(folder.path().join("clients/actions/appel.md"))
            .unwrap()
            .contains("statut: Done")
    );
    let versions = history.versions(&action).unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(history.read_version(&action, &versions[0]).unwrap(), before);
}
