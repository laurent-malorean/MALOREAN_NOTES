//! Les préférences survivent à un redémarrage, et lisent les fichiers écrits avant les espaces de travail.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use application::testing::preferences_contract::preferences_contract;
use application::{
    Preferences, StoreError, Workspace, WorkspaceLocation, WorkspaceName, Workspaces,
};
use infrastructure::JsonPreferences;
use tempfile::TempDir;

fn workspace(name: &str, folder: &str) -> Workspace {
    Workspace {
        name: WorkspaceName::new(name).unwrap(),
        location: WorkspaceLocation::new(folder).unwrap(),
    }
}

fn one(name: &str, folder: &str) -> Workspaces {
    Workspaces::default()
        .added(workspace(name, folder))
        .unwrap()
}

/// Les préférences écrites dans un fichier qui contient `text`.
fn written(text: &str) -> (TempDir, JsonPreferences) {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("preferences.json");
    std::fs::write(&file, text).unwrap();
    (dir, JsonPreferences::new(file))
}

#[test]
fn the_json_preferences_keep_the_contract() {
    let dir = TempDir::new().unwrap();
    let counter = std::cell::Cell::new(0);
    preferences_contract(|| {
        counter.set(counter.get() + 1);
        JsonPreferences::new(
            dir.path()
                .join(format!("{}/preferences.json", counter.get())),
        )
    });
}

#[test]
fn saved_workspaces_are_read_back_after_restart() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("prefs/preferences.json");
    let workspaces = one("Notes", "/Users/moi/Notes");
    JsonPreferences::new(file.clone())
        .save_workspaces(&workspaces)
        .unwrap();
    assert_eq!(JsonPreferences::new(file).workspaces().unwrap(), workspaces);
}

#[test]
fn the_last_library_becomes_the_first_workspace_named_after_its_folder() {
    let (_dir, preferences) = written(r#"{ "last_library": "/Users/moi/Notes" }"#);
    assert_eq!(
        preferences.workspaces().unwrap(),
        one("Notes", "/Users/moi/Notes")
    );
}

#[test]
fn the_last_workspace_becomes_the_first_workspace_too() {
    let (_dir, preferences) = written(r#"{ "last_workspace": "/Users/moi/Travail" }"#);
    assert_eq!(
        preferences.workspaces().unwrap(),
        one("Travail", "/Users/moi/Travail")
    );
}

#[test]
fn the_old_key_is_no_longer_written() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("preferences.json");
    std::fs::write(&file, r#"{ "last_library": "/Users/moi/Notes" }"#).unwrap();
    let preferences = JsonPreferences::new(file.clone());
    let renamed = preferences
        .workspaces()
        .unwrap()
        .renamed(
            &WorkspaceName::new("Notes").unwrap(),
            WorkspaceName::new("Perso").unwrap(),
        )
        .unwrap();
    preferences.save_workspaces(&renamed).unwrap();
    let text = std::fs::read_to_string(&file).unwrap();
    assert!(!text.contains("last_"), "{text}");
    assert_eq!(preferences.workspaces().unwrap(), renamed);
}

#[test]
fn a_root_folder_is_named_after_its_whole_location() {
    let (_dir, preferences) = written(r#"{ "last_library": "/" }"#);
    assert_eq!(preferences.workspaces().unwrap(), one("/", "/"));
}

#[test]
fn workspaces_with_an_empty_name_or_folder_are_skipped() {
    let (_dir, preferences) = written(
        r#"{ "workspaces": [
            { "name": " ", "folder": "/a" },
            { "name": "Vide", "folder": "" },
            { "name": "Notes", "folder": "/Users/moi/Notes" }
        ], "active": "Notes" }"#,
    );
    assert_eq!(
        preferences.workspaces().unwrap(),
        one("Notes", "/Users/moi/Notes")
    );
}

#[test]
fn an_empty_remembered_location_means_no_workspace() {
    let (_dir, preferences) = written(r#"{ "last_library": "" }"#);
    assert_eq!(preferences.workspaces().unwrap(), Workspaces::default());
}

#[test]
fn damaged_preferences_do_not_block_the_launch() {
    let (_dir, preferences) = written("{ pas du json");
    assert_eq!(preferences.workspaces().unwrap(), Workspaces::default());
    let workspaces = one("Notes", "/Users/moi/Notes");
    preferences.save_workspaces(&workspaces).unwrap();
    assert_eq!(preferences.workspaces().unwrap(), workspaces);
}

#[test]
fn preferences_that_cannot_be_read_are_reported() {
    let dir = TempDir::new().unwrap();
    let preferences = JsonPreferences::new(dir.path().to_path_buf());
    assert!(matches!(
        preferences.workspaces(),
        Err(StoreError::Unavailable(_))
    ));
}

#[test]
fn preferences_that_cannot_be_written_are_reported() {
    let dir = TempDir::new().unwrap();
    let blocking_file = dir.path().join("pas-un-dossier");
    std::fs::write(&blocking_file, "").unwrap();
    let preferences = JsonPreferences::new(blocking_file.join("preferences.json"));
    assert!(matches!(
        preferences.save_workspaces(&one("Notes", "/Users/moi/Notes")),
        Err(StoreError::Unavailable(_))
    ));
}
