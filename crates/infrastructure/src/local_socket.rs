//! Prise locale des outils de l'application (fiches 0040 et 0056) : l'application écoute sur une
//! prise Unix rangée dans un dossier que seul le compte de l'utilisateur peut ouvrir ; aucun port
//! réseau. Le relais, lancé par Claude Code, ou la commande de branchement d'une IA extérieure,
//! s'y connecte, présente sa clé sur la première ligne, puis chaque ligne qu'il envoie reçoit sa
//! réponse sur une ligne. Ce que veulent dire les lignes ne regarde pas la prise : elle les donne
//! à qui répond. Lâchée, la prise se ferme : les connexions ouvertes sont coupées.

use std::collections::HashMap;
use std::fs;
use std::io::{self, BufRead, BufReader, Write};
use std::net::Shutdown;
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;

use tempfile::TempDir;

/// Le nom de la prise d'un tour de la colonne Claude Code, dans son dossier neuf.
const TURN_SOCKET_NAME: &str = "outils.sock";

/// Le nom de la prise de branchement, dans son dossier fixe.
const CONNECTION_SOCKET_NAME: &str = "branchement.sock";

/// Le dossier et la prise : seul le compte de l'utilisateur peut les ouvrir.
const PRIVATE_FOLDER: u32 = 0o700;
const PRIVATE_SOCKET: u32 = 0o600;

/// Ce qui répond aux lignes reçues sur la prise : la clé présentée par le relais, la ligne, et la
/// réponse à renvoyer, s'il y en a une.
pub type LineAnswer = dyn Fn(&str, &str) -> Option<String> + Send + Sync;

/// Le dossier de la prise : neuf et effacé avec elle, ou fixe et gardé.
#[derive(Debug)]
enum Folder {
    Temporary(TempDir),
    Fixed(PathBuf),
}

impl Folder {
    fn path(&self) -> &Path {
        match self {
            Self::Temporary(folder) => folder.path(),
            Self::Fixed(folder) => folder,
        }
    }
}

/// Où la prise sera : un dossier réservé au compte de l'utilisateur.
#[derive(Debug)]
pub struct SocketPlace {
    folder: Folder,
    name: &'static str,
}

impl SocketPlace {
    /// Un dossier neuf dans les fichiers temporaires de l'utilisateur (le chemin d'une prise Unix
    /// est court sur le Mac : 104 octets au plus), effacé avec la prise.
    ///
    /// # Errors
    ///
    /// L'erreur du système si le dossier ne peut pas être créé.
    pub fn new() -> io::Result<Self> {
        Self::within(&std::env::temp_dir())
    }

    /// Un dossier neuf dans `parent`, effacé avec la prise.
    ///
    /// # Errors
    ///
    /// L'erreur du système si le dossier ne peut pas être créé ou réservé.
    pub fn within(parent: &Path) -> io::Result<Self> {
        let folder = tempfile::Builder::new()
            .prefix("malorean-outils-")
            .tempdir_in(parent)?;
        fs::set_permissions(folder.path(), fs::Permissions::from_mode(PRIVATE_FOLDER))?;
        Ok(Self {
            folder: Folder::Temporary(folder),
            name: TURN_SOCKET_NAME,
        })
    }

    /// Le dossier fixe de la prise de branchement (fiche 0056), créé s'il manque et réservé au
    /// compte de l'utilisateur ; il reste quand la prise se ferme, pour que la commande de
    /// branchement d'une IA la retrouve au lancement suivant.
    ///
    /// # Errors
    ///
    /// L'erreur du système si le dossier ne peut pas être créé ou réservé.
    pub fn fixed(folder: &Path) -> io::Result<Self> {
        fs::create_dir_all(folder)?;
        fs::set_permissions(folder, fs::Permissions::from_mode(PRIVATE_FOLDER))?;
        Ok(Self {
            folder: Folder::Fixed(folder.to_path_buf()),
            name: CONNECTION_SOCKET_NAME,
        })
    }

    /// Le chemin de la prise.
    #[must_use]
    pub fn socket(&self) -> PathBuf {
        self.folder.path().join(self.name)
    }

    /// Le chemin de la prise de branchement dans le dossier fixe `folder`, sans rien créer.
    #[must_use]
    pub fn path_in(folder: &Path) -> PathBuf {
        folder.join(CONNECTION_SOCKET_NAME)
    }

    /// Ouvre la prise et y répond, sur des fils à part, par `answer`.
    ///
    /// # Errors
    ///
    /// L'erreur du système si la prise ne peut pas être ouverte, ou
    /// [`io::ErrorKind::AddrInUse`] si une autre instance de l'application y répond déjà.
    pub fn serve(self, answer: Arc<LineAnswer>) -> io::Result<LocalSocket> {
        let socket = self.socket();
        let listener = bind(&socket)?;
        fs::set_permissions(&socket, fs::Permissions::from_mode(PRIVATE_SOCKET))?;
        let open = Arc::new(Open::default());
        let accepting = Arc::clone(&open);
        thread::spawn(move || {
            for connection in listener.incoming().map_while(Result::ok) {
                let Some(registered) = accepting.register(&connection) else {
                    break;
                };
                let (answer, open) = (Arc::clone(&answer), Arc::clone(&accepting));
                thread::spawn(move || {
                    if let Err(error) = converse(connection, &*answer) {
                        tracing::warn!(%error, "échange interrompu sur la prise locale");
                    }
                    open.forget(registered);
                });
            }
        });
        Ok(LocalSocket { place: self, open })
    }
}

/// Ouvre la prise `socket`. Un fichier laissé par un lancement qui s'est mal arrêté, auquel
/// personne ne répond, est remplacé ; celui d'une autre instance vivante est respecté.
fn bind(socket: &Path) -> io::Result<UnixListener> {
    if socket.exists() {
        if UnixStream::connect(socket).is_ok() {
            return Err(io::Error::new(
                io::ErrorKind::AddrInUse,
                "une autre instance de l'application répond déjà sur cette prise",
            ));
        }
        fs::remove_file(socket)?;
    }
    UnixListener::bind(socket)
}

/// Les connexions ouvertes sur la prise, pour les couper quand elle se ferme.
#[derive(Debug, Default)]
struct Open {
    state: Mutex<OpenState>,
    next: AtomicU64,
}

#[derive(Debug, Default)]
struct OpenState {
    closed: bool,
    connections: HashMap<u64, UnixStream>,
}

impl Open {
    fn state(&self) -> std::sync::MutexGuard<'_, OpenState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Note une connexion ouverte ; rien si la prise est déjà fermée (la connexion est alors
    /// lâchée, donc coupée).
    fn register(&self, connection: &UnixStream) -> Option<u64> {
        let mut state = self.state();
        if state.closed {
            return None;
        }
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        state.connections.insert(id, connection.try_clone().ok()?);
        Some(id)
    }

    fn forget(&self, id: u64) {
        self.state().connections.remove(&id);
    }

    /// Ferme : plus aucune connexion n'est prise, celles qui sont ouvertes sont coupées.
    fn close(&self) {
        let mut state = self.state();
        state.closed = true;
        for connection in state.connections.values() {
            // Une connexion déjà coupée par l'autre bout n'a plus rien à fermer.
            connection.shutdown(Shutdown::Both).unwrap_or_default();
        }
        state.connections.clear();
    }
}

/// La prise ouverte ; lâchée, elle se ferme : ses connexions sont coupées, son fichier est
/// effacé (avec son dossier, s'il était neuf), et plus rien ne peut la joindre.
#[derive(Debug)]
pub struct LocalSocket {
    place: SocketPlace,
    open: Arc<Open>,
}

impl LocalSocket {
    /// Le chemin de la prise.
    #[must_use]
    pub fn path(&self) -> PathBuf {
        self.place.socket()
    }
}

impl Drop for LocalSocket {
    fn drop(&mut self) {
        self.open.close();
        let socket = self.place.socket();
        // Le fil qui attend une connexion ne voit la fermeture qu'à la suivante : on la lui
        // donne, puis on efface le fichier (un dossier neuf, lui, s'efface avec son propriétaire).
        drop(UnixStream::connect(&socket));
        fs::remove_file(&socket).unwrap_or_default();
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
