//! Les préférences survivent à un redémarrage, et lisent les fichiers écrits avant les espaces de travail.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use application::testing::preferences_contract::preferences_contract;
use application::{
    Preferences, StoreError, Workspace, WorkspaceLocation, WorkspaceName, Workspaces,
};
use domain::external_servers::ServerName;
use domain::{Folder, MeaningModel, NotePath};
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

#[test]
fn the_chosen_meaning_model_survives_a_restart() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("preferences.json");
    JsonPreferences::new(file.clone())
        .save_meaning_model(MeaningModel::Large)
        .unwrap();
    assert_eq!(
        JsonPreferences::new(file).meaning_model().unwrap(),
        MeaningModel::Large
    );
}

#[test]
fn an_unknown_meaning_model_name_falls_back_to_the_default() {
    let (_dir, preferences) = written(r#"{ "meaning_model": "e5-geant" }"#);
    assert_eq!(preferences.meaning_model().unwrap(), MeaningModel::DEFAULT);
    let (_dir, preferences) = written(r#"{ "meaning_model": "e5-large" }"#);
    assert_eq!(preferences.meaning_model().unwrap(), MeaningModel::Large);
    let (_dir, broken) = written("pas du json");
    assert_eq!(broken.meaning_model().unwrap(), MeaningModel::DEFAULT);
}

#[test]
fn choosing_a_model_keeps_the_workspaces_of_an_old_file() {
    let (_dir, preferences) = written(r#"{ "last_library": "/Users/moi/Notes" }"#);
    preferences.save_meaning_model(MeaningModel::Large).unwrap();
    assert_eq!(
        preferences.workspaces().unwrap(),
        one("Notes", "/Users/moi/Notes")
    );
    assert_eq!(preferences.meaning_model().unwrap(), MeaningModel::Large);
}

#[test]
fn a_file_without_the_allowed_field_allows_no_workspace_and_none_is_written_until_one_is_allowed() {
    let (dir, preferences) = written(
        r#"{ "workspaces": [{ "name": "Notes", "folder": "/Users/moi/Notes" }], "active": "Notes" }"#,
    );
    let workspaces = preferences.workspaces().unwrap();
    assert!(workspaces.allowed().is_empty());

    preferences.save_workspaces(&workspaces).unwrap();
    let text = std::fs::read_to_string(dir.path().join("preferences.json")).unwrap();
    assert!(!text.contains("allowed"), "{text}");

    let name = WorkspaceName::new("Notes").unwrap();
    preferences
        .save_workspaces(&workspaces.allowing(&name).unwrap())
        .unwrap();
    let text = std::fs::read_to_string(dir.path().join("preferences.json")).unwrap();
    assert!(text.contains(r#""allowed": true"#), "{text}");
}

#[test]
fn an_allowed_workspace_with_an_empty_name_is_skipped_and_choosing_a_model_keeps_the_allowed_ones()
{
    let (_dir, preferences) = written(
        r#"{ "workspaces": [
            { "name": " ", "folder": "/a", "allowed": true },
            { "name": "Notes", "folder": "/Users/moi/Notes", "allowed": true },
            { "name": "Travail", "folder": "/Users/moi/Travail" }
        ] }"#,
    );
    preferences.save_meaning_model(MeaningModel::Large).unwrap();
    let workspaces = preferences.workspaces().unwrap();
    let names: Vec<_> = workspaces
        .allowed()
        .iter()
        .map(|w| w.name.as_str().to_owned())
        .collect();
    assert_eq!(names, ["Notes"]);
}

#[test]
fn a_file_without_the_templates_field_gives_no_templates_folder_and_none_is_written_until_one_is_chosen()
 {
    let (dir, preferences) = written(
        r#"{ "workspaces": [{ "name": "Notes", "folder": "/Users/moi/Notes" }], "active": "Notes" }"#,
    );
    let name = WorkspaceName::new("Notes").unwrap();
    let workspaces = preferences.workspaces().unwrap();
    assert_eq!(workspaces.templates_folder(&name), None);

    preferences.save_workspaces(&workspaces).unwrap();
    let text = std::fs::read_to_string(dir.path().join("preferences.json")).unwrap();
    assert!(!text.contains("templates"), "{text}");

    let chosen = workspaces
        .choosing_templates_folder(&name, Some(Folder::parse("Perso/Modèles").unwrap()))
        .unwrap();
    preferences.save_workspaces(&chosen).unwrap();
    let text = std::fs::read_to_string(dir.path().join("preferences.json")).unwrap();
    assert!(text.contains(r#""templates": "Perso/Modèles""#), "{text}");
}

#[test]
fn an_invalid_templates_folder_is_forgotten_and_choosing_a_model_keeps_the_valid_ones() {
    let (_dir, preferences) = written(
        r#"{ "workspaces": [
            { "name": "Notes", "folder": "/Users/moi/Notes", "templates": "../dehors" },
            { "name": "Travail", "folder": "/Users/moi/Travail", "templates": "Modèles" }
        ] }"#,
    );
    preferences.save_meaning_model(MeaningModel::Large).unwrap();
    let workspaces = preferences.workspaces().unwrap();
    let templates = |name: &str| {
        workspaces
            .templates_folder(&WorkspaceName::new(name).unwrap())
            .map(Folder::to_path)
    };
    assert_eq!(templates("Notes"), None);
    assert_eq!(templates("Travail").as_deref(), Some("Modèles"));
}

#[test]
fn a_file_without_the_favorites_field_gives_no_favorites_note_and_none_is_written_until_one_is_chosen()
 {
    let (dir, preferences) = written(
        r#"{ "workspaces": [{ "name": "Notes", "folder": "/Users/moi/Notes" }], "active": "Notes" }"#,
    );
    let name = WorkspaceName::new("Notes").unwrap();
    let workspaces = preferences.workspaces().unwrap();
    assert_eq!(workspaces.favorites_note(&name), None);

    preferences.save_workspaces(&workspaces).unwrap();
    let text = std::fs::read_to_string(dir.path().join("preferences.json")).unwrap();
    assert!(!text.contains("favorites"), "{text}");

    let chosen = workspaces
        .choosing_favorites_note(&name, Some(NotePath::parse("Perso/favoris.md").unwrap()))
        .unwrap();
    preferences.save_workspaces(&chosen).unwrap();
    let text = std::fs::read_to_string(dir.path().join("preferences.json")).unwrap();
    assert!(
        text.contains(r#""favorites": "Perso/favoris.md""#),
        "{text}"
    );
}

#[test]
fn an_invalid_favorites_note_is_forgotten_and_choosing_a_model_keeps_the_valid_ones() {
    let (_dir, preferences) = written(
        r#"{ "workspaces": [
            { "name": "Notes", "folder": "/Users/moi/Notes", "favorites": "../dehors.md" },
            { "name": "Travail", "folder": "/Users/moi/Travail", "favorites": "favoris.md" }
        ] }"#,
    );
    preferences.save_meaning_model(MeaningModel::Large).unwrap();
    let workspaces = preferences.workspaces().unwrap();
    let favorites = |name: &str| {
        workspaces
            .favorites_note(&WorkspaceName::new(name).unwrap())
            .map(NotePath::to_path)
    };
    assert_eq!(favorites("Notes"), None);
    assert_eq!(favorites("Travail").as_deref(), Some("favoris.md"));
}

fn server(name: &str) -> ServerName {
    ServerName::new(name).unwrap()
}

#[test]
fn a_file_without_the_servers_field_allows_no_server_and_none_is_written_until_one_is_allowed() {
    let (dir, preferences) = written(
        r#"{ "workspaces": [{ "name": "Notes", "folder": "/Users/moi/Notes" }], "active": "Notes" }"#,
    );
    assert_eq!(preferences.allowed_servers().unwrap(), []);
    preferences.save_meaning_model(MeaningModel::Large).unwrap();
    preferences.save_voice_language(Some("fr-FR")).unwrap();
    let text = std::fs::read_to_string(dir.path().join("preferences.json")).unwrap();
    assert!(!text.contains("mcp"), "{text}");

    preferences
        .save_allowed_servers(&[server("claude.ai Noota"), server("mon serveur")])
        .unwrap();
    let text = std::fs::read_to_string(dir.path().join("preferences.json")).unwrap();
    assert!(
        text.contains(r#""allowed_mcp_servers": ["#) && text.contains(r#""claude.ai Noota""#),
        "{text}"
    );
    preferences.save_allowed_servers(&[]).unwrap();
    let text = std::fs::read_to_string(dir.path().join("preferences.json")).unwrap();
    assert!(!text.contains("mcp"), "{text}");
}

#[test]
fn the_allowed_servers_survive_a_restart_and_an_illegible_name_is_forgotten() {
    let (dir, preferences) = written(
        r#"{ "allowed_mcp_servers": ["claude.ai Noota", "", "  ", "a\nb", " mon serveur "] }"#,
    );
    assert_eq!(
        preferences.allowed_servers().unwrap(),
        [server("claude.ai Noota"), server("mon serveur")]
    );
    let file = dir.path().join("preferences.json");
    preferences
        .save_allowed_servers(&[server("claude.ai Slack")])
        .unwrap();
    assert_eq!(
        JsonPreferences::new(file).allowed_servers().unwrap(),
        [server("claude.ai Slack")]
    );
}

#[test]
fn the_allowed_servers_are_kept_when_the_workspaces_are_saved_and_never_written_in_one() {
    let (dir, preferences) = written(r#"{ "allowed_mcp_servers": ["claude.ai Noota"] }"#);
    preferences
        .save_workspaces(&one("Notes", "/Users/moi/Notes"))
        .unwrap();
    assert_eq!(
        preferences.allowed_servers().unwrap(),
        [server("claude.ai Noota")]
    );
    let text = std::fs::read_to_string(dir.path().join("preferences.json")).unwrap();
    let kept: serde_json::Value = serde_json::from_str(&text).unwrap();
    assert!(kept["workspaces"][0].get("allowed_mcp_servers").is_none());
}

#[test]
fn the_voice_shortcut_is_written_only_when_it_is_not_the_default() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("preferences.json");
    let preferences = JsonPreferences::new(file.clone());
    preferences
        .save_voice_shortcut(&"Alt+Cmd+E".parse().unwrap())
        .unwrap();
    let text = std::fs::read_to_string(&file).unwrap();
    assert!(text.contains(r#""voice_shortcut": "Alt+Cmd+E""#), "{text}");
    preferences
        .save_voice_shortcut(&"Ctrl+Maj+D".parse().unwrap())
        .unwrap();
    let text = std::fs::read_to_string(&file).unwrap();
    assert!(!text.contains("voice_shortcut"), "{text}");
}

#[test]
fn a_key_alone_is_kept_with_its_side_and_the_old_default_is_still_read() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("preferences.json");
    let preferences = JsonPreferences::new(file.clone());
    preferences
        .save_voice_shortcut(&"Cmd droite".parse().unwrap())
        .unwrap();
    let text = std::fs::read_to_string(&file).unwrap();
    assert!(text.contains(r#""voice_shortcut": "Cmd droite""#), "{text}");
    assert_eq!(
        preferences.voice_shortcut().unwrap().to_string(),
        "Cmd droite"
    );
    let (_dir, old) = written(r#"{ "voice_shortcut": "Ctrl+Maj+D" }"#);
    assert!(old.voice_shortcut().unwrap().is_default());
}

#[test]
fn a_voice_shortcut_that_is_no_longer_valid_counts_as_the_default() {
    for stored in ["D", "Ctrl+Tab", "", "n'importe quoi", "Fn", "Cmd"] {
        let (_dir, preferences) = written(&format!(r#"{{ "voice_shortcut": "{stored}" }}"#));
        assert_eq!(
            preferences.voice_shortcut().unwrap().to_string(),
            "Ctrl+Maj+D",
            "{stored}"
        );
    }
}

#[test]
fn the_voice_beeps_are_written_only_when_they_are_wanted() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("preferences.json");
    let preferences = JsonPreferences::new(file.clone());
    preferences.save_voice_beeps(true).unwrap();
    let text = std::fs::read_to_string(&file).unwrap();
    assert!(text.contains(r#""voice_beeps": true"#), "{text}");
    preferences.save_voice_beeps(false).unwrap();
    let text = std::fs::read_to_string(&file).unwrap();
    assert!(!text.contains("voice_beeps"), "{text}");
}
