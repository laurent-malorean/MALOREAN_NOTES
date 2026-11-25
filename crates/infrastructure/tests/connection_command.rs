//! La commande de branchement d'une IA extérieure (fiche 0056) : elle joint l'application par la
//! prise de branchement, ou dit à l'IA que l'application n'est pas lancée.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::io::Cursor;
use std::sync::Arc;

use application::ConnectionSocket;
use infrastructure::{CONNECT_OPTION, LineAnswer, PermanentSocket, connect};
use serde_json::{Value, json};
use tempfile::TempDir;

fn lines(output: Vec<u8>) -> Vec<Value> {
    String::from_utf8(output)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

#[test]
fn the_option_is_the_one_the_configuration_blocks_give() {
    assert_eq!(CONNECT_OPTION, "--brancher");
}

#[test]
fn with_the_application_running_each_line_goes_through_with_the_key() {
    let home = TempDir::new().unwrap();
    let socket = PermanentSocket::new(home.path());
    let answer: Arc<LineAnswer> =
        Arc::new(|key: &str, line: &str| Some(json!({ "key": key, "line": line }).to_string()));
    socket.answer_with(answer);
    socket.open().unwrap();
    let mut output = Vec::new();

    connect(home.path(), "clé", Cursor::new("un\ndeux\n"), &mut output).unwrap();

    assert_eq!(
        lines(output),
        [
            json!({ "key": "clé", "line": "un" }),
            json!({ "key": "clé", "line": "deux" })
        ]
    );
}

#[test]
fn with_the_application_closed_each_request_is_answered_that_it_is_not_running() {
    let home = TempDir::new().unwrap();
    let input = [
        r#"{"jsonrpc":"2.0","id":0,"method":"initialize"}"#,
        r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
        "",
        r#"{"jsonrpc":"2.0","id":"a","method":"tools/list"}"#,
        "pas du JSON",
    ]
    .join("\n");
    let mut output = Vec::new();

    connect(home.path(), "clé", Cursor::new(input), &mut output).unwrap();

    let message = "MALOREAN Notes n'est pas lancée : ouvrez l'application, puis réessayez (et \
                   vérifiez que la clé de branchement existe dans ses réglages)";
    let error = |id: Value| {
        json!({ "jsonrpc": "2.0", "id": id,
                "error": { "code": -32002, "message": message } })
    };
    assert_eq!(
        lines(output),
        [error(json!(0)), error(json!("a")), error(Value::Null)]
    );
}

#[test]
fn after_the_socket_closed_the_command_says_the_application_is_not_running() {
    let home = TempDir::new().unwrap();
    let socket = PermanentSocket::new(home.path());
    socket.answer_with(Arc::new(|_: &str, _: &str| Some("ok".to_owned())));
    socket.open().unwrap();
    socket.close();
    let mut output = Vec::new();

    connect(home.path(), "clé", Cursor::new("{\"id\":1}\n"), &mut output).unwrap();

    assert_eq!(lines(output)[0]["error"]["code"], -32002);
}
