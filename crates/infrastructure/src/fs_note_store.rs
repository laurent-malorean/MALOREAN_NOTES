//! Bibliothèque Markdown sur disque : un fichier `.md` par note, un seul niveau.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use application::{LibraryLocation, LibraryOpener, NoteStore, StoreError, StoredNote};
use domain::{FileName, Modified};

const TEMPORARY_PREFIX: &str = ".";
const TEMPORARY_SUFFIX: &str = ".enregistrement";

/// Les notes d'un dossier de la bibliothèque.
pub struct FsNoteStore {
    root: PathBuf,
}

impl FsNoteStore {
    #[must_use]
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    fn path(&self, name: &FileName) -> PathBuf {
        self.root.join(name.as_str())
    }

    /// Les noms exacts des notes : la casse compte, même sur un disque qui l'ignore.
    fn note_names(&self) -> Result<Vec<FileName>, StoreError> {
        let mut names = Vec::new();
        for entry in fs::read_dir(&self.root).map_err(unavailable)? {
            let entry = entry.map_err(unavailable)?;
            let is_file = entry.file_type().map_err(unavailable)?.is_file();
            let parsed = entry.file_name().to_str().map(FileName::parse);
            if let (true, Some(Ok(name))) = (is_file, parsed) {
                names.push(name);
            }
        }
        Ok(names)
    }

    fn read_existing(&self, name: &FileName) -> Result<StoredNote, StoreError> {
        let path = self.path(name);
        let content = fs::read_to_string(&path).map_err(|e| not_found_or(name, e))?;
        let modified = modified(&path).map_err(|e| not_found_or(name, e))?;
        Ok(StoredNote {
            file_name: name.clone(),
            content,
            modified,
        })
    }
}

impl NoteStore for FsNoteStore {
    fn list(&self) -> Result<Vec<StoredNote>, StoreError> {
        self.note_names()?
            .iter()
            .map(|name| self.read_existing(name))
            .collect()
    }

    fn read(&self, name: &FileName) -> Result<StoredNote, StoreError> {
        if !self.exists(name)? {
            return Err(StoreError::NotFound(name.clone()));
        }
        self.read_existing(name)
    }

    fn write(&self, name: &FileName, content: &str) -> Result<(), StoreError> {
        let temporary = self.root.join(format!(
            "{TEMPORARY_PREFIX}{}{TEMPORARY_SUFFIX}",
            name.as_str()
        ));
        let written =
            fs::write(&temporary, content).and_then(|()| fs::rename(&temporary, self.path(name)));
        written.map_err(|error| {
            // Nettoyage best-effort : l'erreur d'origine est celle que l'on rapporte.
            if let Err(cleanup) = fs::remove_file(&temporary) {
                tracing::debug!(%cleanup, "fichier temporaire déjà absent");
            }
            unavailable(error)
        })
    }

    fn rename(&self, from: &FileName, to: &FileName) -> Result<(), StoreError> {
        if self.exists(to)? {
            return Err(StoreError::AlreadyExists(to.clone()));
        }
        fs::rename(self.path(from), self.path(to)).map_err(|e| not_found_or(from, e))?;
        let old_assets = self.root.join(from.attachment_folder());
        if old_assets.is_dir() {
            fs::rename(old_assets, self.root.join(to.attachment_folder())).map_err(unavailable)?;
        }
        Ok(())
    }

    fn exists(&self, name: &FileName) -> Result<bool, StoreError> {
        Ok(self.note_names()?.contains(name))
    }
}

/// Ouvre une bibliothèque : un dossier existant sur le disque.
pub struct FsLibraryOpener;

impl LibraryOpener for FsLibraryOpener {
    fn open(&self, location: &LibraryLocation) -> Result<Arc<dyn NoteStore>, StoreError> {
        if !location.0.is_dir() {
            return Err(StoreError::Unavailable(format!(
                "le dossier « {} » est introuvable",
                location.0.display()
            )));
        }
        Ok(Arc::new(FsNoteStore::new(location.0.clone())))
    }
}

fn modified(path: &Path) -> io::Result<Modified> {
    let since_epoch = fs::metadata(path)?
        .modified()?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    Ok(Modified(
        u64::try_from(since_epoch.as_millis()).unwrap_or(u64::MAX),
    ))
}

fn not_found_or(name: &FileName, error: io::Error) -> StoreError {
    if error.kind() == io::ErrorKind::NotFound {
        StoreError::NotFound(name.clone())
    } else {
        unavailable(error)
    }
}

fn unavailable(error: io::Error) -> StoreError {
    StoreError::Unavailable(error.to_string())
}
