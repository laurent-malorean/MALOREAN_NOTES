//! Prise locale des outils de l'application (fiche 0040) : l'application écoute sur une prise
//! Unix rangée dans un dossier que seul le compte de l'utilisateur peut ouvrir ; aucun port
//! réseau. Le relais, lancé par Claude Code, s'y connecte, présente la clé du tour sur la première
//! ligne, puis chaque ligne qu'il envoie reçoit sa réponse sur une ligne. Ce que veulent dire les
//! lignes ne regarde pas la prise : elle les donne à qui répond.

use std::fs;
use std::io::{self, BufRead, BufReader, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;

use tempfile::TempDir;

/// Le nom de la prise dans son dossier.
const SOCKET_NAME: &str = "outils.sock";

/// Le dossier et la prise : seul le compte de l'utilisateur peut les ouvrir.
const PRIVATE_FOLDER: u32 = 0o700;
const PRIVATE_SOCKET: u32 = 0o600;

/// Ce qui répond aux lignes reçues sur la prise : la clé présentée par le relais, la ligne, et la
/// réponse à renvoyer, s'il y en a une.
pub type LineAnswer = dyn Fn(&str, &str) -> Option<String> + Send + Sync;

/// Où la prise sera : un dossier neuf, réservé au compte de l'utilisateur, effacé avec elle.
#[derive(Debug)]
pub struct SocketPlace {
    folder: TempDir,
}

impl SocketPlace {
    /// Un dossier neuf dans les fichiers temporaires de l'utilisateur (le chemin d'une prise Unix
    /// est court sur le Mac : 104 octets au plus).
    ///
    /// # Errors
    ///
    /// L'erreur du système si le dossier ne peut pas être créé.
    pub fn new() -> io::Result<Self> {
        Self::within(&std::env::temp_dir())
    }

    /// Un dossier neuf dans `parent`.
    ///
    /// # Errors
    ///
    /// L'erreur du système si le dossier ne peut pas être créé ou réservé.
    pub fn within(parent: &Path) -> io::Result<Self> {
        let folder = tempfile::Builder::new()
            .prefix("malorean-outils-")
            .tempdir_in(parent)?;
        fs::set_permissions(folder.path(), fs::Permissions::from_mode(PRIVATE_FOLDER))?;
        Ok(Self { folder })
    }

    /// Le chemin de la prise.
    #[must_use]
    pub fn socket(&self) -> PathBuf {
        self.folder.path().join(SOCKET_NAME)
    }

    /// Ouvre la prise et y répond, sur des fils à part, par `answer`.
    ///
    /// # Errors
    ///
    /// L'erreur du système si la prise ne peut pas être ouverte.
    pub fn serve(self, answer: Arc<LineAnswer>) -> io::Result<LocalSocket> {
        let socket = self.socket();
        let listener = UnixListener::bind(&socket)?;
        fs::set_permissions(&socket, fs::Permissions::from_mode(PRIVATE_SOCKET))?;
        thread::spawn(move || {
            for connection in listener.incoming().map_while(Result::ok) {
                let answer = Arc::clone(&answer);
                thread::spawn(move || {
                    if let Err(error) = converse(connection, &*answer) {
                        tracing::warn!(%error, "échange interrompu sur la prise locale");
                    }
                });
            }
        });
        Ok(LocalSocket { place: self })
    }
}

/// La prise ouverte ; lâchée, son dossier est effacé, et plus rien ne peut la joindre.
#[derive(Debug)]
pub struct LocalSocket {
    place: SocketPlace,
}

impl LocalSocket {
    /// Le chemin de la prise.
    #[must_use]
    pub fn path(&self) -> PathBuf {
        self.place.socket()
    }
}

/// Un échange avec un relais : la clé sur la première ligne, puis une réponse par ligne.
fn converse(connection: UnixStream, answer: &LineAnswer) -> io::Result<()> {
    let mut writer = connection.try_clone()?;
    let mut lines = BufReader::new(connection).lines();
    let Some(key) = lines.next().transpose()? else {
        return Ok(());
    };
    for line in lines {
        if let Some(reply) = answer(&key, &line?) {
            writeln!(writer, "{reply}")?;
            writer.flush()?;
        }
    }
    Ok(())
}
