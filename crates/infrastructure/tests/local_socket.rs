//! La prise locale des outils de l'application et le relais qui la joint (fiche 0040) : un
//! échange complet, la prise réservée au compte de l'utilisateur, et aucun port réseau ouvert.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::io::{BufRead, BufReader, Cursor, Read, Write};
use std::os::unix::fs::{FileTypeExt, PermissionsExt};
use std::os::unix::net::UnixStream;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use infrastructure::{LineAnswer, LocalSocket, SocketPlace, relay};
use tempfile::TempDir;

/// Une prise qui répond à chaque ligne par la clé présentée et la ligne, sauf à `silence`, et
/// garde ce qu'elle a reçu.
fn echoing(parent: &TempDir) -> (LocalSocket, Arc<Mutex<Vec<String>>>) {
    let heard = Arc::new(Mutex::new(Vec::new()));
    let keeping = Arc::clone(&heard);
    let answer: Arc<LineAnswer> = Arc::new(move |key: &str, line: &str| {
        keeping.lock().unwrap().push(format!("{key}:{line}"));
        (line != "silence").then(|| format!("{key} répond à {line}"))
    });
    let socket = SocketPlace::within(parent.path())
        .unwrap()
        .serve(answer)
        .unwrap();
    (socket, heard)
}

#[test]
fn the_relay_carries_each_line_to_the_application_and_each_answer_back() {
    let parent = TempDir::new().unwrap();
    let (socket, heard) = echoing(&parent);
    let mut output = Vec::new();
    let input = Cursor::new("un\nsilence\ndeux\n");
    relay(&socket.path(), "clé", input, &mut output).unwrap();
    assert_eq!(
        String::from_utf8(output).unwrap(),
        "clé répond à un\nclé répond à deux\n"
    );
    assert_eq!(
        *heard.lock().unwrap(),
        ["clé:un", "clé:silence", "clé:deux"]
    );
}

#[test]
fn the_socket_is_a_unix_socket_reserved_to_the_account_of_the_user() {
    let parent = TempDir::new().unwrap();
    let (socket, _) = echoing(&parent);
    let path = socket.path();
    let file = fs::symlink_metadata(&path).unwrap();
    assert!(file.file_type().is_socket());
    assert_eq!(file.permissions().mode() & 0o777, 0o600);
    let folder = fs::metadata(path.parent().unwrap()).unwrap();
    assert_eq!(folder.permissions().mode() & 0o777, 0o700);
    assert!(path.starts_with(parent.path()));
}

#[test]
fn a_closed_socket_is_gone_with_its_folder() {
    let parent = TempDir::new().unwrap();
    let (socket, _) = echoing(&parent);
    let path = socket.path();
    drop(socket);
    assert!(!path.parent().unwrap().exists());
    assert!(UnixStream::connect(&path).is_err());
    assert!(relay(&path, "clé", Cursor::new("un\n"), Vec::new()).is_err());
}

#[test]
fn a_connection_that_says_nothing_or_only_its_key_gets_no_answer() {
    let parent = TempDir::new().unwrap();
    let (socket, heard) = echoing(&parent);
    drop(UnixStream::connect(socket.path()).unwrap());
    let mut connection = UnixStream::connect(socket.path()).unwrap();
    writeln!(connection, "clé").unwrap();
    connection.shutdown(std::net::Shutdown::Write).unwrap();
    let mut answer = String::new();
    BufReader::new(connection).read_line(&mut answer).unwrap();
    assert_eq!(answer, "");
    assert!(heard.lock().unwrap().is_empty());
}

#[test]
fn no_network_port_is_opened_by_the_socket_or_the_relay() {
    let parent = TempDir::new().unwrap();
    let (socket, _) = echoing(&parent);
    let mut output = Vec::new();
    relay(&socket.path(), "clé", Cursor::new("un\n"), &mut output).unwrap();
    // Une connexion reste ouverte pendant qu'on regarde.
    let mut open = UnixStream::connect(socket.path()).unwrap();
    writeln!(open, "clé\ndeux").unwrap();
    let mut answer = String::new();
    BufReader::new(&open).read_line(&mut answer).unwrap();
    assert_eq!(answer, "clé répond à deux\n");
    let pid = std::process::id().to_string();
    // Toutes les prises réseau (IPv4 et IPv6, TCP et UDP) de ce programme : aucune.
    let network = Command::new("/usr/sbin/lsof")
        .args(["-nP", "-a", "-p", &pid, "-i"])
        .output()
        .unwrap();
    assert_eq!(String::from_utf8(network.stdout).unwrap(), "");
    // Les prises Unix du même programme, elles, sont bien vues : le relevé fonctionne.
    let local = Command::new("/usr/sbin/lsof")
        .args(["-nP", "-a", "-p", &pid, "-U"])
        .output()
        .unwrap();
    assert!(!String::from_utf8(local.stdout).unwrap().is_empty());
    drop(open);
}

#[test]
fn the_socket_goes_by_default_in_the_temporary_files_of_the_user_with_a_short_path() {
    let place = SocketPlace::new().unwrap();
    let socket = place.socket();
    assert!(socket.starts_with(std::env::temp_dir()));
    assert!(socket.ends_with("outils.sock"));
    // Le chemin d'une prise Unix tient en 104 octets sur le Mac.
    assert!(socket.as_os_str().len() < 104, "{}", socket.display());
}

fn answering() -> Arc<LineAnswer> {
    Arc::new(|key: &str, line: &str| Some(format!("{key} répond à {line}")))
}

#[test]
fn a_fixed_place_is_created_reserved_to_the_user_and_kept_when_the_socket_closes() {
    let parent = TempDir::new().unwrap();
    let folder = parent.path().join("dedans").join("branchement");

    let socket = SocketPlace::fixed(&folder)
        .unwrap()
        .serve(answering())
        .unwrap();

    let path = socket.path();
    assert_eq!(path, folder.join("branchement.sock"));
    assert!(fs::symlink_metadata(&path).unwrap().file_type().is_socket());
    assert_eq!(
        fs::symlink_metadata(&path).unwrap().permissions().mode() & 0o777,
        0o600
    );
    assert_eq!(
        fs::metadata(&folder).unwrap().permissions().mode() & 0o777,
        0o700
    );
    drop(socket);
    assert!(folder.is_dir());
    assert!(!path.exists());
}

#[test]
fn a_fixed_place_that_exists_with_open_rights_is_reserved_again() {
    let parent = TempDir::new().unwrap();
    fs::set_permissions(parent.path(), fs::Permissions::from_mode(0o755)).unwrap();

    SocketPlace::fixed(parent.path()).unwrap();

    assert_eq!(
        fs::metadata(parent.path()).unwrap().permissions().mode() & 0o777,
        0o700
    );
}

#[test]
fn closing_the_socket_cuts_the_connections_already_open_and_nothing_can_join_it_again() {
    let parent = TempDir::new().unwrap();
    let place = SocketPlace::fixed(parent.path()).unwrap();
    let socket = place.serve(answering()).unwrap();
    let path = socket.path();
    let mut open = UnixStream::connect(&path).unwrap();
    // Une connexion qui ne serait pas coupée ferait échouer le test, au lieu de l'attendre.
    open.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
    writeln!(open, "clé\nun").unwrap();
    let mut lines = BufReader::new(open.try_clone().unwrap());
    let mut first = String::new();
    lines.read_line(&mut first).unwrap();
    assert_eq!(first, "clé répond à un\n");

    drop(socket);

    let mut after = String::new();
    assert_eq!(lines.read_line(&mut after).unwrap(), 0);
    assert!(UnixStream::connect(&path).is_err());
}

#[test]
fn a_socket_can_be_opened_again_in_the_same_place_after_it_closed() {
    let parent = TempDir::new().unwrap();
    for _ in 0..2 {
        let socket = SocketPlace::fixed(parent.path())
            .unwrap()
            .serve(answering())
            .unwrap();
        let mut output = Vec::new();
        relay(&socket.path(), "clé", Cursor::new("un\n"), &mut output).unwrap();
        assert_eq!(String::from_utf8(output).unwrap(), "clé répond à un\n");
    }
}

#[test]
fn a_socket_file_left_by_an_application_that_stopped_badly_is_replaced() {
    let parent = TempDir::new().unwrap();
    let stale = parent.path().join("branchement.sock");
    drop(std::os::unix::net::UnixListener::bind(&stale).unwrap());
    assert!(stale.exists());

    let socket = SocketPlace::fixed(parent.path())
        .unwrap()
        .serve(answering())
        .unwrap();

    let mut output = Vec::new();
    relay(&socket.path(), "clé", Cursor::new("un\n"), &mut output).unwrap();
    assert_eq!(String::from_utf8(output).unwrap(), "clé répond à un\n");
}

#[test]
fn a_socket_that_another_instance_answers_on_is_left_alone() {
    let parent = TempDir::new().unwrap();
    let first = SocketPlace::fixed(parent.path())
        .unwrap()
        .serve(answering())
        .unwrap();

    let second = SocketPlace::fixed(parent.path())
        .unwrap()
        .serve(answering());

    assert_eq!(second.unwrap_err().kind(), std::io::ErrorKind::AddrInUse);
    let mut output = Vec::new();
    relay(&first.path(), "clé", Cursor::new("un\n"), &mut output).unwrap();
    assert_eq!(String::from_utf8(output).unwrap(), "clé répond à un\n");
}

#[test]
fn a_connection_that_has_finished_is_closed_by_the_application_too() {
    let parent = TempDir::new().unwrap();
    let socket = SocketPlace::fixed(parent.path())
        .unwrap()
        .serve(answering())
        .unwrap();
    let mut connection = UnixStream::connect(socket.path()).unwrap();
    // Sans cela, une connexion que l'application garderait ouverte ferait échouer le test au lieu de
    // l'attendre.
    connection
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    writeln!(connection, "clé\nun").unwrap();
    connection.shutdown(std::net::Shutdown::Write).unwrap();

    let mut everything = String::new();
    BufReader::new(connection)
        .read_to_string(&mut everything)
        .unwrap();

    assert_eq!(everything, "clé répond à un\n");
}
