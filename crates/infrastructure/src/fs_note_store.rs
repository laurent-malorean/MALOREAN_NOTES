//! Bibliothèque Markdown sur disque : un fichier `.md` par note, rangé dans des dossiers.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::UNIX_EPOCH;

use application::{LibraryLocation, LibraryOpener, NoteStore, StoreError, StoredNote};
use domain::{FileName, Folder, FolderName, Modified, NotePath};

const TEMPORARY_PREFIX: &str = ".";
const TEMPORARY_SUFFIX: &str = ".enregistrement";

/// Les notes d'un dossier de la bibliothèque.
#[derive(Debug)]
pub struct FsNoteStore {
    root: PathBuf,
}

impl FsNoteStore {
    /// Les notes du dossier `root`.
    #[must_use]
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    fn folder_path(&self, folder: &Folder) -> PathBuf {
        let mut path = self.root.clone();
        path.extend(folder.names().iter().map(FolderName::as_str));
        path
    }

    fn path(&self, note: &NotePath) -> PathBuf {
        self.folder_path(note.folder()).join(note.name().as_str())
    }

    /// Les noms exacts des notes : la casse compte, même sur un disque qui l'ignore.
    fn note_names(&self, folder: &Folder) -> Result<Vec<FileName>, StoreError> {
        let mut names = Vec::new();
        for entry in fs::read_dir(self.folder_path(folder)).map_err(unavailable)? {
            let entry = entry.map_err(unavailable)?;
            let is_file = entry.file_type().map_err(unavailable)?.is_file();
            let parsed = entry.file_name().to_str().map(FileName::parse);
            if let (true, Some(Ok(name))) = (is_file, parsed) {
                names.push(name);
            }
        }
        Ok(names)
    }

    /// Les noms exacts des sous-dossiers de `folder` : ni cachés, ni pièces jointes, ni liens.
    fn sub_folders(&self, folder: &Folder) -> Result<Vec<Folder>, StoreError> {
        let mut folders = Vec::new();
        for entry in fs::read_dir(self.folder_path(folder)).map_err(unavailable)? {
            let entry = entry.map_err(unavailable)?;
            let is_dir = entry.file_type().map_err(unavailable)?.is_dir();
            let name = entry.file_name();
            let parsed = name.to_str().map(|n| (n, FolderName::parse(n)));
            if let (true, Some((written, Ok(name)))) = (is_dir, parsed)
                && name.as_str() == written
            {
                folders.push(folder.join(name));
            }
        }
        Ok(folders)
    }

    /// Vrai si le dossier existe sous ce nom exact (la casse compte).
    fn has_folder(&self, folder: &Folder) -> Result<bool, StoreError> {
        match folder.parent() {
            None => Ok(true),
            Some(parent) => {
                Ok(self.has_folder(&parent)? && self.sub_folders(&parent)?.contains(folder))
            }
        }
    }

    /// Le contenu et la date de la note ; en erreur, la version lisible d'un contenu qui n'est pas en UTF-8.
    fn read_raw(&self, name: &NotePath) -> Result<(Result<String, String>, Modified), StoreError> {
        let path = self.path(name);
        let bytes = fs::read(&path).map_err(|e| not_found_or(name, e))?;
        let modified = modified(&path).map_err(|e| not_found_or(name, e))?;
        let content = String::from_utf8(bytes)
            .map_err(|e| String::from_utf8_lossy(e.as_bytes()).into_owned());
        Ok((content, modified))
    }
}

impl NoteStore for FsNoteStore {
    /// Une note qui n'est pas en UTF-8 reste listée, avec un titre tiré de ce qui est lisible.
    fn list(&self, folder: &Folder) -> Result<Vec<StoredNote>, StoreError> {
        let mut notes = Vec::new();
        for name in self.note_names(folder)? {
            let name = NotePath::new(folder.clone(), name);
            let (content, modified) = self.read_raw(&name)?;
            let content = content.unwrap_or_else(|lossy| lossy);
            notes.push(StoredNote {
                path: name,
                content,
                modified,
            });
        }
        Ok(notes)
    }

    fn read(&self, name: &NotePath) -> Result<StoredNote, StoreError> {
        if !self.note_names(name.folder())?.contains(name.name()) {
            return Err(StoreError::NotFound(name.clone()));
        }
        let (content, modified) = self.read_raw(name)?;
        let content = content.map_err(|_| StoreError::Unreadable(name.clone()))?;
        Ok(StoredNote {
            path: name.clone(),
            content,
            modified,
        })
    }

    fn write(&self, name: &NotePath, content: &str) -> Result<(), StoreError> {
        let temporary = self.folder_path(name.folder()).join(format!(
            "{TEMPORARY_PREFIX}{}{TEMPORARY_SUFFIX}",
            name.name().as_str()
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

    fn rename(&self, from: &NotePath, to: &FileName) -> Result<(), StoreError> {
        let folder = self.folder_path(from.folder());
        let new_assets = folder.join(to.attachment_folder());
        let target = from.renamed(to.clone());
        if self.note_names(from.folder())?.contains(to) || new_assets.exists() {
            return Err(StoreError::AlreadyExists(target));
        }
        fs::rename(self.path(from), self.path(&target)).map_err(|e| not_found_or(from, e))?;
        let old_assets = folder.join(from.name().attachment_folder());
        if old_assets.is_dir() {
            fs::rename(old_assets, new_assets).map_err(unavailable)?;
        }
        Ok(())
    }

    fn names(&self, folder: &Folder) -> Result<Vec<FileName>, StoreError> {
        self.note_names(folder)
    }

    fn folders(&self) -> Result<Vec<Folder>, StoreError> {
        let mut found = Vec::new();
        let mut to_visit = vec![Folder::root()];
        while let Some(folder) = to_visit.pop() {
            for sub in self.sub_folders(&folder)? {
                to_visit.push(sub.clone());
                found.push(sub);
            }
        }
        Ok(found)
    }

    fn create_folder(&self, folder: &Folder) -> Result<(), StoreError> {
        let parent = folder.parent().unwrap_or_else(Folder::root);
        if !self.has_folder(&parent)? {
            return Err(StoreError::FolderNotFound(parent));
        }
        fs::create_dir(self.folder_path(folder)).map_err(|error| {
            if error.kind() == io::ErrorKind::AlreadyExists {
                StoreError::FolderAlreadyExists(folder.clone())
            } else {
                unavailable(error)
            }
        })
    }

    /// Un dossier renommé en changeant seulement la casse (`travail` → `Travail`) n'est pas
    /// un dossier pris, même sur un disque qui ignore la casse.
    fn move_folder(&self, from: &Folder, to: &Folder) -> Result<(), StoreError> {
        let parent = to.parent().unwrap_or_else(Folder::root);
        if !self.has_folder(from)? {
            return Err(StoreError::FolderNotFound(from.clone()));
        }
        if !self.has_folder(&parent)? {
            return Err(StoreError::FolderNotFound(parent));
        }
        let target = self.folder_path(to);
        let same_entry =
            fs::canonicalize(&target).ok() == fs::canonicalize(self.folder_path(from)).ok();
        if target.exists() && !same_entry {
            return Err(StoreError::FolderAlreadyExists(to.clone()));
        }
        fs::rename(self.folder_path(from), target).map_err(unavailable)
    }
}

/// Ouvre une bibliothèque : un dossier existant sur le disque.
#[derive(Debug)]
pub struct FsLibraryOpener;

impl LibraryOpener for FsLibraryOpener {
    fn open(&self, location: &LibraryLocation) -> Result<Arc<dyn NoteStore>, StoreError> {
        let root = PathBuf::from(location.as_str());
        if !root.is_dir() {
            return Err(StoreError::Unavailable(format!(
                "le dossier « {} » est introuvable",
                location.as_str()
            )));
        }
        Ok(Arc::new(FsNoteStore::new(root)))
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

fn not_found_or(name: &NotePath, error: io::Error) -> StoreError {
    if error.kind() == io::ErrorKind::NotFound {
        StoreError::NotFound(name.clone())
    } else {
        unavailable(error)
    }
}

fn unavailable(error: io::Error) -> StoreError {
    StoreError::Unavailable(error.to_string())
}
