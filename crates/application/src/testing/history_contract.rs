//! Tests de contrat de l'historique : joués à l'identique sur le faux en mémoire et sur
//! l'historique rangé sur le disque.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::history::Version;
use domain::{Folder, NotePath};

use crate::{History, HistoryPlace, StoreError};

use HistoryPlace::{Trash, Workspace};

fn note(text: &str) -> NotePath {
    NotePath::parse(text).unwrap_or_else(|e| unreachable!("{e}"))
}

fn folder(text: &str) -> Folder {
    Folder::parse(text).unwrap_or_else(|e| unreachable!("{e}"))
}

fn version(id: &str) -> Version {
    Version::parse(id).unwrap_or_else(|e| unreachable!("{e}"))
}

/// Les identifiants des versions de la note, du plus ancien au plus récent.
fn ids(history: &impl History, path: &str) -> Vec<String> {
    let mut versions = history.versions(&note(path)).unwrap();
    versions.sort_unstable();
    versions.iter().map(Version::id).collect()
}

/// Joue tout le contrat ; `empty_history` fabrique un historique vide à chaque appel.
pub fn history_contract<H: History>(empty_history: impl Fn() -> H) {
    a_note_without_history_has_no_version(&empty_history());
    a_kept_version_gives_back_its_text(&empty_history());
    versions_of_the_same_minute_are_kept_apart(&empty_history());
    each_note_has_its_own_history(&empty_history());
    a_missing_version_is_not_found(&empty_history());
    removed_versions_are_forgotten(&empty_history());
    the_history_follows_a_renamed_note(&empty_history());
    the_history_of_a_folder_follows_it(&empty_history());
    the_history_goes_to_the_trash_and_comes_back(&empty_history());
    emptying_the_trash_forgets_its_history(&empty_history());
    a_note_without_history_moves_without_error(&empty_history());
}

fn a_note_without_history_has_no_version(history: &impl History) {
    assert!(history.versions(&note("a.md")).unwrap().is_empty());
}

fn a_kept_version_gives_back_its_text(history: &impl History) {
    let v = version("2026-11-18 14h30");
    history
        .write_version(&note("Travail/lundi.md"), &v, "# Lundi\nà faire")
        .unwrap();
    assert_eq!(ids(history, "Travail/lundi.md"), ["2026-11-18 14h30"]);
    assert_eq!(
        history.read_version(&note("Travail/lundi.md"), &v).unwrap(),
        "# Lundi\nà faire"
    );
}

fn versions_of_the_same_minute_are_kept_apart(history: &impl History) {
    history
        .write_version(&note("a.md"), &version("2026-11-18 14h30"), "un")
        .unwrap();
    history
        .write_version(&note("a.md"), &version("2026-11-18 14h30 (2)"), "deux")
        .unwrap();
    assert_eq!(
        ids(history, "a.md"),
        ["2026-11-18 14h30", "2026-11-18 14h30 (2)"]
    );
    let second = history
        .read_version(&note("a.md"), &version("2026-11-18 14h30 (2)"))
        .unwrap();
    assert_eq!(second, "deux");
}

fn each_note_has_its_own_history(history: &impl History) {
    history
        .write_version(&note("a.md"), &version("2026-11-18 14h30"), "a")
        .unwrap();
    history
        .write_version(&note("Travail/a.md"), &version("2026-11-18 14h31"), "b")
        .unwrap();
    assert_eq!(ids(history, "a.md"), ["2026-11-18 14h30"]);
    assert_eq!(ids(history, "Travail/a.md"), ["2026-11-18 14h31"]);
}

fn a_missing_version_is_not_found(history: &impl History) {
    let v = version("2026-11-18 14h30");
    assert_eq!(
        history.read_version(&note("a.md"), &v),
        Err(StoreError::VersionNotFound(v))
    );
}

fn removed_versions_are_forgotten(history: &impl History) {
    for id in ["2026-11-16 10h00", "2026-11-17 10h00", "2026-11-18 10h00"] {
        history
            .write_version(&note("a.md"), &version(id), id)
            .unwrap();
    }
    let gone = [version("2026-11-16 10h00"), version("2026-11-18 10h00")];
    history.remove_versions(&note("a.md"), &gone).unwrap();
    history.remove_versions(&note("b.md"), &gone).unwrap();
    assert_eq!(ids(history, "a.md"), ["2026-11-17 10h00"]);
    history
        .remove_versions(&note("a.md"), &[version("2026-11-17 10h00")])
        .unwrap();
    assert!(ids(history, "a.md").is_empty());
}

fn the_history_follows_a_renamed_note(history: &impl History) {
    let (old, new) = (note("Travail/lundi.md"), note("Perso/mardi.md"));
    history
        .write_version(&old, &version("2026-11-18 10h00"), "lundi")
        .unwrap();
    history
        .write_version(&new, &version("2026-11-17 10h00"), "déjà là")
        .unwrap();
    history
        .move_note_versions((Workspace, &old), (Workspace, &new))
        .unwrap();
    assert!(ids(history, "Travail/lundi.md").is_empty());
    assert_eq!(
        ids(history, "Perso/mardi.md"),
        ["2026-11-17 10h00", "2026-11-18 10h00"]
    );
    let moved = history
        .read_version(&new, &version("2026-11-18 10h00"))
        .unwrap();
    assert_eq!(moved, "lundi");
}

fn the_history_of_a_folder_follows_it(history: &impl History) {
    let v = version("2026-11-18 10h00");
    for path in [
        "Travail/a.md",
        "Travail/Projets/b.md",
        "Travaux/c.md",
        "Travail/d.md",
    ] {
        history.write_version(&note(path), &v, path).unwrap();
    }
    history
        .move_note_versions(
            (Workspace, &note("Travail/d.md")),
            (Trash, &note("Travail/d.md")),
        )
        .unwrap();
    history
        .move_folder_versions(
            (Workspace, &folder("Travail")),
            (Workspace, &folder("Perso/Boulot")),
        )
        .unwrap();
    assert_eq!(ids(history, "Perso/Boulot/a.md"), ["2026-11-18 10h00"]);
    assert_eq!(
        ids(history, "Perso/Boulot/Projets/b.md"),
        ["2026-11-18 10h00"]
    );
    assert!(ids(history, "Travail/a.md").is_empty());
    assert!(ids(history, "Travail/Projets/b.md").is_empty());
    assert_eq!(ids(history, "Travaux/c.md"), ["2026-11-18 10h00"]);
    assert!(ids(history, "Perso/Boulot/d.md").is_empty());
    history
        .move_note_versions((Trash, &note("Travail/d.md")), (Workspace, &note("d.md")))
        .unwrap();
    assert_eq!(ids(history, "d.md"), ["2026-11-18 10h00"]);
}

fn the_history_goes_to_the_trash_and_comes_back(history: &impl History) {
    let v = version("2026-11-18 10h00");
    history
        .write_version(&note("Travail/a.md"), &v, "a")
        .unwrap();
    history.write_version(&note("Perso/b.md"), &v, "b").unwrap();
    history
        .move_note_versions(
            (Workspace, &note("Travail/a.md")),
            (Trash, &note("Travail/a-2.md")),
        )
        .unwrap();
    history
        .move_folder_versions((Workspace, &folder("Perso")), (Trash, &folder("Perso")))
        .unwrap();
    assert!(ids(history, "Travail/a.md").is_empty());
    assert!(ids(history, "Travail/a-2.md").is_empty());
    assert!(ids(history, "Perso/b.md").is_empty());
    history
        .move_note_versions((Trash, &note("Travail/a-2.md")), (Workspace, &note("a.md")))
        .unwrap();
    history
        .move_folder_versions((Trash, &folder("Perso")), (Workspace, &folder("Perso 2")))
        .unwrap();
    assert_eq!(history.read_version(&note("a.md"), &v).unwrap(), "a");
    assert_eq!(
        history.read_version(&note("Perso 2/b.md"), &v).unwrap(),
        "b"
    );
}

fn emptying_the_trash_forgets_its_history(history: &impl History) {
    let v = version("2026-11-18 10h00");
    history.write_version(&note("a.md"), &v, "a").unwrap();
    history.write_version(&note("b.md"), &v, "b").unwrap();
    history
        .move_note_versions((Workspace, &note("a.md")), (Trash, &note("a.md")))
        .unwrap();
    history.empty_trash().unwrap();
    history.empty_trash().unwrap();
    history
        .move_note_versions((Trash, &note("a.md")), (Workspace, &note("a.md")))
        .unwrap();
    assert!(ids(history, "a.md").is_empty());
    assert_eq!(ids(history, "b.md"), ["2026-11-18 10h00"]);
}

fn a_note_without_history_moves_without_error(history: &impl History) {
    history
        .move_note_versions((Workspace, &note("a.md")), (Trash, &note("a.md")))
        .unwrap();
    history
        .move_folder_versions((Workspace, &folder("Vide")), (Trash, &folder("Vide")))
        .unwrap();
    assert!(ids(history, "a.md").is_empty());
}
