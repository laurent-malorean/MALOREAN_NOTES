//! La clé de branchement sur le vrai disque : gardée pour le seul compte de l'utilisateur,
//! hors de tout espace de travail, relue après un redémarrage ; son secret vient de l'aléa du
//! système.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::os::unix::fs::PermissionsExt;

use application::testing::connection_contract::connection_keys_contract;
use application::{ConnectionKeys, SecretMaker, StoreError};
use domain::Moment;
use domain::connection_key::ConnectionKey;
use infrastructure::{FsConnectionKeys, SystemSecretMaker};
use tempfile::TempDir;

fn key(secret: &str) -> ConnectionKey {
    ConnectionKey::new(secret, Moment::new(2026, 11, 25, 14, 30).unwrap()).unwrap()
}

#[test]
fn the_file_keys_follow_the_contract() {
    let folders = std::sync::Mutex::new(Vec::new());
    connection_keys_contract(|| {
        let folder = TempDir::new().unwrap();
        let keys = FsConnectionKeys::new(folder.path().join("configuration").join("cle.json"));
        folders.lock().unwrap().push(folder);
        keys
    });
}

#[test]
fn the_key_file_can_only_be_read_by_the_user_even_after_a_replacement() {
    let folder = TempDir::new().unwrap();
    let file = folder.path().join("cle.json");
    let keys = FsConnectionKeys::new(file.clone());

    keys.save(&key("première")).unwrap();
    let first = fs::metadata(&file).unwrap().permissions().mode() & 0o777;
    keys.save(&key("seconde")).unwrap();
    let second = fs::metadata(&file).unwrap().permissions().mode() & 0o777;

    assert_eq!((first, second), (0o600, 0o600));
}

#[test]
fn the_key_survives_a_restart_and_leaves_no_temporary_file() {
    let folder = TempDir::new().unwrap();
    let file = folder.path().join("cle.json");
    FsConnectionKeys::new(file.clone())
        .save(&key("secret"))
        .unwrap();

    let reopened = FsConnectionKeys::new(file).load().unwrap().unwrap();

    assert_eq!(reopened.secret(), "secret");
    let names: Vec<_> = fs::read_dir(folder.path())
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .collect();
    assert_eq!(names, ["cle.json"]);
}

#[test]
fn a_damaged_key_file_is_an_error_that_says_what_to_do_and_can_be_revoked() {
    let folder = TempDir::new().unwrap();
    let file = folder.path().join("cle.json");
    let keys = FsConnectionKeys::new(file.clone());
    for damaged in [
        "pas du JSON",
        r#"{"secret":"","created":"2026-11-25 14h30"}"#,
        r#"{"secret":"secret","created":"hier"}"#,
        r#"{"secret":"secret"}"#,
    ] {
        fs::write(&file, damaged).unwrap();

        let loaded = keys.load();

        assert_eq!(
            loaded,
            Err(StoreError::Unavailable(
                "le fichier de la clé de branchement est illisible : révoquez la clé, puis \
                 créez-en une autre"
                    .to_owned()
            )),
            "{damaged}"
        );
        keys.delete().unwrap();
        assert_eq!(keys.load().unwrap(), None);
    }
}

#[test]
fn a_file_that_cannot_be_read_is_unavailable() {
    let folder = TempDir::new().unwrap();
    let file = folder.path().join("cle.json");
    fs::create_dir(&file).unwrap();

    assert!(matches!(
        FsConnectionKeys::new(file).load(),
        Err(StoreError::Unavailable(_))
    ));
}

#[test]
fn a_key_that_cannot_be_written_or_deleted_is_unavailable() {
    let folder = TempDir::new().unwrap();
    let blocked = folder.path().join("cle.json");
    fs::create_dir_all(blocked.join("dedans")).unwrap();
    let keys = FsConnectionKeys::new(blocked);

    assert!(matches!(
        keys.save(&key("secret")),
        Err(StoreError::Unavailable(_))
    ));
    assert!(matches!(keys.delete(), Err(StoreError::Unavailable(_))));
}

#[test]
fn a_system_secret_is_256_bits_in_hexadecimal_and_never_the_same_twice() {
    let maker = SystemSecretMaker;

    let first = maker.secret().unwrap();
    let second = maker.secret().unwrap();

    assert_eq!(first.len(), 64);
    assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
    assert_ne!(first, second);
}
