//! Les préférences survivent à un redémarrage.

use application::{Preferences, StoreError, WorkspaceLocation};
use infrastructure::JsonPreferences;
use tempfile::TempDir;

#[test]
fn no_workspace_is_remembered_at_first_launch() {
    let dir = TempDir::new().unwrap();
    let preferences = JsonPreferences::new(dir.path().join("prefs/preferences.json"));
    assert_eq!(preferences.last_workspace().unwrap(), None);
}

#[test]
fn remembered_workspace_is_read_back_after_restart() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("prefs/preferences.json");
    let location = WorkspaceLocation::new("/Users/moi/Notes").unwrap();
    JsonPreferences::new(file.clone())
        .remember_workspace(&location)
        .unwrap();
    assert_eq!(
        JsonPreferences::new(file).last_workspace().unwrap(),
        Some(location)
    );
}

#[test]
fn damaged_preferences_do_not_block_the_launch() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("preferences.json");
    std::fs::write(&file, "{ pas du json").unwrap();
    let preferences = JsonPreferences::new(file);
    assert_eq!(preferences.last_workspace().unwrap(), None);
    let location = WorkspaceLocation::new("/Users/moi/Notes").unwrap();
    preferences.remember_workspace(&location).unwrap();
    assert_eq!(preferences.last_workspace().unwrap(), Some(location));
}

#[test]
fn preferences_that_cannot_be_read_are_reported() {
    let dir = TempDir::new().unwrap();
    let preferences = JsonPreferences::new(dir.path().to_path_buf());
    assert!(matches!(
        preferences.last_workspace(),
        Err(StoreError::Unavailable(_))
    ));
}

#[test]
fn preferences_that_cannot_be_written_are_reported() {
    let dir = TempDir::new().unwrap();
    let blocking_file = dir.path().join("pas-un-dossier");
    std::fs::write(&blocking_file, "").unwrap();
    let preferences = JsonPreferences::new(blocking_file.join("preferences.json"));
    let location = WorkspaceLocation::new("/Users/moi/Notes").unwrap();
    assert!(matches!(
        preferences.remember_workspace(&location),
        Err(StoreError::Unavailable(_))
    ));
}

#[test]
fn an_empty_remembered_location_means_no_workspace() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("preferences.json");
    std::fs::write(&file, r#"{ "last_workspace": "" }"#).unwrap();
    assert_eq!(JsonPreferences::new(file).last_workspace().unwrap(), None);
}

#[test]
fn preferences_written_before_the_workspace_rename_are_still_read() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("preferences.json");
    std::fs::write(&file, r#"{ "last_library": "/Users/moi/Notes" }"#).unwrap();
    assert_eq!(
        JsonPreferences::new(file).last_workspace().unwrap(),
        Some(WorkspaceLocation::new("/Users/moi/Notes").unwrap())
    );
}
