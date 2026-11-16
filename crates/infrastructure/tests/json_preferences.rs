//! Les préférences survivent à un redémarrage.

use application::{LibraryLocation, Preferences};
use infrastructure::JsonPreferences;
use tempfile::TempDir;

#[test]
fn no_library_is_remembered_at_first_launch() {
    let dir = TempDir::new().unwrap();
    let preferences = JsonPreferences::new(dir.path().join("prefs/preferences.json"));
    assert_eq!(preferences.last_library().unwrap(), None);
}

#[test]
fn remembered_library_is_read_back_after_restart() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("prefs/preferences.json");
    let location = LibraryLocation("/Users/moi/Notes".into());
    JsonPreferences::new(file.clone())
        .remember_library(&location)
        .unwrap();
    assert_eq!(
        JsonPreferences::new(file).last_library().unwrap(),
        Some(location)
    );
}

#[test]
fn damaged_preferences_do_not_block_the_launch() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("preferences.json");
    std::fs::write(&file, "{ pas du json").unwrap();
    let preferences = JsonPreferences::new(file);
    assert_eq!(preferences.last_library().unwrap(), None);
    let location = LibraryLocation("/Users/moi/Notes".into());
    preferences.remember_library(&location).unwrap();
    assert_eq!(preferences.last_library().unwrap(), Some(location));
}
