//! Le relais des outils de l'application (fiche 0040) : le petit programme que Claude Code lance
//! pour joindre le serveur MCP local. Il relie l'entrée et la sortie de Claude Code à la prise
//! locale de l'application, ligne à ligne, après lui avoir présenté la clé du tour. Il ne lit ni
//! ne change rien de ce qui passe ; aucun port réseau.

use std::io::{self, BufRead, BufReader, Write};
use std::net::Shutdown;
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::thread;

/// L'option qui fait de l'application le relais : `malorean-notes --relais-mcp <prise> <clé>`.
pub const RELAY_OPTION: &str = "--relais-mcp";

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
    mut output: impl Write + Send,
) -> io::Result<()> {
    let connection = UnixStream::connect(socket)?;
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
