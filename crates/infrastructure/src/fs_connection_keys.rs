//! La clé de branchement gardée dans un fichier que seul le compte de l'utilisateur peut lire
//! (fiche 0056), dans le dossier de configuration de l'application : jamais dans un espace de
//! travail, jamais dans les notes, jamais dans le journal.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::PathBuf;

use application::{ConnectionKeys, SecretMaker, StoreError};
use domain::connection_key::ConnectionKey;
use serde::{Deserialize, Serialize};

/// Le fichier est réservé au compte de l'utilisateur dès sa création.
const PRIVATE_FILE: u32 = 0o600;

/// Le nombre d'octets d'aléa d'un secret : 256 bits.
const SECRET_BYTES: usize = 32;

/// L'aléa du système, tel que le Mac le donne.
const RANDOM_SOURCE: &str = "/dev/urandom";

/// La clé telle qu'elle est écrite dans le fichier.
#[derive(Serialize, Deserialize)]
struct Stored {
    secret: String,
    created: String,
}

/// La clé de branchement gardée dans un fichier.
#[derive(Debug)]
pub struct FsConnectionKeys {
    file: PathBuf,
}

impl FsConnectionKeys {
    /// La clé gardée dans `file`, créé à la première clé.
    #[must_use]
    pub fn new(file: PathBuf) -> Self {
        Self { file }
    }
}

fn unavailable(error: &impl std::fmt::Display) -> StoreError {
    StoreError::Unavailable(error.to_string())
}

impl ConnectionKeys for FsConnectionKeys {
    fn load(&self) -> Result<Option<ConnectionKey>, StoreError> {
        let text = match fs::read_to_string(&self.file) {
            Ok(text) => text,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(unavailable(&error)),
        };
        // Un fichier abîmé n'est pas « pas de clé » : l'utilisateur le révoque, puis en crée une.
        let unreadable = || {
            StoreError::Unavailable(
                "le fichier de la clé de branchement est illisible : révoquez la clé, puis \
                 créez-en une autre"
                    .to_owned(),
            )
        };
        let stored: Stored = serde_json::from_str(&text).map_err(|_| unreadable())?;
        ConnectionKey::from_stored(stored.secret, &stored.created)
            .map(Some)
            .ok_or_else(unreadable)
    }

    fn save(&self, key: &ConnectionKey) -> Result<(), StoreError> {
        if let Some(parent) = self.file.parent() {
            fs::create_dir_all(parent).map_err(|e| unavailable(&e))?;
        }
        let text = serde_json::to_string(&Stored {
            secret: key.secret().to_owned(),
            created: key.created_label(),
        })
        .map_err(|e| unavailable(&e))?;
        // Écrite à côté puis renommée : jamais de demi-clé, et jamais lisible par un autre
        // compte, même un instant.
        let temporary = self.file.with_extension("json.enregistrement");
        let written = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(PRIVATE_FILE)
            .open(&temporary)
            .and_then(|mut file| file.write_all(text.as_bytes()))
            .and_then(|()| fs::rename(&temporary, &self.file));
        written.map_err(|e| unavailable(&e))
    }

    fn delete(&self) -> Result<(), StoreError> {
        match fs::remove_file(&self.file) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => Err(unavailable(&error)),
            _ => Ok(()),
        }
    }
}

/// Les secrets tirés de l'aléa du système (`/dev/urandom`), 256 bits écrits en hexadécimal.
#[derive(Debug, Default)]
pub struct SystemSecretMaker;

impl SecretMaker for SystemSecretMaker {
    fn secret(&self) -> Result<String, StoreError> {
        let mut bytes = [0_u8; SECRET_BYTES];
        File::open(RANDOM_SOURCE)
            .and_then(|mut source| source.read_exact(&mut bytes))
            .map_err(|e| unavailable(&e))?;
        Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
    }
}
