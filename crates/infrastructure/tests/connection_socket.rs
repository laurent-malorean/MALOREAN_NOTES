//! La prise de branchement (fiche 0056) : à chemin fixe sous le dossier personnel, ouverte et
//! refermée à la demande, jamais deux fois.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::io::Cursor;
use std::os::unix::net::UnixStream;
use std::sync::Arc;

use application::{ConnectionSocket, StoreError};
use infrastructure::{LineAnswer, PermanentSocket, connection_folder, connection_socket, relay};
use tempfile::TempDir;

fn answering() -> Arc<LineAnswer> {
    Arc::new(|key: &str, line: &str| Some(format!("{key} répond à {line}")))
}

fn talk(home: &TempDir) -> std::io::Result<String> {
    let mut output = Vec::new();
    relay(
        &connection_socket(home.path()),
        "clé",
        Cursor::new("un\n"),
        &mut output,
    )?;
    Ok(String::from_utf8(output).unwrap())
}

#[test]
fn the_socket_has_a_fixed_path_under_the_home_folder() {
    let home = std::path::Path::new("/Users/moi");

    assert_eq!(connection_folder(home), home.join(".malorean-notes"));
    assert_eq!(
        connection_socket(home),
        home.join(".malorean-notes").join("branchement.sock")
    );
}

#[test]
fn the_socket_is_closed_until_it_is_opened_and_closed_again_by_closing() {
    let home = TempDir::new().unwrap();
    let socket = PermanentSocket::new(home.path());
    socket.answer_with(answering());
    assert!(talk(&home).is_err());

    socket.open().unwrap();
    assert_eq!(talk(&home).unwrap(), "clé répond à un\n");

    socket.close();
    assert!(talk(&home).is_err());
    assert!(connection_folder(home.path()).is_dir());
    socket.open().unwrap();
    assert_eq!(talk(&home).unwrap(), "clé répond à un\n");
}

#[test]
fn opening_twice_keeps_the_same_socket_and_closing_twice_is_harmless() {
    let home = TempDir::new().unwrap();
    let socket = PermanentSocket::new(home.path());
    socket.answer_with(answering());
    socket.open().unwrap();
    let open = UnixStream::connect(connection_socket(home.path())).unwrap();

    socket.open().unwrap();

    // La seconde ouverture n'a pas remplacé la prise : la première connexion vit encore.
    assert_eq!(talk(&home).unwrap(), "clé répond à un\n");
    drop(open);
    socket.close();
    socket.close();
    assert!(talk(&home).is_err());
}

#[test]
fn a_socket_nothing_answers_on_is_not_opened() {
    let home = TempDir::new().unwrap();
    let socket = PermanentSocket::new(home.path());

    assert_eq!(
        socket.open(),
        Err(StoreError::Unavailable(
            "rien ne répond sur la prise".to_owned()
        ))
    );
    assert!(!connection_socket(home.path()).exists());
}

#[test]
fn a_socket_that_cannot_be_opened_says_why() {
    let home = TempDir::new().unwrap();
    let first = PermanentSocket::new(home.path());
    first.answer_with(answering());
    first.open().unwrap();
    let second = PermanentSocket::new(home.path());
    second.answer_with(answering());

    let refused = second.open();

    let Err(StoreError::Unavailable(reason)) = refused else {
        unreachable!("la prise est déjà prise : {refused:?}")
    };
    assert!(
        reason.starts_with("la prise de branchement n'a pas pu être ouverte : "),
        "{reason}"
    );
    assert_eq!(talk(&home).unwrap(), "clé répond à un\n");
}
