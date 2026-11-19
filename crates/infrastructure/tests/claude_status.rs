//! Vérification de la connexion de Claude Code et recherche du programme `claude`, avec de faux
//! Claude Code : des scripts qui répondent à `claude auth status --json` comme le vrai. Le vrai
//! `claude` n'est jamais lancé.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::ffi::OsString;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use application::{ClaudeCode, ClaudeStatus};
use infrastructure::{ClaudeCodeCli, claude_folders};
use tempfile::TempDir;

/// La réponse du vrai `claude auth status --json` pour un utilisateur connecté (2.1.311), avec
/// son adresse et son organisation remplacées.
const LOGGED_IN: &str = r#"{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","email":"moi@example.com","orgId":"org-1","orgName":"Moi","subscriptionType":"team"}"#;
const LOGGED_OUT: &str = r#"{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}"#;

/// Écrit dans `folder` un faux `claude` qui note ses arguments, écrit `answer` et sort avec le
/// code `exit` ; rend son chemin.
fn fake_claude(folder: &Path, answer: &str, exit: u8) -> PathBuf {
    let script = folder.join("claude");
    let dir = folder.display();
    fs::write(
        &script,
        format!("#!/bin/sh\nprintf '%s\\n' \"$@\" > '{dir}/args'\necho '{answer}'\nexit {exit}\n"),
    )
    .unwrap();
    fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
    script
}

fn status_of(answer: &str, exit: u8) -> (ClaudeStatus, TempDir) {
    let folder = TempDir::new().unwrap();
    let claude = ClaudeCodeCli::new(fake_claude(folder.path(), answer, exit));
    (claude.status(), folder)
}

#[test]
fn a_logged_in_claude_code_is_ready_and_only_asked_for_its_status() {
    let (status, folder) = status_of(LOGGED_IN, 0);
    assert_eq!(status, ClaudeStatus::Ready);
    let args = fs::read_to_string(folder.path().join("args")).unwrap();
    assert_eq!(args, "auth\nstatus\n--json\n");
}

#[test]
fn a_logged_out_claude_code_says_so_even_when_it_exits_in_error() {
    assert_eq!(status_of(LOGGED_OUT, 1).0, ClaudeStatus::LoggedOut);
}

#[test]
fn an_illegible_answer_means_claude_code_could_not_tell() {
    assert_eq!(status_of("Erreur inattendue", 1).0, ClaudeStatus::Failed);
    assert_eq!(
        status_of(r#"{"authMethod":"none"}"#, 0).0,
        ClaudeStatus::Failed
    );
}

#[test]
fn a_missing_program_means_claude_code_is_missing() {
    let folder = TempDir::new().unwrap();
    let claude = ClaudeCodeCli::new(folder.path().join("claude"));
    assert_eq!(claude.status(), ClaudeStatus::Missing);
}

#[test]
fn a_program_that_cannot_run_means_claude_code_is_missing() {
    let folder = TempDir::new().unwrap();
    let script = fake_claude(folder.path(), LOGGED_IN, 0);
    fs::set_permissions(&script, fs::Permissions::from_mode(0o644)).unwrap();
    assert_eq!(ClaudeCodeCli::new(script).status(), ClaudeStatus::Missing);
}

#[test]
fn claude_code_is_found_in_the_first_folder_that_holds_it() {
    let places = TempDir::new().unwrap();
    let [empty, not_runnable, a_folder, first, second] =
        ["vide", "non-executable", "dossier", "premier", "second"]
            .map(|name| places.path().join(name));
    for folder in [&empty, &not_runnable, &a_folder, &first, &second] {
        fs::create_dir(folder).unwrap();
    }
    fs::set_permissions(
        fake_claude(&not_runnable, LOGGED_OUT, 0),
        fs::Permissions::from_mode(0o644),
    )
    .unwrap();
    fs::create_dir(a_folder.join("claude")).unwrap();
    fake_claude(&first, LOGGED_IN, 0);
    fake_claude(&second, LOGGED_OUT, 0);
    let claude = ClaudeCodeCli::searching([empty, not_runnable, a_folder, first.clone(), second]);
    assert_eq!(claude.status(), ClaudeStatus::Ready);
    assert!(first.join("args").exists());
}

#[test]
fn claude_code_found_in_no_folder_is_missing() {
    let places = TempDir::new().unwrap();
    let claude = ClaudeCodeCli::searching([places.path().to_path_buf()]);
    assert_eq!(claude.status(), ClaudeStatus::Missing);
}

#[test]
fn claude_code_installed_after_the_launch_of_the_application_is_found() {
    let places = TempDir::new().unwrap();
    let claude = ClaudeCodeCli::searching([places.path().to_path_buf()]);
    assert_eq!(claude.status(), ClaudeStatus::Missing);
    fake_claude(places.path(), LOGGED_IN, 0);
    assert_eq!(claude.status(), ClaudeStatus::Ready);
}

#[test]
fn claude_is_looked_for_in_the_known_folders_then_in_the_path() {
    let path = OsString::from("/usr/bin:/Users/moi/bin");
    assert_eq!(
        claude_folders(Some(Path::new("/Users/moi")), Some(&path)),
        [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/Users/moi/.local/bin",
            "/Users/moi/.claude/local",
            "/usr/bin",
            "/Users/moi/bin",
        ]
        .map(PathBuf::from)
    );
}

#[test]
fn without_home_folder_nor_path_only_the_shared_folders_are_known() {
    assert_eq!(
        claude_folders(None, None),
        ["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from)
    );
}
