//! L'historique sur disque : le dossier caché `.history/` à la racine de l'espace de travail.
//! Chaque note y a un dossier à son propre chemin (`.history/Travail/lundi.md/`), qui contient
//! ses versions, des copies Markdown nommées par leur date (`2026-11-18 14h30.md`), lisibles
//! dans le Finder. L'historique d'une note de la corbeille est dans `.trash/.history/`, et part
//! avec elle quand on la vide.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use application::{History, HistoryOpener, HistoryPlace, StoreError, WorkspaceLocation};
use domain::history::Version;
use domain::{Folder, FolderName, NotePath};

use crate::fs_note_store::TRASH_FOLDER;

/// Le dossier de l'historique : caché, il n'est ni listé, ni cherché, ni indexé, ni surveillé.
const HISTORY_FOLDER: &str = ".history";
const VERSION_EXTENSION: &str = ".md";
/// Une version en cours d'écriture : un fichier caché, qui n'est pas une version.
const TEMPORARY_PREFIX: &str = ".";

/// L'historique des notes d'un espace de travail sur disque.
#[derive(Debug)]
pub struct FsHistory {
    root: PathBuf,
}

impl FsHistory {
    /// L'historique de l'espace de travail dont le dossier est `root`.
    #[must_use]
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    fn base(&self, place: HistoryPlace) -> PathBuf {
        match place {
            HistoryPlace::Workspace => self.root.join(HISTORY_FOLDER),
            HistoryPlace::Trash => self.root.join(TRASH_FOLDER).join(HISTORY_FOLDER),
        }
    }

    fn folder_path(&self, place: HistoryPlace, folder: &Folder) -> PathBuf {
        let mut path = self.base(place);
        path.extend(folder.names().iter().map(FolderName::as_str));
        path
    }

    fn note_path(&self, place: HistoryPlace, note: &NotePath) -> PathBuf {
        self.folder_path(place, note.folder())
            .join(note.name().as_str())
    }

    fn version_path(&self, note: &NotePath, version: &Version) -> PathBuf {
        self.note_path(HistoryPlace::Workspace, note)
            .join(format!("{}{VERSION_EXTENSION}", version.id()))
    }
}

impl History for FsHistory {
    fn versions(&self, note: &NotePath) -> Result<Vec<Version>, StoreError> {
        let entries = match fs::read_dir(self.note_path(HistoryPlace::Workspace, note)) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(unavailable(&error)),
        };
        let mut versions = Vec::new();
        for entry in entries {
            let name = entry.map_err(|e| unavailable(&e))?.file_name();
            let version = name
                .to_str()
                .and_then(|name| name.strip_suffix(VERSION_EXTENSION))
                .and_then(|id| Version::parse(id).ok());
            versions.extend(version);
        }
        Ok(versions)
    }

    fn read_version(&self, note: &NotePath, version: &Version) -> Result<String, StoreError> {
        fs::read_to_string(self.version_path(note, version)).map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                StoreError::VersionNotFound(*version)
            } else {
                unavailable(&error)
            }
        })
    }

    fn write_version(
        &self,
        note: &NotePath,
        version: &Version,
        content: &str,
    ) -> Result<(), StoreError> {
        let folder = self.note_path(HistoryPlace::Workspace, note);
        let temporary = folder.join(format!(
            "{TEMPORARY_PREFIX}{}{VERSION_EXTENSION}",
            version.id()
        ));
        fs::create_dir_all(&folder)
            .and_then(|()| fs::write(&temporary, content))
            .and_then(|()| fs::rename(&temporary, self.version_path(note, version)))
            .map_err(|error| {
                // Nettoyage best-effort : l'erreur d'origine est celle que l'on rapporte.
                if let Err(cleanup) = fs::remove_file(&temporary) {
                    tracing::debug!(%cleanup, "version temporaire déjà absente");
                }
                unavailable(&error)
            })
    }

    fn remove_versions(&self, note: &NotePath, versions: &[Version]) -> Result<(), StoreError> {
        for version in versions {
            match fs::remove_file(self.version_path(note, version)) {
                Err(error) if error.kind() != io::ErrorKind::NotFound => {
                    return Err(unavailable(&error));
                }
                _ => {}
            }
        }
        Ok(())
    }

    fn move_note_versions(
        &self,
        (from_place, from): (HistoryPlace, &NotePath),
        (to_place, to): (HistoryPlace, &NotePath),
    ) -> Result<(), StoreError> {
        merge_into(
            &self.note_path(from_place, from),
            &self.note_path(to_place, to),
        )
        .map_err(|e| unavailable(&e))
    }

    fn move_folder_versions(
        &self,
        (from_place, from): (HistoryPlace, &Folder),
        (to_place, to): (HistoryPlace, &Folder),
    ) -> Result<(), StoreError> {
        merge_into(
            &self.folder_path(from_place, from),
            &self.folder_path(to_place, to),
        )
        .map_err(|e| unavailable(&e))
    }

    fn empty_trash(&self) -> Result<(), StoreError> {
        match fs::remove_dir_all(self.base(HistoryPlace::Trash)) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => Err(unavailable(&error)),
            _ => Ok(()),
        }
    }
}

/// Met le dossier `from` à la place `to` ; si `to` existe déjà, son contenu y est versé, élément
/// par élément (un fichier du même nom est remplacé). Rien à faire si `from` n'existe pas.
fn merge_into(from: &Path, to: &Path) -> io::Result<()> {
    if !from.exists() {
        return Ok(());
    }
    if !to.exists() {
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent)?;
        }
        return fs::rename(from, to);
    }
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            merge_into(&entry.path(), &target)?;
        } else {
            fs::rename(entry.path(), target)?;
        }
    }
    fs::remove_dir(from)
}

/// Ouvre l'historique de chaque espace de travail, dans son propre dossier.
#[derive(Debug, Default, Clone, Copy)]
pub struct FsHistories;

impl HistoryOpener for FsHistories {
    fn open(&self, location: &WorkspaceLocation) -> Result<Arc<dyn History>, StoreError> {
        Ok(Arc::new(FsHistory::new(PathBuf::from(location.as_str()))))
    }
}

fn unavailable(error: &io::Error) -> StoreError {
    StoreError::Unavailable(error.to_string())
}
