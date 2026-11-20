//! La prise locale des outils de l'application et le relais qui la joint (fiche 0040) : un
//! échange complet, la prise réservée au compte de l'utilisateur, et aucun port réseau ouvert.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::io::{BufRead, BufReader, Cursor, Write};
use std::os::unix::fs::{FileTypeExt, PermissionsExt};
use std::os::unix::net::UnixStream;
use std::process::Command;
use std::sync::{Arc, Mutex};

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
