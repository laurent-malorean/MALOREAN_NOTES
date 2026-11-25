//! La prise de branchement (fiche 0056) : une prise locale à chemin fixe, que l'application
//! ouvre quand une clé de branchement existe et referme quand elle est révoquée. Le chemin fixe
//! est ce qui permet à la commande de branchement d'une IA de la retrouver d'un lancement à
//! l'autre, avec pour seule configuration le programme et la clé.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock, PoisonError};

use application::{ConnectionSocket, StoreError};

use crate::local_socket::{LineAnswer, LocalSocket, SocketPlace};

/// Le dossier de la prise de branchement, dans le dossier personnel de l'utilisateur.
const FOLDER: &str = ".malorean-notes";

/// Le dossier de la prise de branchement du compte dont `home` est le dossier personnel. La
/// commande de branchement le retrouve de la même façon : pas de chemin à copier.
#[must_use]
pub fn connection_folder(home: &Path) -> PathBuf {
    home.join(FOLDER)
}

/// Le chemin de la prise de branchement du compte dont `home` est le dossier personnel.
#[must_use]
pub fn connection_socket(home: &Path) -> PathBuf {
    SocketPlace::path_in(&connection_folder(home))
}

/// La prise de branchement : ouverte et refermée à la demande, répond par ce que lui donne
/// [`PermanentSocket::answer_with`].
pub struct PermanentSocket {
    folder: PathBuf,
    answer: OnceLock<Arc<LineAnswer>>,
    socket: Mutex<Option<LocalSocket>>,
}

impl std::fmt::Debug for PermanentSocket {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PermanentSocket")
            .field("folder", &self.folder)
            .finish_non_exhaustive()
    }
}

impl PermanentSocket {
    /// La prise de branchement du compte dont `home` est le dossier personnel, fermée.
    #[must_use]
    pub fn new(home: &Path) -> Self {
        Self {
            folder: connection_folder(home),
            answer: OnceLock::new(),
            socket: Mutex::new(None),
        }
    }

    /// Dit ce qui répond aux lignes reçues, une fois pour toutes : c'est la session, qui ne
    /// peut être construite qu'après la prise qu'elle ouvre.
    pub fn answer_with(&self, answer: Arc<LineAnswer>) {
        // Une seule réponse est donnée, au lancement ; une seconde serait une erreur de
        // l'assemblage, sans effet sur la première.
        self.answer.set(answer).unwrap_or_default();
    }
}

impl ConnectionSocket for PermanentSocket {
    fn open(&self) -> Result<(), StoreError> {
        let mut socket = self.socket.lock().unwrap_or_else(PoisonError::into_inner);
        if socket.is_some() {
            return Ok(());
        }
        let answer = self
            .answer
            .get()
            .ok_or_else(|| StoreError::Unavailable("rien ne répond sur la prise".to_owned()))?;
        let opened = SocketPlace::fixed(&self.folder)
            .and_then(|place| place.serve(Arc::clone(answer)))
            .map_err(|error| {
                StoreError::Unavailable(format!(
                    "la prise de branchement n'a pas pu être ouverte : {error}"
                ))
            })?;
        *socket = Some(opened);
        Ok(())
    }

    fn close(&self) {
        *self.socket.lock().unwrap_or_else(PoisonError::into_inner) = None;
    }
}
