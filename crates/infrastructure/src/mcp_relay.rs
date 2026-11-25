//! Le relais des outils de l'application (fiches 0040 et 0056) : le petit programme que Claude
//! Code, ou une IA extérieure, lance pour joindre le serveur MCP local. Il relie l'entrée et la
//! sortie de l'IA à la prise locale de l'application, ligne à ligne, après lui avoir présenté la
//! clé. Il ne lit ni ne change rien de ce qui passe ; aucun port réseau. Lancé comme commande de
//! branchement, il retrouve seul la prise de branchement, et dit à l'IA que l'application n'est
//! pas lancée quand personne n'y répond.

use std::io::{self, BufRead, BufReader, Write};
use std::net::Shutdown;
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::thread;

use serde_json::{Value, json};

use crate::permanent_socket::connection_socket;

/// L'option qui fait de l'application le relais : `malorean-notes --relais-mcp <prise> <clé>`.
pub const RELAY_OPTION: &str = "--relais-mcp";

/// L'option qui fait de l'application la commande de branchement d'une IA extérieure :
/// `malorean-notes --brancher <clé>`.
pub const CONNECT_OPTION: &str = "--brancher";

/// Ce que la commande de branchement répond à l'IA quand l'application n'est pas lancée.
const NOT_RUNNING: &str = "MALOREAN Notes n'est pas lancée : ouvrez l'application, puis \
     réessayez (et vérifiez que la clé de branchement existe dans ses réglages)";

/// Le code d'erreur de JSON-RPC rendu quand l'application n'est pas lancée.
const NOT_RUNNING_CODE: i64 = -32002;

/// Relie `input` et `output` (ceux que Claude Code donne au relais) à la prise `socket`, en
/// présentant `key` ; rend la main quand l'entrée est finie et que l'application a tout répondu,
/// ou quand l'application ferme la prise.
///
/// # Errors
///
/// L'erreur du système si la prise ne répond pas, ou si une ligne ne peut pas passer.
pub fn relay(
    socket: &Path,
    key: &str,
    input: impl BufRead,
    output: impl Write + Send,
) -> io::Result<()> {
    relay_over(UnixStream::connect(socket)?, key, input, output)
}

/// La commande de branchement d'une IA extérieure : relie `input` et `output` à la prise de
/// branchement du compte dont `home` est le dossier personnel, avec la clé de branchement `key`.
/// Si l'application n'est pas lancée (personne ne répond sur la prise), répond à chaque demande de
/// l'IA que l'application n'est pas lancée, au lieu de se taire.
///
/// # Errors
///
/// L'erreur du système si une ligne ne peut pas passer.
pub fn connect(
    home: &Path,
    key: &str,
    input: impl BufRead,
    output: impl Write + Send,
) -> io::Result<()> {
    match UnixStream::connect(connection_socket(home)) {
        Ok(connection) => relay_over(connection, key, input, output),
        Err(_) => refuse_all(input, output),
    }
}

/// Répond à chaque demande de `input` (une ligne avec un identifiant) que l'application n'est pas
/// lancée ; une notification n'attend pas de réponse.
fn refuse_all(input: impl BufRead, mut output: impl Write) -> io::Result<()> {
    for line in input.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let id = match serde_json::from_str::<Value>(&line) {
            Ok(request) => match request.get("id") {
                Some(id) => id.clone(),
                None => continue,
            },
            Err(_) => Value::Null,
        };
        let error = json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": NOT_RUNNING_CODE, "message": NOT_RUNNING },
        });
        writeln!(output, "{error}")?;
        output.flush()?;
    }
    Ok(())
}

fn relay_over(
    connection: UnixStream,
    key: &str,
    input: impl BufRead,
    mut output: impl Write + Send,
) -> io::Result<()> {
    let mut writer = connection.try_clone()?;
    writeln!(writer, "{key}")?;
    thread::scope(|scope| {
        let back = scope.spawn(move || -> io::Result<()> {
            for line in BufReader::new(connection).lines() {
                writeln!(output, "{}", line?)?;
                output.flush()?;
            }
            Ok(())
        });
        let forth = (|| -> io::Result<()> {
            for line in input.lines() {
                writeln!(writer, "{}", line?)?;
            }
            writer.shutdown(Shutdown::Write)
        })();
        let back = back
            .join()
            .unwrap_or_else(|_| Err(io::Error::other("le relais s'est arrêté")));
        forth.and(back)
    })
}
